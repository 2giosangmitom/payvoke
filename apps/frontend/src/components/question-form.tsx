"use client";

import { useId, useState, type FormEvent } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { NativeSelect, NativeSelectOption } from "./ui/native-select";
import { Textarea } from "./ui/textarea";
import type { ChatQuestion } from "@/src/lib/paid-chat";

type Field = {
  name: string;
  label: string;
  kind: "string" | "number" | "boolean" | "enum";
  required: boolean;
  options?: {
    key: string;
    value: string;
    label: string;
    type: "string" | "number" | "boolean";
  }[];
};

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const labelOf = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value : fallback;

// The provider supplies the question schema; only scalar top-level properties
// become form controls. Anything richer falls back to a JSON object editor.
export function questionFields(schema: unknown): { fields: Field[]; raw: boolean } {
  if (!record(schema) || schema.type !== "object" || !record(schema.properties))
    return { fields: [], raw: true };
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === "string")
      : [],
  );
  const fields: Field[] = [];
  for (const [name, definition] of Object.entries(schema.properties)) {
    if (!record(definition)) return { fields: [], raw: true };
    const title = labelOf(definition.title, name);
    const isRequired = required.has(name);
    if (
      Array.isArray(definition.enum) &&
      definition.enum.length &&
      definition.enum.every((item) => ["string", "number", "boolean"].includes(typeof item))
    ) {
      fields.push({
        name,
        label: title,
        kind: "enum",
        required: isRequired,
        options: definition.enum.map((item) => ({
          key: `${typeof item}:${String(item)}`,
          value: String(item),
          label: String(item),
          type: typeof item as "string" | "number" | "boolean",
        })),
      });
      continue;
    }
    if (definition.type === "string") {
      fields.push({ name, label: title, kind: "string", required: isRequired });
      continue;
    }
    if (definition.type === "number" || definition.type === "integer") {
      fields.push({ name, label: title, kind: "number", required: isRequired });
      continue;
    }
    if (definition.type === "boolean") {
      fields.push({ name, label: title, kind: "boolean", required: isRequired });
      continue;
    }
    return { fields: [], raw: true };
  }
  return { fields, raw: false };
}

export function QuestionForm({
  question,
  onSubmit,
  compact = false,
}: {
  question: ChatQuestion;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  compact?: boolean;
}) {
  const prefix = useId();
  const { fields, raw } = questionFields(question.inputSchema);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [json, setJson] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      } else {
        payload = {};
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
          if (field.kind === "number") {
            const number = Number(value);
            if (!Number.isFinite(number)) throw new Error(`${field.label} must be a number.`);
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
          } else payload[field.name] = value;
        }
      }
      await onSubmit(payload);
      setValues({});
      setJson("{}");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit this answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={compact ? "run-question is-compact" : "run-question"}
      onSubmit={(event) => void submit(event)}
    >
      {!compact && <p>{question.prompt}</p>}
      {compact && <p className="run-question-prompt">{question.prompt}</p>}
      {raw ? (
        <div className="run-question-field">
          <Label htmlFor={`${prefix}-json`}>Answer (JSON object)</Label>
          <Textarea
            id={`${prefix}-json`}
            value={json}
            onChange={(event) => setJson(event.target.value)}
            rows={4}
            spellCheck={false}
          />
        </div>
      ) : (
        fields.map((field) => (
          <div className="run-question-field" key={field.name}>
            {field.kind === "boolean" ? (
              <label className="run-question-check">
                <input
                  type="checkbox"
                  checked={values[field.name] === true}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.name]: event.target.checked }))
                  }
                />{" "}
                {field.label}
              </label>
            ) : (
              <>
                <Label htmlFor={`${prefix}-${field.name}`}>
                  {field.label}
                  {field.required ? " *" : ""}
                </Label>
                {field.kind === "enum" ? (
                  <NativeSelect
                    id={`${prefix}-${field.name}`}
                    value={String(values[field.name] ?? "")}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.name]: event.target.value }))
                    }
                    required={field.required}
                  >
                    <NativeSelectOption value="">Select…</NativeSelectOption>
                    {field.options?.map((option) => (
                      <NativeSelectOption key={option.key} value={option.key}>
                        {option.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input
                    id={`${prefix}-${field.name}`}
                    type={field.kind === "number" ? "number" : "text"}
                    step={field.kind === "number" ? "any" : undefined}
                    value={String(values[field.name] ?? "")}
                    required={field.required}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.name]: event.target.value }))
                    }
                  />
                )}
              </>
            )}
          </div>
        ))
      )}
      <div className="run-question-actions">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Send />} Send answer
        </Button>
        <small>Answers continue this invocation without another charge.</small>
      </div>
      {error && (
        <div className="run-error" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
