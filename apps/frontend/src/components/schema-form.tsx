"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Spinner } from "./ui/spinner";
import { ErrorNotice } from "./page-kit";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { NativeSelect, NativeSelectOption } from "./ui/native-select";
import { Textarea } from "./ui/textarea";

export type SchemaField = {
  name: string;
  label: string;
  description?: string;
  kind: "string" | "text" | "number" | "integer" | "boolean" | "enum";
  required: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  defaultValue?: unknown;
  options?: {
    key: string;
    value: string;
    label: string;
    type: "string" | "number" | "boolean";
  }[];
};
type Values = Record<string, string | boolean>;

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const labelOf = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value : fallback;
const numberOf = (value: unknown) => (typeof value === "number" ? value : undefined);
// Strings without a short bound get a multi-line editor.
const LONG_TEXT = 200;

// Only scalar top-level properties become form controls; anything richer
// falls back to a JSON object editor. Providers and command definitions both
// produce flat schemas, so the fallback is for unusual question schemas.
export function schemaFields(schema: unknown): { fields: SchemaField[]; raw: boolean } {
  if (!record(schema) || schema.type !== "object" || !record(schema.properties))
    return { fields: [], raw: true };
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === "string")
      : [],
  );
  const fields: SchemaField[] = [];
  for (const [name, definition] of Object.entries(schema.properties)) {
    if (!record(definition)) return { fields: [], raw: true };
    const base = {
      name,
      label: labelOf(definition.title, name),
      description: typeof definition.description === "string" ? definition.description : undefined,
      required: required.has(name),
      defaultValue: definition.default,
    };
    if (
      Array.isArray(definition.enum) &&
      definition.enum.length &&
      definition.enum.every((item) => ["string", "number", "boolean"].includes(typeof item))
    ) {
      fields.push({
        ...base,
        kind: "enum",
        options: definition.enum.map((item) => ({
          key: `${typeof item}:${String(item)}`,
          value: String(item),
          label: String(item),
          type: typeof item as "string" | "number" | "boolean",
        })),
      });
    } else if (definition.type === "string") {
      const maxLength = numberOf(definition.maxLength);
      fields.push({
        ...base,
        kind: maxLength !== undefined && maxLength <= LONG_TEXT ? "string" : "text",
        minLength: numberOf(definition.minLength),
        maxLength,
      });
    } else if (definition.type === "number" || definition.type === "integer") {
      fields.push({
        ...base,
        kind: definition.type,
        min: numberOf(definition.minimum),
        max: numberOf(definition.maximum),
      });
    } else if (definition.type === "boolean") {
      fields.push({ ...base, kind: "boolean" });
    } else return { fields: [], raw: true };
  }
  return { fields, raw: false };
}

const initialValues = (fields: SchemaField[], initial: Record<string, unknown>) => {
  const values: Values = {};
  for (const field of fields) {
    const value = initial[field.name] ?? field.defaultValue;
    if (value === undefined || value === null) continue;
    if (field.kind === "boolean") values[field.name] = value === true;
    else if (field.kind === "enum")
      values[field.name] =
        field.options?.find((option) => option.value === String(value))?.key ?? "";
    else values[field.name] = String(value);
  }
  return values;
};

// Converts edited strings back into typed JSON arguments, checking the same
// bounds the server enforces so most mistakes are caught before a request.
function payloadOf(fields: SchemaField[], values: Values) {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.name];
    if (field.kind === "boolean") {
      if (value !== undefined) payload[field.name] = value === true;
      else if (field.required) payload[field.name] = false;
      continue;
    }
    if (value === undefined || value === "") {
      if (field.required) throw new Error(`${field.label} is required.`);
      continue;
    }
    if (field.kind === "number" || field.kind === "integer") {
      const number = Number(value);
      if (!Number.isFinite(number) || (field.kind === "integer" && !Number.isInteger(number)))
        throw new Error(
          `${field.label} must be ${field.kind === "integer" ? "a whole" : "a"} number.`,
        );
      if (
        (field.min !== undefined && number < field.min) ||
        (field.max !== undefined && number > field.max)
      )
        throw new Error(`${field.label} is out of range.`);
      payload[field.name] = number;
    } else if (field.kind === "enum") {
      const option = field.options?.find((item) => item.key === value);
      if (!option) throw new Error(`${field.label} is invalid.`);
      payload[field.name] =
        option.type === "number"
          ? Number(option.value)
          : option.type === "boolean"
            ? option.value === "true"
            : option.value;
    } else {
      const text = String(value);
      if (field.minLength !== undefined && text.length < field.minLength)
        throw new Error(`${field.label} is too short.`);
      payload[field.name] = text;
    }
  }
  return payload;
}

