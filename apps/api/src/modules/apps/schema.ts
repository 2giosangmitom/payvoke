import Ajv2020 from "ajv/dist/2020.js";
import { minEvidenceLevels, type MinEvidence } from "@payvoke/payments/evidence";

export const COMMAND_OPTION_TYPES = ["STRING", "INTEGER", "NUMBER", "BOOLEAN", "FILE"] as const;
export type CommandOptionType = (typeof COMMAND_OPTION_TYPES)[number];

export type CommandOption = {
  name: string;
  description?: string;
  type: CommandOptionType;
  required?: boolean;
  choices?: (string | number)[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  // FILE options: allowed MIME types (`image/*` wildcards), size cap, and
  // whether several files may be attached.
  accept?: string[];
  maxBytes?: number;
  multiple?: boolean;
};

// Input schemas may mark a string as an uploaded file id: {format: "file"},
// optionally with `accept` and `maxBytes`, alone or as array items.
const MAX_FILE_ITEMS = 10;
const MIME = /^[a-z]+\/(\*|[\w.+-]+)$/;
export function inputValidator(schema: object) {
  const ajv = new Ajv2020({ strict: true, useDefaults: true, coerceTypes: false });
  ajv.addFormat("file", /^[\w-]{1,128}$/);
  ajv.addKeyword({ keyword: "accept", schemaType: "array" });
  ajv.addKeyword({ keyword: "maxBytes", schemaType: "number" });
  return ajv.compile(schema);
}

export const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;

const NAME = /^[a-z][a-z0-9_]{0,31}$/;
const RESERVED = new Set(["help", "cancel", "status"]);

export function validCommandName(value: unknown): value is string {
  return typeof value === "string" && NAME.test(value) && !RESERVED.has(value);
}

export function checkJsonSchema(value: unknown, depth = 0): boolean {
  if (!record(value) || depth > 6 || JSON.stringify(value).length > 12000) return false;
  const allowed = new Set([
    "$schema",
    "type",
    "additionalProperties",
    "properties",
    "required",
    "items",
    "enum",
    "default",
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "description",
    "title",
    "format",
    "accept",
    "maxBytes",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  if (value.$schema && value.$schema !== "https://json-schema.org/draft/2020-12/schema")
    return false;
  if (!["object", "array", "string", "integer", "number", "boolean"].includes(value.type as string))
    return false;
  if (value.type === "object") {
    if (
      value.additionalProperties !== false ||
      !record(value.properties) ||
      Object.keys(value.properties).length > 32
    )
      return false;
    if (
      !Array.isArray(value.required) ||
      value.required.some(
        (key) => typeof key !== "string" || !(key in (value.properties as object)),
      )
    )
      return false;
    return Object.values(value.properties).every((child) => checkJsonSchema(child, depth + 1));
  }
  if (value.type === "array") {
    return (
      typeof value.maxItems === "number" &&
      Number.isInteger(value.maxItems) &&
      value.maxItems >= 0 &&
      value.maxItems <= 100 &&
      checkJsonSchema(value.items, depth + 1)
    );
  }
  if (value.enum && (!Array.isArray(value.enum) || value.enum.length > 50)) return false;
  if (value.title !== undefined && !text(value.title, 120)) return false;
  if (value.format !== undefined && (value.format !== "file" || value.type !== "string"))
    return false;
  if ((value.accept !== undefined || value.maxBytes !== undefined) && value.format !== "file")
    return false;
  if (
    value.accept !== undefined &&
    (!Array.isArray(value.accept) ||
      !value.accept.length ||
      value.accept.length > 20 ||
      value.accept.some((type) => typeof type !== "string" || !MIME.test(type)))
  )
    return false;
  if (
    value.maxBytes !== undefined &&
    (!Number.isSafeInteger(value.maxBytes) || (value.maxBytes as number) <= 0)
  )
    return false;
  for (const key of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) {
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "number" ||
        !Number.isSafeInteger(value[key]) ||
        (key !== "minimum" && key !== "maximum" && (value[key] as number) < 0))
    )
      return false;
  }
  return true;
}

function compileOption(option: CommandOption): Record<string, unknown> {
  const property: Record<string, unknown> = {};
  if (option.description) property.description = option.description.slice(0, 200);
  if (option.type === "STRING") {
    property.type = "string";
    if (option.minLength !== undefined) property.minLength = option.minLength;
    if (option.maxLength !== undefined) property.maxLength = option.maxLength;
    if (option.choices) property.enum = option.choices.filter((v) => typeof v === "string");
  } else if (option.type === "INTEGER" || option.type === "NUMBER") {
    property.type = option.type === "INTEGER" ? "integer" : "number";
    if (option.min !== undefined) property.minimum = option.min;
    if (option.max !== undefined) property.maximum = option.max;
    if (option.choices) property.enum = option.choices.filter((v) => typeof v === "number");
  } else if (option.type === "FILE") {
    const file: Record<string, unknown> = { type: "string", format: "file" };
    if (option.accept) file.accept = option.accept;
    if (option.maxBytes !== undefined) file.maxBytes = option.maxBytes;
    if (!option.multiple) return { ...property, ...file };
    property.type = "array";
    property.maxItems = MAX_FILE_ITEMS;
    property.items = file;
  } else {
    property.type = "boolean";
  }
  return property;
}

export function parseCommandOptions(value: unknown): CommandOption[] | null {
  if (!Array.isArray(value) || value.length > 25) return null;
  const names = new Set<string>();
  const options: CommandOption[] = [];
  for (const raw of value) {
    if (!record(raw)) return null;
    const { name, description, type, required, choices, min, max, minLength, maxLength } = raw;
    const { accept, maxBytes, multiple } = raw;
    if (
      type !== "FILE" &&
      (accept !== undefined || maxBytes !== undefined || multiple !== undefined)
    )
      return null;
    if (type === "FILE" && (choices !== undefined || min !== undefined || max !== undefined))
      return null;
    if (
      accept !== undefined &&
      (!Array.isArray(accept) ||
        !accept.length ||
        accept.length > 20 ||
        accept.some((item) => typeof item !== "string" || !MIME.test(item)))
    )
      return null;
    if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || (maxBytes as number) <= 0))
      return null;
    if (multiple !== undefined && typeof multiple !== "boolean") return null;
    if (!validCommandName(name) || names.has(name)) return null;
    names.add(name);
    if (!COMMAND_OPTION_TYPES.includes(type as CommandOptionType)) return null;
    if (description !== undefined && (typeof description !== "string" || description.length > 200))
      return null;
    if (required !== undefined && typeof required !== "boolean") return null;
    if (choices !== undefined) {
      if (!Array.isArray(choices) || choices.length < 1 || choices.length > 50) return null;
      if (choices.some((choice) => typeof choice !== "string" && typeof choice !== "number"))
        return null;
      if (type === "BOOLEAN" && choices.length) return null;
      if (type === "STRING" && choices.some((choice) => typeof choice !== "string")) return null;
      if (
        (type === "INTEGER" || type === "NUMBER") &&
        choices.some((choice) => typeof choice !== "number")
      )
        return null;
      if (
        type === "INTEGER" &&
        choices.some((choice) => typeof choice === "number" && !Number.isSafeInteger(choice))
      )
        return null;
    }
    for (const number of [min, max, minLength, maxLength]) {
      if (
        number !== undefined &&
        (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0)
      )
        return null;
    }
    options.push({
      name,
      description: description as string | undefined,
      type: type as CommandOptionType,
      required: required === true,
      choices: choices as (string | number)[] | undefined,
      min: min as number | undefined,
      max: max as number | undefined,
      minLength: minLength as number | undefined,
      maxLength: maxLength as number | undefined,
      ...(type === "FILE"
        ? {
            accept: accept as string[] | undefined,
            maxBytes: maxBytes as number | undefined,
            multiple: multiple === true,
          }
        : {}),
    });
  }
  return options;
}

