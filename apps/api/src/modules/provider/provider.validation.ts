import { z } from "zod";
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

const visibility = z.enum(["PUBLIC", "PRIVATE"]);
const appName = z
  .string()
  .refine((value) => text(value, 120))
  .transform((value) => value.trim());
const appDescription = z
  .string()
  .max(2000)
  .transform((value) => value.trim() || null);

export const newAppBody = z
  .object({
    name: appName,
    description: appDescription.optional(),
    visibility: visibility.default("PUBLIC"),
    clientRequestId: z.string().refine((value) => text(value, 128)),
  })
  .transform(({ clientRequestId, description, ...fields }) => ({
    clientRequestId,
    fields: { ...fields, description: description ?? null },
  }));
export type NewApp = z.output<typeof newAppBody>;

export const appPatchBody = z.object({
  name: appName.optional(),
  description: appDescription.nullable().optional(),
  visibility: visibility.optional(),
});
export type AppPatch = z.output<typeof appPatchBody>;
// The first failing field decides the public code.
export const appPatchCodes = {
  name: "INVALID_APP_NAME",
  description: "INVALID_APP_DESCRIPTION",
  visibility: "INVALID_VISIBILITY",
};

// Agent pictures: small raster images, sent as the raw request body.
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const IMAGE_MAX_BYTES = 1024 * 1024;

// App keys never expire, like a bot token: they work until reset or revoked.
export const keyRequestBody = z.object({
  scopes: z
    .array(z.enum(KEY_SCOPES))
    .min(1)
    .refine((scopes) => new Set(scopes).size === scopes.length)
    .default([...KEY_SCOPES]),
});

// Shape of a command definition; the service checks options, schema and terms.
export const commandBody = z
  .object({
    name: z.string(),
    description: z.string(),
    options: z.unknown(),
    positionalParameter: z.string().nullable().optional(),
    // Prices come from the bot's offers; this optional cap bounds them.
    maxAmount: z.string().optional(),
    terms: z.unknown(),
    expectedRevisionId: z.string().optional(),
  })
  .strict();
export type CommandBody = z.infer<typeof commandBody>;
// Unknown keys (path "") and the identity fields fail as INVALID_COMMAND.
export const commandCodes = {
  "": "INVALID_COMMAND",
  name: "INVALID_COMMAND",
  description: "INVALID_COMMAND",
  positionalParameter: "INVALID_POSITIONAL_PARAMETER",
  maxAmount: "INVALID_MAX_AMOUNT",
};
// The whole command list, checked item by item by the service.
export const commandListBody = z.array(z.unknown());

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
