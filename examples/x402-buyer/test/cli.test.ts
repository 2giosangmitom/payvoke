import { expect, test } from "bun:test";
import {
  PayvokeError,
  type CatalogItem,
  type HireRequest,
  type Payvoke,
} from "@payvoke/x402-client";
import { generatePrivateKey } from "viem/accounts";
import {
  contentTypeOf,
  describeItem,
  findItem,
  formatUsdc,
  parseArgs,
  parseUsdc,
  resolveArgs,
  run,
} from "../src/cli";

const item: CatalogItem = {
  appId: "app_1",
  appName: "CV Reviewer",
  command: "quick_review",
  description: "Quick review of a pasted CV",
  amount: "500000",
  tiers: [],
  deliverySeconds: 600,
  reviewSeconds: 300,
  inputSchema: {
    type: "object",
    properties: { cv_text: { type: "string", maxLength: 12000 }, goal: { type: "string" } },
    required: ["cv_text"],
  },
  resource: "https://api.test/v1/x402/apps/app_1/commands/quick_review",
  available: true,
};
const tx = `0x${"ab".repeat(32)}` as const;

test("parses USDC, arguments and modes", () => {
  expect(parseUsdc("1.00")).toBe(1_000_000n);
  expect(parseUsdc("0.5")).toBe(500_000n);
  expect(parseUsdc("2")).toBe(2_000_000n);
  expect(() => parseUsdc("1.0000001")).toThrow();
  expect(formatUsdc("500000")).toBe("0.50 USDC");
  expect(formatUsdc(1_234_567n)).toBe("1.234567 USDC");
  expect(parseArgs(["--list"])).toEqual({ kind: "list" });
  expect(parseArgs(["--job", "inv_1"])).toEqual({ kind: "job", invocationId: "inv_1" });
  expect(parseArgs([])).toEqual({ kind: "help" });
  expect(
    parseArgs([
      "CV Reviewer",
      "quick_review",
      "--arg",
      "cv_text=a=b",
      "--arg",
      "goal=Staff",
      "--max",
      "0.75",
    ]),
  ).toEqual({
    kind: "hire",
    app: "CV Reviewer",
    command: "quick_review",
    args: { cv_text: "a=b", goal: "Staff" },
    files: {},
    max: 750_000n,
  });
  expect(
    parseArgs(["app_1", "scan", "--file", "cv=./cv.pdf", "--file", "cv=./more.pdf"]),
  ).toMatchObject({ files: { cv: ["./cv.pdf", "./more.pdf"] } });
  expect(() => parseArgs(["a", "b", "--file", "nopath"])).toThrow();
  expect(() => parseArgs(["a", "b", "--arg", "novalue"])).toThrow();
});

test("reads @file arguments and finds agents by id or name", async () => {
  expect(
    await resolveArgs({ cv_text: "@cv.txt", goal: "@@home" }, async (path) => `file:${path}`),
  ).toEqual({ cv_text: "file:cv.txt", goal: "@home" });
  expect(findItem([item], "app_1", "quick_review")).toBe(item);
  expect(findItem([item], "cv reviewer", "quick_review")).toBe(item);
  expect(() => findItem([item], "CV Reviewer", "deep_review")).toThrow(/quick_review/);
  expect(() => findItem([item], "nobody", "quick_review")).toThrow(/--list/);
});