// A form generated from a flat JSON Schema: tool inputs, slash command
// arguments and provider questions all use it.
export function SchemaForm({
  schema,
  initial = {},
  onSubmit,
  submitLabel,
  submitIcon,
  footer,
  disabled = false,
  resetOnSubmit = false,
  children,
}: {
  schema: unknown;
  initial?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  submitLabel: string;
  submitIcon?: ReactNode;
  footer?: ReactNode;
  disabled?: boolean;
  resetOnSubmit?: boolean;
  children?: ReactNode;
}) {
  const prefix = useId();
  const { fields, raw } = schemaFields(schema);
  const [values, setValues] = useState<Values>(() => initialValues(fields, initial));
  const [json, setJson] = useState(() => JSON.stringify(initial, null, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (name: string, value: string | boolean) =>
    setValues((current) => ({ ...current, [name]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      let payload: Record<string, unknown>;
      if (raw) {
        const parsed: unknown = JSON.parse(json);
        if (!record(parsed)) throw new Error("Enter a JSON object.");
        payload = parsed;
      } else payload = payloadOf(fields, values);
      await onSubmit(payload);
      if (resetOnSubmit) {
        setValues({});
        setJson("{}");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit this form.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      {raw ? (
        <div className="grid gap-1.5">
          <Label htmlFor={`${prefix}-json`}>Input (JSON object)</Label>
          <Textarea
            id={`${prefix}-json`}
            value={json}
            onChange={(event) => setJson(event.target.value)}
            rows={5}
            spellCheck={false}
            className="font-mono text-xs"
          />
        </div>
      ) : (
        fields.map((field) => {
          const id = `${prefix}-${field.name}`;
          const hint = field.description && (
            <small id={`${id}-hint`} className="text-xs leading-relaxed text-faint">
              {field.description}
            </small>
          );
          if (field.kind === "boolean")
            return (
              <div className="grid gap-1" key={field.name}>
                <label className="flex items-center gap-2.5 text-sm" htmlFor={id}>
                  <Checkbox
                    id={id}
                    checked={values[field.name] === true}
                    onCheckedChange={(checked) => set(field.name, checked)}
                  />
                  {field.label}
                </label>
                {hint}
              </div>
            );
          const control = {
            id,
            required: field.required,
            "aria-describedby": field.description ? `${id}-hint` : undefined,
          };
          return (
            <div className="grid gap-1.5" key={field.name}>
              <Label htmlFor={id}>
                {field.label}
                {field.required && <span className="text-primary">*</span>}
              </Label>
              {field.kind === "enum" ? (
                <NativeSelect
                  {...control}
                  className="w-full"
                  value={String(values[field.name] ?? "")}
                  onChange={(event) => set(field.name, event.target.value)}
                >
                  <NativeSelectOption value="">Select…</NativeSelectOption>
                  {field.options?.map((option) => (
                    <NativeSelectOption key={option.key} value={option.key}>
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : field.kind === "text" ? (
                <Textarea
                  {...control}
                  rows={4}
                  value={String(values[field.name] ?? "")}
                  minLength={field.minLength}
                  maxLength={field.maxLength}
                  onChange={(event) => set(field.name, event.target.value)}
                />
              ) : (
                <Input
                  {...control}
                  type={field.kind === "string" ? "text" : "number"}
                  step={field.kind === "integer" ? 1 : field.kind === "number" ? "any" : undefined}
                  min={field.min}
                  max={field.max}
                  minLength={field.minLength}
                  maxLength={field.maxLength}
                  value={String(values[field.name] ?? "")}
                  onChange={(event) => set(field.name, event.target.value)}
                />
              )}
              {hint}
            </div>
          );
        })
      )}
      {children}
      <div className="flex flex-wrap items-center gap-2.5">
        <Button type="submit" disabled={busy || disabled}>
          {busy ? <Spinner /> : submitIcon} {submitLabel}
        </Button>
        {footer}
      </div>
      {error && <ErrorNotice className="my-0">{error}</ErrorNotice>}
    </form>
  );
}
