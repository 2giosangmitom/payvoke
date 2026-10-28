import type { Prisma } from "#core/db";
import { BadRequestError } from "../../errors";
import { record, text, validateFormSchema } from "../apps/schema";
import { effectiveArguments } from "../quotes/arguments";

// Built-in tools a provider opens in the buyer's chat, before payment (a
// message's `tool`) or during a run (a `tool_call` report). Each one renders as
// a Payvoke component and waits for exactly one buyer result.
export const TOOL_NAMES = ["ask_form", "ask_choice", "confirm"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export type AskForm = {
  title: string;
  description?: string;
  schema: Prisma.JsonValue;
  submitLabel?: string;
};
export type AskChoice = {
  prompt: string;
  options: { id: string; label: string; description?: string }[];
  multiple: boolean;
  minSelections: number;
  maxSelections: number;
};
export type Confirm = {
  title: string;
  description?: string;
  details: { label: string; value: string }[];
  confirmLabel?: string;
  cancelLabel?: string;
  variant: "default" | "destructive";
};
export type ToolCall =
  | { name: "ask_form"; args: AskForm }
  | { name: "ask_choice"; args: AskChoice }
  | { name: "confirm"; args: Confirm };

const OPTION_ID = /^[\w-]{1,64}$/;
const MAX_OPTIONS = 12;
const MAX_DETAILS = 8;

const invalid = () => new BadRequestError("INVALID_TOOL_CALL");
const onlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const optionalText = (value: unknown, max: number) => value === undefined || text(value, max);
const trimmed = <T extends string | undefined>(value: T) => value?.trim() as T;
const count = (value: unknown, fallback: number) =>
  value === undefined ? fallback : Number.isSafeInteger(value) ? (value as number) : NaN;

function askForm(args: Record<string, unknown>): AskForm {
  const { title, description, schema, submitLabel } = args;
  if (
    !onlyKeys(args, ["title", "description", "schema", "submitLabel"]) ||
    !text(title, 120) ||
    !optionalText(description, 1000) ||
    !optionalText(submitLabel, 40) ||
    !validateFormSchema(schema)
  )
    throw invalid();
  return {
    title: title.trim(),
    ...(description !== undefined ? { description: trimmed(description as string) } : {}),
    schema: schema as Prisma.JsonValue,
    ...(submitLabel !== undefined ? { submitLabel: trimmed(submitLabel as string) } : {}),
  };
}

function askChoice(args: Record<string, unknown>): AskChoice {
  const { prompt, options, multiple = false } = args;
  if (
    !onlyKeys(args, ["prompt", "options", "multiple", "minSelections", "maxSelections"]) ||
    !text(prompt, 500) ||
    typeof multiple !== "boolean" ||
    !Array.isArray(options) ||
    options.length < 2 ||
    options.length > MAX_OPTIONS
  )
    throw invalid();
  const parsed = options.map((option) => {
    if (
      !record(option) ||
      !onlyKeys(option, ["id", "label", "description"]) ||
      typeof option.id !== "string" ||
      !OPTION_ID.test(option.id) ||
      !text(option.label, 120) ||
      !optionalText(option.description, 300)
    )
      throw invalid();
    return {
      id: option.id,
      label: option.label.trim(),
      ...(option.description !== undefined
        ? { description: (option.description as string).trim() }
        : {}),
    };
  });
  if (new Set(parsed.map((option) => option.id)).size !== parsed.length) throw invalid();
  const min = count(args.minSelections, 1);
  const max = count(args.maxSelections, multiple ? parsed.length : 1);
  if (!(min >= 1 && max >= min && max <= parsed.length) || (!multiple && max !== 1))
    throw invalid();
  return {
    prompt: prompt.trim(),
    options: parsed,
    multiple,
    minSelections: min,
    maxSelections: max,
  };
}

function confirm(args: Record<string, unknown>): Confirm {
  const { title, description, details = [], confirmLabel, cancelLabel, variant = "default" } = args;
  if (
    !onlyKeys(args, [
      "title",
      "description",
      "details",
      "confirmLabel",
      "cancelLabel",
      "variant",
    ]) ||
    !text(title, 160) ||
    !optionalText(description, 1000) ||
    !optionalText(confirmLabel, 40) ||
    !optionalText(cancelLabel, 40) ||
    (variant !== "default" && variant !== "destructive") ||
    !Array.isArray(details) ||
    details.length > MAX_DETAILS
  )
    throw invalid();
  return {
    title: title.trim(),
    ...(description !== undefined ? { description: trimmed(description as string) } : {}),
    details: details.map((detail) => {
      if (
        !record(detail) ||
        !onlyKeys(detail, ["label", "value"]) ||
        !text(detail.label, 60) ||
        !text(detail.value, 200)
      )
        throw invalid();
      return { label: detail.label.trim(), value: detail.value.trim() };
    }),
    ...(confirmLabel !== undefined ? { confirmLabel: trimmed(confirmLabel as string) } : {}),
    ...(cancelLabel !== undefined ? { cancelLabel: trimmed(cancelLabel as string) } : {}),
    variant,
  };
}

// `{ name, args }` from a provider, normalized with every default filled in.
export function parseToolCall(value: unknown): ToolCall {
  if (!record(value) || !onlyKeys(value, ["name", "args"]) || !record(value.args)) throw invalid();
  if (JSON.stringify(value.args).length > 20000) throw invalid();
  switch (value.name) {
    case "ask_form":
      return { name: "ask_form", args: askForm(value.args) };
    case "ask_choice":
      return { name: "ask_choice", args: askChoice(value.args) };
    case "confirm":
      return { name: "confirm", args: confirm(value.args) };
    default:
      throw invalid();
  }
}

// A stored call: written by parseToolCall, so only the shape is re-asserted.
export const storedToolCall = (value: unknown) => value as ToolCall;

// The buyer's result, checked against the call it answers.
export function parseToolResult(call: ToolCall, value: unknown): Record<string, Prisma.JsonValue> {
  const fail = () => new BadRequestError("INVALID_TOOL_RESULT");
  if (!record(value)) throw fail();
  switch (call.name) {
    case "ask_form":
      try {
        return effectiveArguments(call.args.schema, value) as Record<string, Prisma.JsonValue>;
      } catch {
        throw fail();
      }
    case "ask_choice": {
      const { selected } = value;
      const ids = new Set(call.args.options.map((option) => option.id));
      if (
        !onlyKeys(value, ["selected"]) ||
        !Array.isArray(selected) ||
        selected.length < call.args.minSelections ||
        selected.length > call.args.maxSelections ||
        new Set(selected).size !== selected.length ||
        selected.some((id) => typeof id !== "string" || !ids.has(id))
      )
        throw fail();
      return { selected: selected as string[] };
    }
    case "confirm":
      if (!onlyKeys(value, ["approved"]) || typeof value.approved !== "boolean") throw fail();
      return { approved: value.approved };
  }
}

// The schema whose file fields a result may name; only forms take files.
export const resultSchema = (call: ToolCall) =>
  call.name === "ask_form" ? call.args.schema : null;

// One readable line for the conversation log and transcripts.
export function resultText(call: ToolCall, result: Record<string, Prisma.JsonValue>) {
  switch (call.name) {
    case "ask_form":
      return `${call.args.title}: ${JSON.stringify(result)}`.slice(0, 4000);
    case "ask_choice": {
      const labels = new Map(call.args.options.map((option) => [option.id, option.label]));
      return (result.selected as string[]).map((id) => labels.get(id) ?? id).join(", ");
    }
    case "confirm":
      return `${result.approved ? "Approved" : "Declined"}: ${call.args.title}`;
  }
}
