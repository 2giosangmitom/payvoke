import { getAddress, isAddress } from "viem";
import { BadRequestError } from "../../errors";
import {
  commandPositional,
  compileCommandInput,
  normalizeTerms,
  parseCommandOptions,
  text,
  validCommandName,
  validateCommandInputSchema,
  validateTerms,
} from "../apps/schema";

export const KEY_SCOPES = [
  "products:write",
  "events:read",
  "events:ack",
  "reports:write",
  "files:write",
  "messages:write",
  "offers:write",
] as const;
export type KeyScope = (typeof KEY_SCOPES)[number];

const visibilities = ["PUBLIC", "PRIVATE"];

export type NewAppBody = {
  name: string;
  description?: string;
  payoutAddress: string;
  visibility?: string;
  clientRequestId: string;
};
export type AppPatchBody = {
  name?: string;
  description?: string | null;
  visibility?: string;
  payoutAddress?: string;
};
export type KeyRequestBody = { scopes?: string[]; expiresAt?: string };
export type CommandBody = {
  name: string;
  description: string;
  options: unknown;
  positionalParameter?: string | null;
  // Prices come from the bot's offers; this optional cap bounds them.
  maxAmount?: string;
  terms: unknown;
  expectedRevisionId?: string;
};

export function parseNewApp(body: Partial<NewAppBody> | undefined) {
  const { name, description, payoutAddress, visibility, clientRequestId } = body ?? {};
  const visible = visibility ?? "PUBLIC";
  if (
    !text(name, 120) ||
    (description !== undefined && typeof description !== "string") ||
    (description && description.length > 2000) ||
    !isAddress(payoutAddress as string) ||
    !visibilities.includes(visible) ||
    !text(clientRequestId, 128)
  )
    throw new BadRequestError("INVALID_APP");
  return {
    clientRequestId,
    fields: {
      name: name.trim(),
      description: description?.trim() || null,
      payoutAddress: getAddress(payoutAddress as string),
      visibility: visible,
    },
  };
}

export function parseAppPatch(body: AppPatchBody | undefined) {
  const patch = body ?? {};
  if (patch.name !== undefined && !text(patch.name, 120))
    throw new BadRequestError("INVALID_APP_NAME");
  if (
    patch.description !== undefined &&
    patch.description !== null &&
    (typeof patch.description !== "string" || patch.description.length > 2000)
  )
    throw new BadRequestError("INVALID_APP_DESCRIPTION");
  if (patch.visibility !== undefined && !visibilities.includes(patch.visibility))
    throw new BadRequestError("INVALID_VISIBILITY");
  if (patch.payoutAddress !== undefined && !isAddress(patch.payoutAddress))
    throw new BadRequestError("INVALID_PAYOUT");
  return {
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
    ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
    ...(patch.payoutAddress !== undefined
      ? { payoutAddress: getAddress(patch.payoutAddress) }
      : {}),
  };
}

export function parsePayout(body: { payoutAddress?: string } | undefined) {
  if (!isAddress(body?.payoutAddress as string)) throw new BadRequestError("INVALID_PAYOUT");
  return getAddress(body!.payoutAddress!);
}

const DAY_MS = 86_400_000;

export function parseKeyRequest(body: KeyRequestBody | undefined, now = Date.now()) {
  const scopes = body?.scopes ?? [...KEY_SCOPES];
  const expiry = new Date(body?.expiresAt ?? new Date(now + 90 * DAY_MS).toISOString());
  if (
    !Array.isArray(scopes) ||
    !scopes.length ||
    scopes.some((scope) => !(KEY_SCOPES as readonly string[]).includes(scope)) ||
    new Set(scopes).size !== scopes.length ||
    !Number.isFinite(expiry.getTime()) ||
    expiry.getTime() <= now ||
    expiry.getTime() > now + 365 * DAY_MS
  )
    throw new BadRequestError("INVALID_KEY_REQUEST");
  return { scopes, expiresAt: expiry };
}

const UINT256_MAX = (1n << 256n) - 1n;
const atomicAmount = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9]\d*$/.test(value) && BigInt(value) <= UINT256_MAX;
const COMMAND_KEYS = new Set([
  "name",
  "description",
  "options",
  "positionalParameter",
  "maxAmount",
  "terms",
  "expectedRevisionId",
]);

// Request-only checks of a command definition. Deployment policy and name
// uniqueness are checked by the command service against the database.
export function parseCommandBody(body: CommandBody | undefined) {
  const options = parseCommandOptions(body?.options);
  if (
    !options ||
    !validCommandName(body!.name) ||
    !text(body!.description, 2000) ||
    Object.keys(body!).some((key) => !COMMAND_KEYS.has(key))
  )
    throw new BadRequestError("INVALID_COMMAND");
  const input = body!;
  if (!options.length) throw new BadRequestError("COMMAND_OPTIONS_REQUIRED");
  const inputSchema = compileCommandInput(options);
  if (!validateCommandInputSchema(inputSchema)) throw new BadRequestError("INVALID_COMMAND_SCHEMA");
  const positional = commandPositional(options, input.positionalParameter);
  if (
    input.positionalParameter !== undefined &&
    input.positionalParameter !== null &&
    (typeof input.positionalParameter !== "string" ||
      (input.positionalParameter !== "" && positional === null))
  )
    throw new BadRequestError("INVALID_POSITIONAL_PARAMETER");
  if (input.maxAmount !== undefined && !atomicAmount(input.maxAmount))
    throw new BadRequestError("INVALID_MAX_AMOUNT");
  if (!validateTerms(input.terms)) throw new BadRequestError("INVALID_TERMS");
  const terms = normalizeTerms(input.terms as Record<string, unknown>);
  return {
    name: input.name.trim(),
    description: input.description,
    revision: {
      options,
      inputSchema,
      positionalParameter: positional,
      maxGrossAmount: input.maxAmount ?? null,
      terms,
      deliverySeconds: terms.deliverySeconds as number,
      reviewSeconds: terms.reviewSeconds as number,
    },
  };
}
export type CommandDefinition = ReturnType<typeof parseCommandBody>;