export function compileCommandInput(options: CommandOption[]) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const option of options) {
    properties[option.name] = compileOption(option);
    if (option.required) required.push(option.name);
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    properties,
    required,
  };
}

export function commandPositional(options: CommandOption[], requested: unknown): string | null {
  if (requested === undefined) {
    // Free-text chat needs a stable single string target. Prefer the first
    // required string, then any string option.
    const first =
      options.find((option) => option.required && option.type === "STRING") ??
      options.find((option) => option.type === "STRING");
    return first?.name ?? null;
  }
  if (requested === null || requested === "") return null;
  if (typeof requested !== "string") return null;
  return options.some((option) => option.name === requested && option.type === "STRING")
    ? requested
    : null;
}

export function validateCommandInputSchema(schema: unknown): boolean {
  if (!checkJsonSchema(schema) || !record(schema) || schema.type !== "object") return false;
  try {
    inputValidator(schema);
    return true;
  } catch {
    return false;
  }
}

// A bot form: a flat object whose fields are scalars, enums, files or arrays
// of files, so the chat can render it without a schema interpreter.
export function validateFormSchema(schema: unknown): boolean {
  if (!validateCommandInputSchema(schema)) return false;
  return Object.values(
    (schema as { properties: Record<string, Record<string, unknown>> }).properties,
  ).every((field) =>
    field.type === "array"
      ? record(field.items) && field.items.format === "file"
      : field.type !== "object",
  );
}

