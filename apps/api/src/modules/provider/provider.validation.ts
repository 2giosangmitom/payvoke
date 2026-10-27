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
export const APP_KINDS = ["TOOL", "AGENT"] as const;
export type AppKind = (typeof APP_KINDS)[number];

export type NewAppBody = {
  name: string;
  description?: string;
  payoutAddress: string;
  visibility?: string;
  kind?: string;
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
  // TOOL: the fixed price. AGENT: the range provider offers must fall within.
  grossAmount?: string;
  minGrossAmount?: string;
  maxGrossAmount?: string;
  terms: unknown;
  outputSchema?: unknown;
  expectedRevisionId?: string;
};

export function parseNewApp(body: Partial<NewAppBody> | undefined) {
  const { name, description, payoutAddress, visibility, kind, clientRequestId } = body ?? {};
  const visible = visibility ?? "PUBLIC";
  const appKind = kind ?? "TOOL";
  if (
    !(APP_KINDS as readonly string[]).includes(appKind) ||
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
      kind: appKind as AppKind,
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
const atomicAmount = (value: unknown) =>
  typeof value === "string" && /^[1-9]\d*$/.test(value) && BigInt(value) <= UINT256_MAX;

// A TOOL command has exactly one fixed price; an AGENT command has none and
// publishes an inclusive range instead.
function parsePricing(input: CommandBody, kind: AppKind) {
  const { grossAmount, minGrossAmount, maxGrossAmount } = input;
  if (kind === "TOOL") {
    if (!atomicAmount(grossAmount) || minGrossAmount !== undefined || maxGrossAmount !== undefined)
      return null;
    return { grossAmount: grossAmount!, minGrossAmount: null, maxGrossAmount: null };
  }
  if (
    grossAmount !== undefined ||
    !atomicAmount(minGrossAmount) ||
    !atomicAmount(maxGrossAmount) ||
    BigInt(minGrossAmount!) > BigInt(maxGrossAmount!)
  )
    return null;
  return { grossAmount: null, minGrossAmount: minGrossAmount!, maxGrossAmount: maxGrossAmount! };
}

// Request-only checks of a command definition. Deployment policy and name
// uniqueness are checked by the command service against the database.
export function parseCommandBody(body: CommandBody | undefined, kind: AppKind) {
  const options = parseCommandOptions(body?.options);
  if (!options || !validCommandName(body!.name) || !text(body!.description, 2000))
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
  if (input.outputSchema !== undefined && !validateCommandInputSchema(input.outputSchema))
    throw new BadRequestError("INVALID_OUTPUT_SCHEMA");
  const pricing = parsePricing(input, kind);
  if (!pricing || !validateTerms(input.terms)) throw new BadRequestError("INVALID_TERMS");
  const terms = normalizeTerms(input.terms as Record<string, unknown>);
  return {
    name: input.name.trim(),
    description: input.description,
    revision: {
      options,
      inputSchema,
      outputSchema: input.outputSchema,
      positionalParameter: positional,
      ...pricing,
      terms,
      deliverySeconds: terms.deliverySeconds as number,
      reviewSeconds: terms.reviewSeconds as number,
    },
  };
}
export type CommandDefinition = ReturnType<typeof parseCommandBody>;
