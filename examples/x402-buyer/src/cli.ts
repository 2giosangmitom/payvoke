import { readFile } from "node:fs/promises";
import {
  PayvokeError,
  createPayvoke,
  type CatalogItem,
  type FileInput,
  type HireEvent,
  type Payvoke,
  type PayvokeOptions,
} from "@payvoke/x402-client";
import { isHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const USAGE = `Hire a Payvoke agent over x402 (escrowed USDC on Avalanche Fuji).

Usage:
  bun start --list
  bun start <appId|appName> <command> [--arg key=value ...] [--file key=path ...] [--max 1.00]
  bun start --job <invocationId>

Options:
  --arg key=value   A command argument. key=@path reads the value from a file.
  --file key=path   Upload a file for a FILE argument (repeat the key for several).
  --max 1.00        Spend cap in USDC (default 1.00). Nothing above it is signed.
  --list            Print the instant-command catalog.
  --job <id>        Print a job's status and result.

Environment:
  PAYVOKE_API           API origin (default https://payvoke.up.railway.app)
  BUYER_PRIVATE_KEY     Buyer wallet key (0x…). Signs in and signs the payment.
  PAYVOKE_ACCESS_TOKEN  Optional buyer token (pvb_…) used instead of SIWE.
  PAYVOKE_WEB_ORIGIN    Optional web origin for SIWE, if not the API origin.`;

export type Command =
  | { kind: "help" }
  | { kind: "list" }
  | { kind: "job"; invocationId: string }
  | {
      kind: "hire";
      app: string;
      command: string;
      args: Record<string, string>;
      files: Record<string, string[]>;
      max: bigint;
    };

// "1.00" USDC -> 1_000_000n atomic units (6 decimals).
export function parseUsdc(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid USDC amount: ${value}`);
  return BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"));
}

export function formatUsdc(atomic: string | bigint): string {
  const value = BigInt(atomic);
  const cents = (value % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0{1,4}$/, "");
  return `${value / 1_000_000n}.${cents.padEnd(2, "0")} USDC`;
}

export const snowtrace = (hash: string) => `https://testnet.snowtrace.io/tx/${hash}`;

export function parseArgs(argv: string[]): Command {
  const positional: string[] = [];
  const args: Record<string, string> = {};
  const files: Record<string, string[]> = {};
  let max = 1_000_000n;
  let list = false;
  let job: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${token} needs a value`);
      return next;
    };
    if (token === "--help" || token === "-h") return { kind: "help" };
    else if (token === "--list") list = true;
    else if (token === "--job") job = value();
    else if (token === "--max") max = parseUsdc(value());
    else if (token === "--arg") {
      const pair = value();
      const split = pair.indexOf("=");
      if (split <= 0) throw new Error(`--arg expects key=value, got ${pair}`);
      args[pair.slice(0, split)] = pair.slice(split + 1);
    } else if (token === "--file") {
      const pair = value();
      const split = pair.indexOf("=");
      if (split <= 0) throw new Error(`--file expects key=path, got ${pair}`);
      (files[pair.slice(0, split)] ??= []).push(pair.slice(split + 1));
    } else if (token.startsWith("--")) throw new Error(`Unknown option ${token}`);
    else positional.push(token);
  }
  if (list) return { kind: "list" };
  if (job) return { kind: "job", invocationId: job };
  if (positional.length !== 2) return { kind: "help" };
  if (max <= 0n) throw new Error("--max must be above 0");
  return { kind: "hire", app: positional[0], command: positional[1], args, files, max };
}

// key=@path reads the file; `@@` escapes a literal leading `@`.
export async function resolveArgs(
  args: Record<string, string>,
  read: (path: string) => Promise<string> = (path) => readFile(path, "utf8"),
) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(args))
    out[key] = value.startsWith("@@")
      ? value.slice(1)
      : value.startsWith("@")
        ? await read(value.slice(1))
        : value;
  return out;
}

// By id first, then by exact (case-insensitive) app name.
export function findItem(items: CatalogItem[], app: string, command: string) {
  const byId = items.filter((item) => item.appId === app);
  const candidates = byId.length
    ? byId
    : items.filter((item) => item.appName.toLowerCase() === app.toLowerCase());
  if (!candidates.length) throw new Error(`No agent "${app}" in the x402 catalog (try --list)`);
  const item = candidates.find((entry) => entry.command === command);
  if (!item)
    throw new Error(
      `${candidates[0].appName} has no instant command "${command}" (has: ${candidates.map((c) => c.command).join(", ")})`,
    );
  return item;
}

type SchemaField = {
  type?: string;
  format?: string;
  maxLength?: number;
  items?: { format?: string };
};

export function describeItem(item: CatalogItem) {
  const schema = item.inputSchema as {
    properties?: Record<string, SchemaField>;
    required?: string[];
  };
  const kind = (field: SchemaField) =>
    field.format === "file" ? "file" : field.items?.format === "file" ? "files" : field.type;
  const fields = Object.entries(schema.properties ?? {}).map(
    ([name, field]) =>
      `${name}${schema.required?.includes(name) ? "" : "?"}: ${kind(field) ?? "any"}${field.maxLength ? ` (max ${field.maxLength})` : ""}`,
  );
  const tiers = (item.tiers ?? []).map(
    (tier) => `${formatUsdc(tier.amount)} from ${formatBytes(tier.minInputBytes)}`,
  );
  return [
    `${item.appName} /${item.command}  ${formatUsdc(item.amount)}${item.available ? "" : "  [offline]"}`,
    ...(tiers.length ? [`  bigger inputs: ${tiers.join(", ")}`] : []),
    `  ${item.description}`,
    `  app ${item.appId} · delivery ${item.deliverySeconds}s · review ${item.reviewSeconds}s`,
    `  arguments: ${fields.join(", ") || "none"}`,
  ].join("\n");
}

// Binary units, like the web app: 1 KB = 1024 bytes.
export const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${+(bytes / (1024 * 1024)).toFixed(1)} MB`
    : bytes >= 1024
      ? `${+(bytes / 1024).toFixed(1)} KB`
      : `${bytes} B`;

// Content types the API accepts for buyer files, by extension.
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  json: "application/json",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
};
export function contentTypeOf(path: string) {
  const type = TYPES[path.split(".").pop()?.toLowerCase() ?? ""];
  if (!type) throw new Error(`Unsupported file type: ${path}`);
  return type;
}

const time = (unix: number) => new Date(unix * 1000).toISOString();

export function describeEvent(event: HireEvent): string[] {
  switch (event.type) {
    case "challenge":
      return [
        "402 Payment Required (payvoke-escrow)",
        `  amount       ${formatUsdc(event.amount)}`,
        `  pay to vault ${event.vault}`,
        `  quote        ${event.quoteId}`,
        `  quote digest ${event.quoteDigest}`,
        `  resource     ${event.resource}`,
        `  valid until  ${time(event.validUntil)} · deliver by ${time(event.deliveryDeadline)}`,
      ];
    case "uploaded":
      return [`Uploaded ${event.name} (${formatBytes(event.size)}) for ${event.field}`];
    case "signed":
      return [
        `Signed USDC ReceiveWithAuthorization (nonce = quote digest), sent PAYMENT-SIGNATURE`,
      ];
    case "pending":
      return event.transaction
        ? [`Hold funding tx ${event.transaction}`, `  ${snowtrace(event.transaction)}`]
        : [`Payment accepted, hold pending on chain…`];
    case "held":
      return [
        `Escrow HELD${event.holdId ? ` (hold ${event.holdId})` : ""}`,
        ...(event.transaction ? [`  ${snowtrace(event.transaction)}`] : []),
        `  job ${event.invocationId} · thread ${event.threadId}`,
      ];
    case "running":
      return [`Agent: ${event.executionStatus}`];
    case "delivered":
      return [`Delivered.`];
    case "failed":
      return [`Job failed${event.reason ? `: ${event.reason}` : ""}. The vault refunds the hold.`];
    case "refunded":
      return [`Hold refunded to the buyer.`];
  }
}

export type Env = Record<string, string | undefined>;
export type Deps = {
  env: Env;
  log: (line: string) => void;
  create?: (options: PayvokeOptions) => Payvoke;
  read?: (path: string) => Promise<string>;
  readBytes?: (path: string) => Promise<Uint8Array>;
};

// "catalog" is public; "read" needs a session (key or token); "pay" needs the key.
function client(deps: Deps, need: "catalog" | "read" | "pay") {
  const { env } = deps;
  const key = env.BUYER_PRIVATE_KEY?.trim();
  if (!key || !isHex(key) || key.length !== 66) {
    if (need === "pay" || (need === "read" && !env.PAYVOKE_ACCESS_TOKEN))
      throw new Error("Set BUYER_PRIVATE_KEY to the buyer wallet's private key (0x + 64 hex)");
  }
  // Calls that sign nothing still need an address; this one never signs.
  const account = privateKeyToAccount(
    key && isHex(key) && key.length === 66 ? (key as Hex) : `0x${"1".padStart(64, "0")}`,
  );
  return (deps.create ?? createPayvoke)({
    baseUrl: env.PAYVOKE_API || "https://payvoke.up.railway.app",
    account,
    accessToken: env.PAYVOKE_ACCESS_TOKEN || undefined,
    webOrigin: env.PAYVOKE_WEB_ORIGIN || undefined,
  });
}

export async function run(argv: string[], deps: Deps): Promise<number> {
  const { log } = deps;
  let command: Command;
  try {
    command = parseArgs(argv);
  } catch (error) {
    log(String(error instanceof Error ? error.message : error));
    log(USAGE);
    return 2;
  }
  if (command.kind === "help") {
    log(USAGE);
    return 0;
  }
  try {
    if (command.kind === "list") {
      const catalog = await client(deps, "catalog").catalog();
      log(`x402 catalog · vault ${catalog.vault} · ${catalog.network}`);
      for (const item of catalog.items) log(describeItem(item));
      if (!catalog.items.length) log("No instant commands right now.");
      return 0;
    }
    const payvoke = client(deps, command.kind === "hire" ? "pay" : "read");
    if (command.kind === "job") {
      const job = await payvoke.job(command.invocationId);
      log(
        `Job ${job.invocationId}: payment ${job.paymentStatus}, execution ${job.executionStatus}`,
      );
      if (job.transaction) log(`  ${snowtrace(job.transaction)}`);
      if (job.result) log(String(job.result.text ?? JSON.stringify(job.result.output, null, 2)));
      return 0;
    }
    const { items } = await payvoke.catalog();
    const item = findItem(items, command.app, command.command);
    log(describeItem(item));
    log(`Spend cap: ${formatUsdc(command.max)}`);
    log(`Signing in as ${payvoke.address}…`);
    await payvoke.signIn();
    const readBytes = deps.readBytes ?? ((path: string) => readFile(path));
    const files: Record<string, FileInput[]> = {};
    for (const [field, paths] of Object.entries(command.files))
      files[field] = await Promise.all(
        paths.map(async (path) => ({
          name: path.split("/").pop()!,
          contentType: contentTypeOf(path),
          data: await readBytes(path),
        })),
      );
    // A single-file field takes one file, a multi-file field an array.
    const schema = item.inputSchema as { properties?: Record<string, { type?: string }> };
    const upload = Object.fromEntries(
      Object.entries(files).map(([field, list]) => [
        field,
        schema.properties?.[field]?.type === "array" ? list : list[0],
      ]),
    );
    const job = await payvoke.hire({
      appId: item.appId,
      command: item.command,
      arguments: await resolveArgs(command.args, deps.read),
      files: upload,
      maxAmount: command.max,
      onEvent: (event) => {
        for (const line of describeEvent(event)) log(line);
      },
    });
    log(`Result (${job.executionStatus}, invocation ${job.invocationId}):`);
    if (job.result) log(String(job.result.text ?? JSON.stringify(job.result.output, null, 2)));
    else if (job.executionStatus === "DELIVERED")
      log(`(Delivered, but the result is not readable yet: bun start --job ${job.invocationId})`);
    return job.executionStatus === "DELIVERED" ? 0 : 1;
  } catch (error) {
    if (error instanceof PayvokeError) {
      log(`Payvoke error ${error.code}${error.status ? ` (HTTP ${error.status})` : ""}`);
      if (error.invocationId) log(`  invocation ${error.invocationId}`);
      if (error.code === "SPEND_CAP_EXCEEDED")
        log(`  The quote asks more than --max. Nothing was signed.`);
      if (error.code === "insufficient_balance")
        log(`  Get Fuji test USDC at https://faucet.circle.com`);
    } else log(String(error instanceof Error ? error.message : error));
    return 1;
  }
}
