"use client";

import { useState } from "react";
import type { DataMessagePartProps, ToolCallMessagePartProps } from "@assistant-ui/react";
import { HandCoins, RotateCcw, ShieldQuestion, SquareSlash } from "lucide-react";
import { ApprovalCard } from "@/src/components/assistant-ui/elements/approval-card";
import { ElicitationForm } from "@/src/components/assistant-ui/elements/elicitation-form";
import { OptionList } from "@/src/components/assistant-ui/elements/option-list";
import { formatUsdc } from "@/src/features/apps/format";
import type { AskChoiceArgs, AskFormArgs, ConfirmArgs, OfferArgs } from "@/src/features/chat/api";
import { OpenUISurface } from "@/src/features/chat/openui-surface";
import { ResultView } from "@/src/features/chat/result-view";
import { SchemaForm, schemaFields } from "@/src/features/chat/schema-form";
import { useThreadChat } from "@/src/features/chat/thread-runtime";
import { formatDuration } from "@/src/features/payments/payment-confirm";

type ToolProps = ToolCallMessagePartProps<Record<string, unknown>, unknown>;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const readable = (cause: unknown) => (cause instanceof Error ? cause.message : "Request failed.");

// The API's view of a tool call: its status and result, by id.
function useToolState(toolCallId: string) {
  const chat = useThreadChat();
  const part = chat.tools.get(toolCallId);
  return { chat, status: part?.status ?? "open", result: part?.result ?? null };
}

// ask_form: the bot needs a few fields; file fields upload into the thread.
export function AskFormTool({ toolCallId, args }: ToolProps) {
  const form = args as unknown as AskFormArgs;
  const { chat, status, result } = useToolState(toolCallId);
  const { fields } = schemaFields(form.schema);
  const answered = status === "done" && record(result);
  const title = (name: string) => fields.find((field) => field.name === name)?.label ?? name;
  return (
    <ElicitationForm
      server={form.title}
      message={form.description ?? `${chat.appName} needs a few details to continue.`}
      state={answered ? "accepted" : "request"}
      acceptedLabel="Sent"
      fields={
        answered
          ? Object.entries(result).map(([name, value]) => ({
              name,
              label: title(name),
              kind: "text" as const,
              value:
                typeof value === "string" && /^[0-9a-f-]{36}$/.test(value)
                  ? "1 file"
                  : Array.isArray(value)
                    ? `${value.length} files`
                    : String(value),
            }))
          : []
      }
      className="max-w-lg"
    >
      <SchemaForm
        schema={form.schema}
        submitLabel={form.submitLabel ?? "Send"}
        uploadFile={chat.uploadFile}
        onSubmit={(values) => chat.submitTool(toolCallId, values)}
      />
    </ElicitationForm>
  );
}

// ask_choice: pick one or several of the bot's options.
export function AskChoiceTool({ toolCallId, args }: ToolProps) {
  const choice = args as unknown as AskChoiceArgs;
  const { chat, status, result } = useToolState(toolCallId);
  const selected =
    status === "done" && record(result) && Array.isArray(result.selected)
      ? (result.selected as string[])
      : undefined;
  return (
    <div className="grid w-full max-w-sm gap-2">
      <p className="text-sm leading-relaxed">{choice.prompt}</p>
      <OptionList
        options={choice.options}
        selectionMode={choice.multiple ? "multiple" : "single"}
        minSelections={choice.minSelections}
        maxSelections={choice.maxSelections}
        choice={selected}
        onConfirm={(ids) => chat.submitTool(toolCallId, { selected: ids })}
      />
    </div>
  );
}