export type FileField = { name: string; multiple: boolean; accept?: string[]; maxBytes?: number };

// The top-level fields of an input schema that hold uploaded file ids.
export function fileFields(schema: unknown): FileField[] {
  if (!record(schema) || !record(schema.properties)) return [];
  const fields: FileField[] = [];
  for (const [name, field] of Object.entries(schema.properties)) {
    if (!record(field)) continue;
    const multiple = field.type === "array";
    const file = multiple ? field.items : field;
    if (!record(file) || file.format !== "file") continue;
    fields.push({
      name,
      multiple,
      accept: file.accept as string[] | undefined,
      maxBytes: file.maxBytes as number | undefined,
    });
  }
  return fields;
}

export function validateTerms(value: unknown): value is Record<string, unknown> {
  if (!record(value)) return false;
  const revision = value.revisionPolicy;
  return (
    Number.isSafeInteger(value.deliverySeconds) &&
    (value.deliverySeconds as number) > 0 &&
    Number.isSafeInteger(value.reviewSeconds) &&
    (value.reviewSeconds as number) >= 0 &&
    record(revision) &&
    Number.isSafeInteger(revision.maxIncluded) &&
    (revision.maxIncluded as number) >= 0 &&
    text(revision.description, 1000) &&
    text(value.refundPolicy, 2000) &&
    text(value.sideEffects, 2000) &&
    text(value.dataUse, 2000) &&
    (value.verification === undefined ||
      (record(value.verification) &&
        Object.keys(value.verification).every((key) => key === "minEvidence") &&
        minEvidenceLevels.includes(value.verification.minEvidence as MinEvidence)))
  );
}

// Terms are stored as signed. Fill the default before the revision is hashed so
// every quote states the evidence floor that gates release.
export function normalizeTerms(value: Record<string, unknown>): Record<string, unknown> {
  return value.verification === undefined
    ? { ...value, verification: { minEvidence: "SIGN" } }
    : value;
}

export const HEARTBEAT_TTL_MS = 45_000;

export function isAvailable(app: {
  status: string;
  lastHeartbeatAt: Date | null;
  defaultCommandId: string | null;
}): boolean {
  return (
    app.status === "ACTIVE" &&
    Boolean(app.defaultCommandId) &&
    Boolean(app.lastHeartbeatAt) &&
    Date.now() - app.lastHeartbeatAt!.getTime() < HEARTBEAT_TTL_MS
  );
}

type SlotQuote = {
  validUntil: Date;
  invocation: {
    executionStatus: string;
    settlement: {
      state: string;
      attempt: { state: string; finalizedAt: Date | null } | null;
    } | null;
  } | null;
};

// A thread holds at most one open invocation. Delivered or failed runs release
// the slot even while funds stay held. Unresolved transactions outlive quote
// expiry; a finalized revert proves the attempt consumed its nonce without a
// hold, and an unattempted rejection releases the slot once the quote expires.
export function threadSlotReleased(active: SlotQuote | null, now = Date.now()): boolean {
  if (!active) return true;
  const status = active.invocation?.executionStatus;
  if (status === "DELIVERED" || status === "FAILED") return true;
  const settlement = active.invocation?.settlement;
  if (
    settlement?.state === "REJECTED" &&
    settlement.attempt?.state === "REVERTED" &&
    settlement.attempt.finalizedAt
  )
    return true;
  const rejectedWithoutAttempt = settlement?.state === "REJECTED" && !settlement.attempt;
  return (!settlement || rejectedWithoutAttempt) && active.validUntil.getTime() <= now;
}

export function availabilityLabel(app: {
  status: string;
  lastHeartbeatAt: Date | null;
  defaultCommandId: string | null;
}): "AVAILABLE" | "UNAVAILABLE" | "SUSPENDED" {
  if (app.status !== "ACTIVE") return "SUSPENDED";
  return isAvailable(app) ? "AVAILABLE" : "UNAVAILABLE";
}
