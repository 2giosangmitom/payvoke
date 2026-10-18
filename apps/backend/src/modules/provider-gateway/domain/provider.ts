import { createHash, randomBytes } from "node:crypto";

export type KeyScope = "commands:write" | "gateway:connect";
export interface SlashCommand {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: "string"; maxLength: number; enum?: string[] }>;
    required: string[];
    additionalProperties: false;
  };
}
export class ProviderError extends Error {
  constructor(
    public code:
      | "NOT_FOUND"
      | "CONFLICT"
      | "INVALID_INPUT"
      | "INVALID_KEY"
      | "FORBIDDEN"
      | "CAPACITY"
      | "GATEWAY_BUSY"
      | "SESSION_EXPIRED",
    message: string,
  ) {
    super(message);
  }
}
export function digest(value: unknown): string {
  function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object")
      return `{${Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
        .join(",")}}`;
    return JSON.stringify(value);
  }
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function newApiKey() {
  const secret = `ane_${randomBytes(32).toString("base64url")}`;
  return { secret, hash: digest(secret), prefix: secret.slice(0, 12) };
}
export function validateCommands(commands: SlashCommand[]) {
  if (new Set(commands.map((command) => command.name)).size !== commands.length)
    throw new ProviderError("INVALID_INPUT", "Command names must be unique.");
  for (const command of commands) {
    if (Buffer.byteLength(JSON.stringify(command)) > 16384)
      throw new ProviderError("INVALID_INPUT", "Each command definition must fit within 16 KiB.");
    const { properties, required } = command.inputSchema;
    if (
      new Set(required).size !== required.length ||
      required.some((name) => !Object.hasOwn(properties, name))
    )
      throw new ProviderError(
        "INVALID_INPUT",
        "Required fields must reference declared properties.",
      );
    if (Object.keys(properties).some((name) => !/^[a-z][a-z0-9_]{0,31}$/.test(name)))
      throw new ProviderError("INVALID_INPUT", "Invalid input property name.");
    for (const property of Object.values(properties))
      if (property.enum?.some((value) => value.length > property.maxLength))
        throw new ProviderError("INVALID_INPUT", "Enum values exceed the input limit.");
  }
}
export function validateInput(command: SlashCommand, input: Record<string, string>) {
  if (Buffer.byteLength(JSON.stringify(input)) > 32768)
    throw new ProviderError("INVALID_INPUT", "Encoded command input must fit within 32 KiB.");
  const schema = command.inputSchema;
  if (schema.required.some((name) => !Object.hasOwn(input, name)))
    throw new ProviderError("INVALID_INPUT", "Missing required command input.");
  for (const [key, value] of Object.entries(input)) {
    const property = Object.hasOwn(schema.properties, key) ? schema.properties[key] : undefined;
    if (
      !property ||
      typeof value !== "string" ||
      value.length > property.maxLength ||
      (property.enum && !property.enum.includes(value))
    )
      throw new ProviderError(
        "INVALID_INPUT",
        "Command input does not match the registered schema.",
      );
  }
}
export class ProviderApplication {
  id!: string;
  providerId!: string;
  name!: string;
  currentRevisionId: string | null = null;
  sessionId: string | null = null;
  sessionExpiresAt: Date | null = null;
  createdAt = new Date();
}
export class ProviderApiKey {
  id!: string;
  applicationId!: string;
  label!: string;
  hash!: string;
  prefix!: string;
  scopes!: KeyScope[];
  expiresAt!: Date;
  revokedAt: Date | null = null;
  createdAt = new Date();
}
export class CommandRevision {
  id!: string;
  applicationId!: string;
  digest!: string;
  commands!: SlashCommand[];
  createdAt = new Date();
}
export class CommandInvocation {
  id!: string;
  applicationId!: string;
  revisionId!: string;
  conversationId: string | null = null;
  listingVersionId: string | null = null;
  command!: string;
  input!: Record<string, string>;
  executorId: string | null = null;
  state: "queued" | "running" | "completed" | "failed" | "uncertain" = "queued";
  progress: string | null = null;
  result: string | null = null;
  terminalDigest: string | null = null;
  deadlineAt!: Date;
  createdAt = new Date();
}
export interface GatewayPrincipal {
  keyId: string;
  applicationId: string;
}
