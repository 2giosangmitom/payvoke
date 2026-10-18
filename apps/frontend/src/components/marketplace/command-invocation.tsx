import { useId, useRef, useState, type FormEvent } from "react";
import { Checkbox } from "@base-ui/react/checkbox";
import { CheckIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Choice, StatusBadge } from "./shared";
import { SafeMarkdown } from "~/components/workspace/safe-markdown";
import {
  commandFields,
  errorMessage,
  type CommandInvocation,
  type SlashCommand,
} from "~/lib/provider-commands";

export function CommandForm({
  command,
  revisionId,
  onRun,
  onCancel,
  onBusyChange,
  limits,
}: {
  command: SlashCommand;
  revisionId: string;
  onRun: (id: string, input: Record<string, string>) => Promise<void>;
  onCancel?: () => void;
  onBusyChange?: (busy: boolean) => void;
  limits?: { inputChars: number; timeoutSeconds: number };
}) {
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef<{ identity: string; id: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !confirmed) return;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const input = commandFields(command, values, limits?.inputChars);
      const identity = JSON.stringify([revisionId, command.name, input]);
      if (operation.current?.identity !== identity)
        operation.current = { identity, id: crypto.randomUUID() };
      await onRun(operation.current.id, input);
      operation.current = null;
      setConfirmed(false);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <form className="gateway-form" onSubmit={submit} aria-label={`Run /${command.name}`}>
      <p className="text-muted-foreground">{command.description}</p>
      <p className="market-caption">
        Pinned command revision <span className="market-mono">{revisionId.slice(0, 8)}</span>
      </p>
      {limits && (
        <p className="market-caption">
          Up to {limits.inputChars.toLocaleString()} input characters in total ·{" "}
          {limits.timeoutSeconds}s deadline
        </p>
      )}
      {Object.entries(command.inputSchema.properties).map(([name, property]) => (
        <div className="gateway-field" key={name}>
          <label htmlFor={`${id}-${name}`}>
            {name}
            {command.inputSchema.required.includes(name) && (
              <span className="text-destructive"> *</span>
            )}
          </label>
          {property.enum ? (
            <Choice
              label={name}
              value={values[name] ?? ""}
              disabled={busy}
              options={[
                { value: "", label: "Select a value" },
                ...property.enum.map((value) => ({ value, label: value })),
              ]}
              onChange={(value) => setValues((values) => ({ ...values, [name]: value }))}
            />
          ) : (
            <textarea
              id={`${id}-${name}`}
              rows={3}
              className="market-textarea"
              value={values[name] ?? ""}
              maxLength={property.maxLength}
              required={command.inputSchema.required.includes(name)}
              disabled={busy}
              onChange={(event) =>
                setValues((values) => ({ ...values, [name]: event.target.value }))
              }
            />
          )}
          <p className="market-caption">Up to {property.maxLength.toLocaleString()} characters</p>
        </div>
      ))}
      <label className="gateway-consent">
        <Checkbox.Root
          checked={confirmed}
          disabled={busy}
          onCheckedChange={setConfirmed}
          className="gateway-checkbox"
        >
          <Checkbox.Indicator>
            <CheckIcon size={14} />
          </Checkbox.Indicator>
        </Checkbox.Root>
        <span>
          I understand this development command can incur provider model costs. This is not a
          marketplace purchase.
        </span>
      </label>
      {error && (
        <p role="alert" className="market-form-error">
          {error} Retrying unchanged input recovers the same invocation.
        </p>
      )}
      <div className="gateway-actions">
        {onCancel && (
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={
            busy || !confirmed || command.inputSchema.required.some((name) => !values[name])
          }
        >
          {busy ? "Submitting…" : "Run development command"}
        </Button>
      </div>
    </form>
  );
}

export function InvocationCard({ invocation }: { invocation: CommandInvocation }) {
  return (
    <article className="gateway-invocation" aria-label={`Command /${invocation.command}`}>
      <header className="gateway-section-heading">
        <h3>/{invocation.command}</h3>
        <StatusBadge status={invocation.state} />
      </header>
      <p className="market-caption">
        Provider development command · {new Date(invocation.createdAt).toLocaleString()}
      </p>
      <pre className="gateway-input-preview" aria-label="Command input">
        {JSON.stringify(invocation.input, null, 2)}
      </pre>
      {invocation.progress && (
        <p
          className="gateway-progress"
          role={invocation.state === "running" ? "status" : undefined}
        >
          {invocation.state === "running"
            ? invocation.progress
            : `Last progress: ${invocation.progress}`}
        </p>
      )}
      {invocation.result &&
        (invocation.state === "completed" ? (
          <div className="chat-markdown gateway-result">
            <SafeMarkdown text={invocation.result} />
          </div>
        ) : (
          <p className="gateway-result whitespace-pre-wrap">{invocation.result}</p>
        ))}
      {invocation.state === "uncertain" && (
        <p className="market-caption mt-3">
          External work may have occurred. Inspect the provider journal; do not start another
          invocation as a retry.
        </p>
      )}
      <p className="market-caption market-mono mt-3">
        Invocation {invocation.id} · Revision {invocation.revisionId.slice(0, 8)}
      </p>
    </article>
  );
}
