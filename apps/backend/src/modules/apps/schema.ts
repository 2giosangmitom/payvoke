import Ajv2020 from "ajv/dist/2020.js";

export const COMMAND_OPTION_TYPES = ["STRING", "INTEGER", "NUMBER", "BOOLEAN"] as const;
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
};

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
    new Ajv2020({ strict: true }).compile(schema);
    return true;
  } catch {
    return false;
  }
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
    text(value.dataUse, 2000)
  );
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

export function availabilityLabel(app: {
  status: string;
  lastHeartbeatAt: Date | null;
  defaultCommandId: string | null;
}): "AVAILABLE" | "UNAVAILABLE" | "SUSPENDED" {
  if (app.status !== "ACTIVE") return "SUSPENDED";
  return isAvailable(app) ? "AVAILABLE" : "UNAVAILABLE";
}
