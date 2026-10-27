"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Spinner } from "./ui/spinner";
import { ErrorNotice } from "./page-kit";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { NativeSelect, NativeSelectOption } from "./ui/native-select";
import { Textarea } from "./ui/textarea";
import { formatBytes } from "@/src/lib/files";
import { cn } from "@/src/lib/utils";

export type SchemaField = {
  name: string;
  label: string;
  description?: string;
  kind: "string" | "text" | "number" | "integer" | "boolean" | "enum" | "file" | "files";
  required: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  defaultValue?: unknown;
  // File fields: allowed MIME types (`image/*` wildcards), size cap, count cap.
  accept?: string[];
  maxBytes?: number;
  maxItems?: number;
  options?: {
    key: string;
    value: string;
    label: string;
    type: "string" | "number" | "boolean";
  }[];
};
type Values = Record<string, string | boolean>;
// An uploaded (or uploading) file of a file field; only READY ids are sent.
type PickedFile = {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "ready" | "error";
  fileId?: string;
  error?: string;
};
export type UploadFile = (file: File) => Promise<{ id: string }>;

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const labelOf = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value : fallback;
const numberOf = (value: unknown) => (typeof value === "number" ? value : undefined);
// Strings without a short bound get a multi-line editor.
const LONG_TEXT = 200;