// confirm: approve or decline what the bot is about to do.
export function ConfirmTool({ toolCallId, args }: ToolProps) {
  const confirm = args as unknown as ConfirmArgs;
  const { chat, status, result } = useToolState(toolCallId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const answer = (approved: boolean) => {
    setBusy(true);
    setError("");
    chat
      .submitTool(toolCallId, { approved })
      .catch((cause) => setError(readable(cause)))
      .finally(() => setBusy(false));
  };
  const approved = record(result) ? result.approved === true : null;
  return (
    <div className="grid w-full max-w-sm gap-1.5">
      <ApprovalCard
        icon={<ShieldQuestion className="size-4" />}
        title={confirm.title}
        subtitle={`${chat.appName} asks before it continues`}
        description={confirm.description}
        details={confirm.details}
        variant={confirm.variant}
        state={busy ? "running" : status !== "done" ? "request" : approved ? "done" : "denied"}
        statusLabel={busy ? "Sending" : approved ? "Approved" : "Declined"}
        allowOnceLabel={confirm.confirmLabel ?? "Approve"}
        denyLabel={confirm.cancelLabel ?? "Decline"}
        onAllowOnce={() => answer(true)}
        onDeny={() => answer(false)}
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const closedOffer: Record<string, string> = {
  ACCEPTED: "Accepted",
  DECLINED: "You declined",
  WITHDRAWN: "Withdrawn by the app",
  SUPERSEDED: "Replaced by a newer offer",
  EXPIRED: "Expired",
};

// The bot's priced proposal. Only offers read from the API get a pay button;
// nothing in chat text can create one.
export function OfferTool({ toolCallId, args }: ToolProps) {
  const offer = args as unknown as OfferArgs;
  const { chat, status, result } = useToolState(toolCallId);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState("");
  const command = chat.thread?.commands.find((item) => item.id === offer.command.id);
  const terms =
    command?.revision?.id === offer.commandRevisionId ? command.revision.terms : undefined;
  const run = (action: "accept" | "decline") => {
    setBusy(action);
    setError("");
    const task =
      action === "accept"
        ? chat.acceptOffer(offer.offerId)
        : chat.submitTool(toolCallId, { accepted: false });
    task.catch((cause) => setError(readable(cause))).finally(() => setBusy(null));
  };
  const closed = record(result) && typeof result.status === "string" ? result.status : null;
  const expires = new Date(offer.expiresAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="grid w-full max-w-md gap-1.5">
      <ApprovalCard
        icon={<HandCoins className="size-4" />}
        title={`${formatUsdc(offer.grossAmount)} for /${offer.command.name}`}
        subtitle={status === "open" ? `Offer · valid until ${expires}` : "Offer"}
        description={offer.summary}
        details={[
          { label: "Delivery", value: formatDuration(offer.deliverySeconds) },
          ...(terms
            ? [
                { label: "Review", value: formatDuration(terms.reviewSeconds) },
                {
                  label: "Revisions",
                  value: `${terms.revisionPolicy.maxIncluded} included`,
                },
                { label: "Refund", value: terms.refundPolicy },
              ]
            : []),
        ]}
        state={
          busy
            ? "running"
            : status === "open"
              ? "request"
              : closed === "ACCEPTED"
                ? "done"
                : "denied"
        }
        statusLabel={
          busy === "accept"
            ? "Preparing the quote"
            : busy === "decline"
              ? "Declining"
              : closed
                ? closedOffer[closed]
                : undefined
        }
        allowOnceLabel="Accept and pay"
        denyLabel="Decline"
        onAllowOnce={() => run("accept")}
        onDeny={() => run("decline")}
        className="max-w-md"
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// The slash command a buyer message ran, shown as a chip with its arguments.
// Buyer messages are user messages, which assistant-ui only lets carry data
// parts (never tool calls), so this renders a `data` part named "command".
export function CommandData({ data }: DataMessagePartProps<Record<string, unknown>>) {
  const chat = useThreadChat();
  const commandId = typeof data?.commandId === "string" ? data.commandId : "";
  const name = chat.thread?.commands.find((item) => item.id === commandId)?.name ?? "command";
  // File arguments are file ids, and the file itself is attached to the
  // message as a card, so the chip lists only the other arguments.
  const isFile = (value: unknown) =>
    (typeof value === "string" && chat.files.has(value)) ||
    (Array.isArray(value) && value.length > 0 && value.every((v) => chat.files.has(String(v))));
  const values = record(data?.arguments)
    ? Object.entries(data.arguments).filter(([, value]) => !isFile(value) && value !== "")
    : [];
  const show = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));
  return (
    <div className="grid justify-items-end gap-1">
      <span className="inline-flex items-center gap-1.5 border border-primary/40 px-2 py-0.5 font-mono text-xs text-primary">
        <SquareSlash className="size-3.5" aria-hidden />/{name}
      </span>
      {values.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
          {values.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="break-words">{show(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function RenderUiTool({ args }: ToolProps) {
  return typeof args.source === "string" ? <OpenUISurface source={args.source} /> : null;
}

export function RevisionTool({ args }: ToolProps) {
  return (
    <p className="flex items-start gap-2 border-l border-border-strong py-1 pl-3 text-sm text-muted-foreground">
      <RotateCcw className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        You asked for a revision: <span className="text-foreground">{String(args.reason)}</span>
      </span>
    </p>
  );
}

export function ResultTool({ args }: ToolProps) {
  return (
    <div className="grid gap-2 border border-border bg-background-deep p-4">
      <span className="text-xs text-muted-foreground">
        Structured result · version {String(args.artifactVersion ?? 1)}
      </span>
      <ResultView output={args.output} />
    </div>
  );
}

// Steps render as one plan per group; a lone step outside a group is a line.
export function ProgressTool({ args }: ToolProps) {
  return (
    <p className="text-sm text-muted-foreground">
      {String(args.label)}
      {args.status === "done" ? " · done" : args.status === "failed" ? " · failed" : ""}
    </p>
  );
}

export const toolUIs = {
  ask_form: AskFormTool,
  ask_choice: AskChoiceTool,
  confirm: ConfirmTool,
  offer: OfferTool,
  render_ui: RenderUiTool,
  revision: RevisionTool,
  result: ResultTool,
  progress: ProgressTool,
};