test("hires through the SDK and prints the challenge, tx link and result", async () => {
  const lines: string[] = [];
  let request: HireRequest | null = null;
  const fake = {
    address: "0x0000000000000000000000000000000000000001",
    signIn: async () => ({ address: "0x0000000000000000000000000000000000000001" }),
    catalog: async () => ({ items: [item], vault: "0xvault" }),
    job: async () => ({}),
    x402Fetch: () => fetch,
    hire: async (r: HireRequest) => {
      request = r;
      await r.onEvent?.({
        type: "challenge",
        invocationId: "inv_1",
        quoteId: "qt_1",
        quoteDigest: `0x${"9".repeat(64)}`,
        amount: "500000",
        vault: "0x1111111111111111111111111111111111111111",
        resource: item.resource,
        validUntil: 1763200000,
        deliveryDeadline: 1763200600,
        quote: {} as never,
      });
      await r.onEvent?.({
        type: "signed",
        invocationId: "inv_1",
        quoteDigest: `0x${"9".repeat(64)}`,
      });
      await r.onEvent?.({ type: "pending", invocationId: "inv_1", transaction: tx });
      await r.onEvent?.({
        type: "held",
        invocationId: "inv_1",
        threadId: "th_1",
        transaction: tx,
        holdId: null,
      });
      await r.onEvent?.({ type: "running", invocationId: "inv_1", executionStatus: "RUNNING" });
      return {
        invocationId: "inv_1",
        threadId: "th_1",
        idempotencyKey: "k",
        amount: "500000",
        paymentStatus: "HELD" as const,
        executionStatus: "DELIVERED" as const,
        transaction: tx,
        result: { artifactVersion: 1, output: "## Review", text: "## Review", files: [] },
      };
    },
  } as unknown as Payvoke;
  const code = await run(
    ["CV Reviewer", "quick_review", "--arg", "cv_text=@cv.txt", "--max", "0.60"],
    {
      env: { BUYER_PRIVATE_KEY: generatePrivateKey(), PAYVOKE_API: "https://api.test" },
      log: (line) => lines.push(line),
      create: () => fake,
      read: async () => "My CV",
    },
  );
  expect(code).toBe(0);
  expect(request!).toMatchObject({
    appId: "app_1",
    command: "quick_review",
    arguments: { cv_text: "My CV" },
    maxAmount: 600_000n,
  });
  const out = lines.join("\n");
  expect(out).toContain("402 Payment Required");
  expect(out).toContain("0.50 USDC");
  expect(out).toContain(`quote digest 0x${"9".repeat(64)}`);
  expect(out).toContain(`https://testnet.snowtrace.io/tx/${tx}`);
  expect(out).toContain("Agent: RUNNING");
  expect(out.endsWith("## Review")).toBe(true);
});

test("explains SDK errors and refuses to hire without a key", async () => {
  const lines: string[] = [];
  const fake = {
    address: "0x0",
    signIn: async () => ({}),
    catalog: async () => ({ items: [item] }),
    hire: async () => {
      throw new PayvokeError("SPEND_CAP_EXCEEDED", 402, null, "inv_9");
    },
  } as unknown as Payvoke;
  const env = { BUYER_PRIVATE_KEY: generatePrivateKey() };
  expect(
    await run(["app_1", "quick_review", "--max", "0.1"], {
      env,
      log: (l) => lines.push(l),
      create: () => fake,
    }),
  ).toBe(1);
  expect(lines.join("\n")).toContain("SPEND_CAP_EXCEEDED");
  expect(lines.join("\n")).toContain("Nothing was signed");
  const missing: string[] = [];
  expect(
    await run(["app_1", "quick_review"], {
      env: {},
      log: (l) => missing.push(l),
      create: () => fake,
    }),
  ).toBe(1);
  expect(missing.join("\n")).toContain("BUYER_PRIVATE_KEY");
});

test("uploads --file arguments and shows price tiers", async () => {
  const scan: CatalogItem = {
    ...item,
    command: "scan",
    tiers: [{ minInputBytes: 20480, amount: "800000" }],
    inputSchema: {
      type: "object",
      properties: { cv: { type: "string", format: "file" } },
      required: ["cv"],
    },
  };
  expect(describeItem(scan)).toContain("bigger inputs: 0.80 USDC from 20 KB");
  expect(describeItem(scan)).toContain("cv: file");
  expect(contentTypeOf("a/b/CV.PDF")).toBe("application/pdf");
  expect(() => contentTypeOf("run.exe")).toThrow(/Unsupported/);
  const lines: string[] = [];
  let request: HireRequest | null = null;
  const fake = {
    address: "0x0000000000000000000000000000000000000001",
    signIn: async () => ({}),
    catalog: async () => ({ items: [scan] }),
    hire: async (r: HireRequest) => {
      request = r;
      await r.onEvent?.({
        type: "uploaded",
        field: "cv",
        fileId: "f_1",
        name: "cv.pdf",
        size: 1500,
      });
      return {
        invocationId: "inv_2",
        threadId: "th_2",
        idempotencyKey: "k",
        amount: "500000",
        paymentStatus: "HELD" as const,
        executionStatus: "DELIVERED" as const,
        transaction: tx,
        result: { artifactVersion: 1, output: "ok", text: "ok", files: [] },
      };
    },
  } as unknown as Payvoke;
  const code = await run(["app_1", "scan", "--file", "cv=docs/cv.pdf"], {
    env: { BUYER_PRIVATE_KEY: generatePrivateKey() },
    log: (line) => lines.push(line),
    create: () => fake,
    readBytes: async () => new Uint8Array(1500),
  });
  expect(code).toBe(0);
  const file = (request! as HireRequest).files!.cv as { name: string; contentType: string };
  expect(file).toMatchObject({ name: "cv.pdf", contentType: "application/pdf" });
  expect(lines.join("\n")).toContain("Uploaded cv.pdf (1.5 KB) for cv");
});