// Only scalar or file top-level properties become form controls; anything
// richer falls back to a JSON object editor. Commands and bot forms are flat
// schemas, so the fallback is for unusual question schemas.
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
    } else if (definition.type === "string" && definition.format === "file") {
      fields.push({ ...base, kind: "file", ...fileLimits(definition) });
    } else if (
      definition.type === "array" &&
      record(definition.items) &&
      definition.items.format === "file"
    ) {
      fields.push({
        ...base,
        kind: "files",
        ...fileLimits(definition.items),
        maxItems: numberOf(definition.maxItems),
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

const fileLimits = (definition: Record<string, unknown>) => ({
  accept: Array.isArray(definition.accept)
    ? definition.accept.filter((item): item is string => typeof item === "string")
    : undefined,
  maxBytes: numberOf(definition.maxBytes),
});
const accepts = (accept: string[] | undefined, type: string) =>
  !accept ||
  accept.some((item) => (item.endsWith("/*") ? type.startsWith(item.slice(0, -1)) : item === type));

const initialValues = (fields: SchemaField[], initial: Record<string, unknown>) => {
  const values: Values = {};
  for (const field of fields) {
    const value = initial[field.name] ?? field.defaultValue;
    if (value === undefined || value === null || field.kind === "file" || field.kind === "files")
      continue;
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
function payloadOf(fields: SchemaField[], values: Values, files: Record<string, PickedFile[]>) {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.kind === "file" || field.kind === "files") {
      const picked = files[field.name] ?? [];
      if (picked.some((item) => item.status === "uploading"))
        throw new Error("Wait for files to finish uploading.");
      const ids = picked.flatMap((item) => (item.status === "ready" ? [item.fileId!] : []));
      if (!ids.length) {
        if (field.required) throw new Error(`${field.label} is required.`);
        continue;
      }
      payload[field.name] = field.kind === "file" ? ids[0] : ids;
      continue;
    }
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

// A file field: files upload as soon as they are picked, and the field holds
// their ids once the API has verified them.
function FileInput({
  id,
  field,
  picked,
  onChange,
  upload,
  describedBy,
}: {
  id: string;
  field: SchemaField;
  picked: PickedFile[];
  onChange: (update: (current: PickedFile[]) => PickedFile[]) => void;
  upload?: UploadFile;
  describedBy?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const limit = field.kind === "file" ? 1 : (field.maxItems ?? 10);
  function pick(list: FileList | null) {
    if (!list?.length || !upload) return;
    for (const file of Array.from(list).slice(0, Math.max(0, limit - picked.length) || 1)) {
      const key = crypto.randomUUID();
      const update = (patch: Partial<PickedFile>) =>
        onChange((current) =>
          current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
        );
      const problem = !accepts(field.accept, file.type)
        ? "This file type isn't accepted here."
        : field.maxBytes !== undefined && file.size > field.maxBytes
          ? `Larger than ${formatBytes(field.maxBytes)}.`
          : "";
      const entry: PickedFile = {
        key,
        name: file.name,
        size: file.size,
        status: problem ? "error" : "uploading",
        error: problem || undefined,
      };
      // A single-file field replaces its file.
      onChange((current) => (field.kind === "file" ? [entry] : [...current, entry]));
      if (problem) continue;
      upload(file).then(
        (ready) => update({ status: "ready", fileId: ready.id }),
        (cause) =>
          update({
            status: "error",
            error: cause instanceof Error ? cause.message : "Upload failed.",
          }),
      );
    }
    if (input.current) input.current.value = "";
  }
  return (
    <div className="grid gap-2">
      <input
        ref={input}
        id={id}
        type="file"
        className="sr-only"
        accept={field.accept?.join(",")}
        multiple={field.kind === "files"}
        aria-describedby={describedBy}
        onChange={(event) => pick(event.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        disabled={!upload || (field.kind === "files" && picked.length >= limit)}
        onClick={() => input.current?.click()}
      >
        <Paperclip /> {picked.length && field.kind === "file" ? "Replace file" : "Choose file"}
      </Button>
      {!upload && (
        <small className="text-xs text-warning">File uploads are unavailable here.</small>
      )}
      {picked.length > 0 && (
        <ul className="grid gap-1.5">
          {picked.map((item) => (
            <li
              key={item.key}
              className={cn(
                "flex min-w-0 items-center gap-2 border border-border bg-background-deep px-2.5 py-1.5 font-mono text-[11px]",
                item.status === "error" && "border-destructive text-destructive",
              )}
            >
              {item.status === "uploading" && <Spinner className="size-3" />}
              <span className="truncate">{item.name}</span>
              <span className="shrink-0 text-faint">
                {item.status === "error" ? item.error : formatBytes(item.size)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${item.name}`}
                className="ml-auto shrink-0 text-faint hover:text-foreground"
                onClick={() => onChange((current) => current.filter((x) => x.key !== item.key))}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A form generated from a flat JSON Schema: slash command arguments, bot forms
// and provider questions all use it. File fields need `uploadFile`.
export function SchemaForm({
  schema,
  initial = {},
  onSubmit,
  submitLabel,
  submitIcon,
  footer,
  disabled = false,
  resetOnSubmit = false,
  uploadFile,
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
  uploadFile?: UploadFile;
  children?: ReactNode;
}) {
  const prefix = useId();
  const { fields, raw } = schemaFields(schema);
  const [values, setValues] = useState<Values>(() => initialValues(fields, initial));
  const [files, setFiles] = useState<Record<string, PickedFile[]>>({});
  const [json, setJson] = useState(() => JSON.stringify(initial, null, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (name: string, value: string | boolean) =>
    setValues((current) => ({ ...current, [name]: value }));
  const uploading = Object.values(files).some((list) =>
    list.some((item) => item.status === "uploading"),
  );

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
      } else payload = payloadOf(fields, values, files);
      await onSubmit(payload);
      if (resetOnSubmit) {
        setValues({});
        setFiles({});
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
          if (field.kind === "file" || field.kind === "files")
            return (
              <div className="grid gap-1.5" key={field.name}>
                <Label htmlFor={id}>
                  {field.label}
                  {field.required && <span className="text-primary">*</span>}
                </Label>
                <FileInput
                  id={id}
                  field={field}
                  picked={files[field.name] ?? []}
                  upload={uploadFile}
                  describedBy={control["aria-describedby"]}
                  onChange={(update) =>
                    setFiles((current) => ({
                      ...current,
                      [field.name]: update(current[field.name] ?? []),
                    }))
                  }
                />
                {hint}
              </div>
            );
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
        <Button type="submit" disabled={busy || disabled || uploading}>
          {busy ? <Spinner /> : submitIcon} {submitLabel}
        </Button>
        {footer}
      </div>
      {error && <ErrorNotice className="my-0">{error}</ErrorNotice>}
    </form>
  );
}
