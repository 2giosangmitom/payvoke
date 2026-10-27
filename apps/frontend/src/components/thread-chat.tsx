"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import {
  CircleDollarSign,
  Download,
  Handshake,
  Paperclip,
  Radio,
  RefreshCcw,
  Send,
  Slash,
  X,
} from "lucide-react";
import type { QuoteDocument } from "@payvoke/x402";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Spinner } from "./ui/spinner";
import { Textarea } from "./ui/textarea";
import { ErrorNotice, Eyebrow, FormField, LoadingState, plural } from "./page-kit";
import { ChatWidget } from "./chat-widget";
import { OpenUISurface, surfaceQuestionIds } from "./openui-surface";
import { PaymentConfirm, formatDuration } from "./payment-confirm";
import { QuestionForm } from "./question-form";
import { SchemaForm } from "./schema-form";
import { apiOrigin } from "@/src/lib/api";
import { formatCommandPrice, formatUsdc } from "@/src/lib/apps";
import { ACCEPTED_FILE_TYPES, downloadFile, formatBytes, uploadThreadFile } from "@/src/lib/files";
import { cn } from "@/src/lib/utils";
import {
  answerQuestion,
  declineOffer,
  getPendingQuote,
  getSnapshot,
  getThread,
  quoteFor,
  requestRevision,
  sendMessage,
  type AguiEvent,
  type AppKind,
  type ChatQuestion,
  type ChatSnapshot,
  type Offer,
  type QuoteSource,
  type ThreadCommand,
  type ThreadDetail,
} from "@/src/lib/paid-chat";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  complete: boolean;
  // Shown above an assistant bubble; distinguishes provider chat from paid output.
  label?: string;
};
// A local file on its way to READY; only READY ones are sent with a quote.
type Attachment = {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "ready" | "error";
  fileId?: string;
  error?: string;
};
const MAX_ATTACHMENTS = 10;
type Surface = ChatSnapshot["surfaces"][number];
const readableError = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Request failed.";
const answerText = (values: Record<string, unknown>) => {
  const entries = Object.values(values);
  return entries.length === 1 && typeof entries[0] === "string"
    ? entries[0]
    : JSON.stringify(values);
};

// Streamed output and buyer answers of one paid invocation.
function paidMessages(snapshot: ChatSnapshot, invocationId: string) {
  const messages: ChatMessage[] = [];
  for (const reply of snapshot.messages.filter((m) => m.invocationId === invocationId)) {
    messages.push({
      id: reply.messageId,
      role: "assistant",
      text: reply.content,
      complete: reply.complete,
    });
  }
  for (const answer of snapshot.answers.filter((item) => item.invocationId === invocationId)) {
    messages.push({
      id: `answer-${answer.invocationId}-${answer.questionId}`,
      role: "user",
      text: answerText(answer.arguments),
      complete: true,
    });
  }
  return messages;
}

const OFFER_LABEL: Record<Offer["status"], string> = {
  OPEN: "open",
  ACCEPTED: "accepted",
  DECLINED: "declined",
  WITHDRAWN: "withdrawn",
  SUPERSEDED: "replaced",
  EXPIRED: "expired",
};

// Tools: each paid prompt followed by its output. Agents: the free pre-sale
// conversation in order, each settled offer after the message it answered and
// the paid output of an accepted offer right after it.
function normalize(snapshot: ChatSnapshot, kind: AppKind) {
  const messages: ChatMessage[] = [];
  if (kind !== "AGENT") {
    for (const prompt of snapshot.prompts) {
      messages.push({ id: prompt.quoteId, role: "user", text: prompt.text, complete: true });
      messages.push(...paidMessages(snapshot, prompt.invocationId));
    }
    return messages;
  }
  const invocationOf = new Map(snapshot.prompts.map((p) => [p.quoteId, p.invocationId]));
  for (const message of snapshot.conversation) {
    const files = message.files.map((file) => `📎 ${file.name}`).join("\n");
    messages.push({
      id: message.id,
      role: message.role === "BUYER" ? "user" : "assistant",
      text: files ? `${message.content}\n${files}` : message.content,
      complete: true,
      label: message.role === "PROVIDER" ? "PROVIDER · MESSAGE" : undefined,
    });
    // The open offer is actionable above the composer instead.
    for (const offer of snapshot.offers.filter(
      (item) => item.messageSeq === message.seq && item.status !== "OPEN",
    )) {
      messages.push({
        id: `offer-${offer.id}`,
        role: "assistant",
        text: `${formatUsdc(offer.grossAmount)} · ${offer.summary}`,
        complete: true,
        label: `OFFER · ${OFFER_LABEL[offer.status].toUpperCase()}`,
      });
      const invocationId = offer.quoteId ? invocationOf.get(offer.quoteId) : undefined;
      if (invocationId) messages.push(...paidMessages(snapshot, invocationId));
    }
  }
  return messages;
}

function useStream(threadId: string, kind: AppKind) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const [connection, setConnection] = useState<"connecting" | "connected" | "reconnecting">(
    "connecting",
  );
  const cursor = useRef(0n);
  const snapshot = useQuery({
    queryKey: ["thread", threadId, "snapshot"],
    queryFn: () => getSnapshot(threadId),
    refetchInterval: 5000,
    staleTime: 1000,
  });

  useEffect(() => {
    if (!snapshot.data) return;
    const next = BigInt(snapshot.data.cursor);
    if (next < cursor.current) return;
    cursor.current = next;
    setMessages(normalize(snapshot.data, kind));
    setSurfaces(snapshot.data.surfaces);
  }, [snapshot.data, kind]);

  useEffect(() => {
    cursor.current = 0n;
    setMessages([]);
    setSurfaces([]);
    setConnection("connecting");
  }, [threadId]);

  const ready = Boolean(snapshot.data);
  useEffect(() => {
    if (!ready) return;
    let closed = false;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const applySnapshot = (data: ChatSnapshot) => {
      cursor.current = BigInt(data.cursor);
      setMessages(normalize(data, kind));
      setSurfaces(data.surfaces);
    };

    const handler = (raw: Event) => {
      const event = raw as MessageEvent<string>;
      let number: bigint;
      let item: AguiEvent;
      try {
        number = BigInt(event.lastEventId);
        item = JSON.parse(event.data) as AguiEvent;
      } catch {
        return;
      }
      if (number <= cursor.current) return;
      cursor.current = number;
      if (item.type === "TEXT_MESSAGE_START" && item.messageId) {
        setMessages((current) =>
          current.some((m) => m.id === item.messageId)
            ? current
            : [...current, { id: item.messageId!, role: "assistant", text: "", complete: false }],
        );
      } else if (item.type === "TEXT_MESSAGE_CONTENT" && item.messageId) {
        setMessages((current) =>
          current.map((m) =>
            m.id === item.messageId ? { ...m, text: m.text + (item.delta ?? "") } : m,
          ),
        );
      } else if (item.type === "TEXT_MESSAGE_END" && item.messageId) {
        setMessages((current) =>
          current.map((m) => (m.id === item.messageId ? { ...m, complete: true } : m)),
        );
      } else if (
        item.type === "ACTIVITY_SNAPSHOT" &&
        item.activityType === "openui-surface" &&
        item.messageId &&
        typeof item.content?.source === "string"
      ) {
        const surface = { messageId: item.messageId, content: item.content };
        // Replace in place so a surface keeps its position while it streams.
        setSurfaces((current) =>
          current.some((s) => s.messageId === surface.messageId)
            ? current.map((s) => (s.messageId === surface.messageId ? surface : s))
            : [...current, surface],
        );
      }
      if (["RUN_FINISHED", "RUN_ERROR", "RUN_STARTED"].includes(item.type)) {
        void queryClient.invalidateQueries({ queryKey: ["thread", threadId, "snapshot"] });
        // A finished run can resolve the active quote and reopen the composer.
        void queryClient.invalidateQueries({ queryKey: ["thread", threadId, "details"] });
      }
    };

    const connect = () => {
      if (closed) return;
      source = new EventSource(
        `${apiOrigin}/v1/threads/${encodeURIComponent(threadId)}/ag-ui/events?after=${cursor.current}`,
        { withCredentials: true },
      );
      source.onopen = () => {
        attempt = 0;
        setConnection("connected");
      };
      source.addEventListener("ag-ui", handler);
      // Pre-sale messages and offers changed; the event itself carries no content.
      source.addEventListener("conversation", () => {
        void queryClient.invalidateQueries({ queryKey: ["thread", threadId, "snapshot"] });
        void queryClient.invalidateQueries({ queryKey: ["thread", threadId, "details"] });
      });
      source.onerror = () => {
        setConnection("reconnecting");
        source?.close();
        source = null;
        if (closed) return;
        const delay = Math.min(1000 * 2 ** Math.min(attempt++, 4), 15000);
        timer = setTimeout(() => {
          void (async () => {
            try {
              const fresh = await queryClient.fetchQuery({
                queryKey: ["thread", threadId, "snapshot"],
                queryFn: () => getSnapshot(threadId),
                staleTime: 0,
              });
              applySnapshot(fresh);
            } catch {
              /* keep retrying; the previous state stays readable */
            }
            if (!closed) connect();
          })();
        }, delay);
      };
    };
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      source?.close();
    };
  }, [threadId, ready, queryClient, kind]);

  return { messages, surfaces, connection, snapshot, refresh: () => snapshot.refetch() };
}

function BuyerMessage() {
  return (
    <MessagePrimitive.Root className="max-w-[85%] self-end border border-border bg-primary-soft px-5 py-4 text-sm leading-relaxed break-words whitespace-pre-wrap animate-in fade-in-0 slide-in-from-bottom-2">
      <span className="mb-2 block font-mono text-[10px] tracking-widest text-faint">YOU</span>
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}
function AssistantReply() {
  const label = useAuiState((s) => s.message.metadata.custom?.["label"] as string | undefined);
  return (
    <MessagePrimitive.Root className="max-w-[85%] self-start border border-border bg-background-deep px-5 py-4 text-sm leading-relaxed break-words whitespace-pre-wrap animate-in fade-in-0 slide-in-from-bottom-2">
      <span className="mb-2 block font-mono text-[10px] tracking-widest text-faint">
        {label ?? "APP · LIVE OUTPUT"}
      </span>
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}

export function RevisionControl({
  invocationId,
  remaining,
}: {
  invocationId: string;
  remaining: number;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open)
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Request a revision ({remaining} left)
      </Button>
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestRevision(invocationId, reason, crypto.randomUUID());
      setReason("");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["thread"] });
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
      <FormField label="What should change?" htmlFor={`revision-${invocationId}`}>
        <Textarea
          id={`revision-${invocationId}`}
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          maxLength={2000}
        />
      </FormField>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Spinner />} Request revision
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
      {error && <ErrorNotice className="my-0">{error}</ErrorNotice>}
    </form>
  );
}

function CommandDialog({
  command,
  initialText,
  kind,
  onClose,
  onSubmit,
}: {
  command: ThreadCommand | null;
  initialText: string;
  kind: AppKind;
  onClose: () => void;
  onSubmit: (command: ThreadCommand, values: Record<string, unknown>) => Promise<void>;
}) {
  if (!command || !command.revision) return null;
  const revision = command.revision;
  const textTarget =
    revision.positionalParameter ??
    revision.options.find((option) => option.type === "STRING")?.name;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <code className="font-mono text-primary">/{command.name}</code>
          </DialogTitle>
          <DialogDescription>{command.description}</DialogDescription>
        </DialogHeader>
        <p className="font-mono text-xs text-primary">
          {kind === "AGENT"
            ? `${formatCommandPrice(revision)} · the app sends an offer before you pay`
            : `${formatCommandPrice(revision)} per request`}
        </p>
        <SchemaForm
          key={command.id}
          schema={revision.inputSchema}
          initial={textTarget && initialText ? { [textTarget]: initialText } : {}}
          submitLabel={kind === "AGENT" ? "Send request" : "Get a quote"}
          onSubmit={async (values) => {
            await onSubmit(command, values);
            onClose();
          }}
          footer={
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          }
        />
      </DialogContent>
    </Dialog>
  );
}

function commandForText(thread: ThreadDetail, text: string, selectedCommandId: string) {
  const commands = thread.commands.filter((command) => command.revision);
  const fallback =
    commands.find((command) => command.id === selectedCommandId) ??
    commands.find((command) => command.id === thread.defaultCommandId) ??
    commands[0];
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return { command: fallback, input: trimmed, explicit: false };
  const slash = /^\/([a-z][a-z0-9_]{0,31})(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!slash) return { command: undefined, input: trimmed, explicit: true };
  const command = commands.find((item) => item.name === slash[1]);
  return { command, input: (slash[2] ?? "").trim(), explicit: true };
}

// The provider's priced proposal. Only offers read from the API get a pay
// button; nothing in provider chat text can create one.
function OfferCard({
  offer,
  command,
  busy,
  onAccept,
  onDecline,
}: {
  offer: Offer;
  command: ThreadCommand | undefined;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const terms = command?.revision?.id === offer.commandRevisionId ? command.revision.terms : null;
  return (
    <section
      aria-label="Offer from the app"
      className="mb-3 grid gap-3 border border-primary bg-background-deep p-4 animate-in fade-in-0 slide-in-from-bottom-2"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid size-8 place-items-center border border-primary text-primary">
          <Handshake size={17} />
        </div>
        <div className="grid min-w-0 gap-0.5">
          <strong className="font-mono text-lg font-semibold tracking-tight">
            {formatUsdc(offer.grossAmount)}
          </strong>
          <span className="font-mono text-[10px] text-faint">
            Offer · {command ? `/${command.name} · ` : ""}valid until{" "}
            {new Date(offer.expiresAt).toLocaleTimeString()}
          </span>
        </div>
      </div>
      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{offer.summary}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] sm:grid-cols-3">
        <div>
          <dt className="text-faint">Delivery</dt>
          <dd>{formatDuration(offer.deliverySeconds)}</dd>
        </div>
        {terms && (
          <>
            <div>
              <dt className="text-faint">Review window</dt>
              <dd>{formatDuration(terms.reviewSeconds)}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-faint">Refund</dt>
              <dd className="break-words">{terms.refundPolicy}</dd>
            </div>
          </>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={onAccept}>
          {busy ? <Spinner /> : <CircleDollarSign />} Accept and pay
        </Button>
        <Button variant="outline" disabled={busy} onClick={onDecline}>
          Decline
        </Button>
      </div>
      <p className="font-mono text-[10px] leading-relaxed text-faint">
        Accepting turns this offer into a Payvoke quote. You still review it and authorize the
        payment in your wallet.
      </p>
    </section>
  );
}

export function ThreadChat({ threadId }: { threadId: string }) {
  const queryClient = useQueryClient();
  const thread = useQuery({
    queryKey: ["thread", threadId, "details"],
    queryFn: () => getThread(threadId),
    refetchInterval: 5000,
  });
  const kind: AppKind = thread.data?.app.kind ?? "TOOL";
  const agent = kind === "AGENT";
  const stream = useStream(threadId, kind);
  const commands = useMemo(
    () => (thread.data?.commands ?? []).filter((command) => command.revision),
    [thread.data],
  );
  const [selectedCommandId, setSelectedCommandId] = useState("");
  const [dialogCommand, setDialogCommand] = useState<ThreadCommand | null>(null);
  const [dialogText, setDialogText] = useState("");
  const [composerText, setComposerText] = useState("");
  const [quote, setQuote] = useState<QuoteDocument | null>(null);
  const [quoteHidden, setQuoteHidden] = useState(false);
  const [busy, setBusy] = useState<"quoting" | "sending" | null>(null);
  const [error, setError] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const restored = useQuery({
    queryKey: ["thread", threadId, "pending-quote", thread.data?.activeQuoteId],
    queryFn: () => getPendingQuote(thread.data!.activeQuoteId!),
    enabled: Boolean(thread.data?.activeQuoteId) && !quote,
    refetchInterval: 5000,
    retry: false,
  });
  const candidateQuote = quote ?? restored.data?.quote ?? null;
  const pendingQuote =
    candidateQuote && candidateQuote.validUntil * 1000 > Date.now() ? candidateQuote : null;

  useEffect(() => {
    setQuote(null);
    setQuoteHidden(false);
    setSelectedCommandId("");
    setError("");
    setComposerText("");
    setAttachments([]);
  }, [threadId]);

  useEffect(() => {
    if (!thread.data) return;
    const fallback =
      thread.data.defaultCommandId &&
      commands.some((command) => command.id === thread.data!.defaultCommandId)
        ? thread.data.defaultCommandId
        : (commands[0]?.id ?? "");
    setSelectedCommandId((current) =>
      commands.some((command) => command.id === current) ? current : fallback,
    );
  }, [thread.data, commands]);

  const readyFileIds = () => {
    if (attachments.some((item) => item.status === "uploading"))
      throw new Error("Wait for attachments to finish uploading.");
    return attachments.flatMap((item) =>
      item.status === "ready" && item.fileId ? [item.fileId] : [],
    );
  };
  const refreshThread = async () => {
    await stream.refresh();
    void queryClient.invalidateQueries({ queryKey: ["thread", threadId, "details"] });
  };

  // Tools quote a command; agents quote the provider's open offer.
  async function prepare(source: QuoteSource) {
    if (!thread.data) return;
    setError("");
    setBusy("quoting");
    try {
      const result = await quoteFor(thread.data.id, source, readyFileIds());
      // The quote froze these files; the next request starts without them.
      setAttachments([]);
      setQuote(result);
      setQuoteHidden(false);
      await refreshThread();
    } catch (cause) {
      setError(readableError(cause));
      throw cause;
    } finally {
      setBusy(null);
    }
  }

  // Free pre-sale message to an agent. Files go along as metadata only; the
  // provider can download them once an accepted offer is paid.
  async function send(content: string, commandId?: string, args?: Record<string, unknown>) {
    setError("");
    setBusy("sending");
    try {
      await sendMessage(threadId, {
        content,
        ...(commandId ? { commandId, arguments: args ?? {} } : {}),
        fileIds: readyFileIds(),
      });
      setAttachments([]);
      await refreshThread();
    } catch (cause) {
      setError(readableError(cause));
      throw cause;
    } finally {
      setBusy(null);
    }
  }

  async function paid() {
    setQuote(null);
    setQuoteHidden(false);
    void queryClient.invalidateQueries({ queryKey: ["thread", threadId, "pending-quote"] });
    await refreshThread();
  }

  function attach(files: FileList | null) {
    if (!files?.length || !thread.data) return;
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setError(`Attach at most ${MAX_ATTACHMENTS} files per request.`);
      return;
    }
    const threadId = thread.data.id;
    for (const file of Array.from(files)) {
      const key = crypto.randomUUID();
      const update = (patch: Partial<Attachment>) =>
        setAttachments((current) =>
          current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
        );
      setAttachments((current) => [
        ...current,
        { key, name: file.name, size: file.size, status: "uploading" },
      ]);
      uploadThreadFile(threadId, file).then(
        (ready) => update({ status: "ready", fileId: ready.id }),
        (cause) => update({ status: "error", error: readableError(cause) }),
      );
    }
  }

  function submitText(text: string) {
    if (!thread.data) return;
    const resolved = commandForText(thread.data, text, selectedCommandId);
    // Agents read plain text themselves; only a slash command picks a command.
    if (agent && !resolved.explicit) return send(text.trim());
    if (!resolved.command)
      throw new Error(
        resolved.explicit
          ? `Unknown slash command ${text.trim().split(/\s/)[0]}.`
          : "This app has no runnable command yet.",
      );
    const command = resolved.command;
    const positional = command.revision?.positionalParameter;
    const needsForm =
      !positional ||
      command.revision?.options.some((option) => option.required && option.name !== positional);
    if (positional && resolved.input && !needsForm) {
      const args = { [positional]: resolved.input };
      return agent
        ? send(text.trim(), command.id, args)
        : prepare({ commandId: command.id, arguments: args });
    }
    setDialogText(resolved.input);
    setDialogCommand(command);
    return Promise.resolve();
  }

  const openOffer = stream.snapshot.data?.offers.find((offer) => offer.status === "OPEN");
  const presale = thread.data?.presale ?? null;
  const sendDisabled =
    !thread.data ||
    thread.data.app.availability !== "AVAILABLE" ||
    Boolean(thread.data.archivedAt) ||
    busy !== null ||
    Boolean(pendingQuote) ||
    Boolean(thread.data.activeQuoteId) ||
    (agent && presale?.remaining === 0);

  const runtime = useExternalStoreRuntime({
    messages: stream.messages,
    convertMessage: (message) => ({
      id: message.id,
      role: message.role,
      content: [{ type: "text", text: message.text }],
      metadata: { custom: message.label ? { label: message.label } : {} },
    }),
    isRunning:
      stream.snapshot.data?.invocations.some((inv) =>
        ["QUEUED", "ACKED", "RUNNING", "WAITING_BUYER"].includes(inv.executionStatus),
      ) ?? false,
    isSendDisabled: sendDisabled,
    onNew: async (message) => {
      const text = message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (!text) return;
      setComposerText("");
      try {
        await submitText(text);
      } catch (cause) {
        setError(readableError(cause));
      }
    },
  });

  const answer = async (question: ChatQuestion, values: Record<string, unknown>) => {
    await answerQuestion(question.invocationId, question.questionId, values, crypto.randomUUID());
    await Promise.all([
      stream.refresh(),
      queryClient.invalidateQueries({ queryKey: ["thread", threadId, "snapshot"] }),
      queryClient.invalidateQueries({ queryKey: ["thread", threadId, "details"] }),
    ]);
  };

  const slashQuery =
    composerText.startsWith("/") && !composerText.includes(" ")
      ? composerText.slice(1).toLowerCase()
      : null;
  const suggestions =
    slashQuery === null
      ? []
      : commands.filter((command) => command.name.toLowerCase().startsWith(slashQuery)).slice(0, 6);
  const questions = stream.snapshot.data?.questions ?? [];
  const openQuestions = questions.filter((question) => question.status === "OPEN");
  const widgetQuestionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const surface of stream.surfaces)
      for (const id of surfaceQuestionIds(surface.content.source)) ids.add(id);
    return ids;
  }, [stream.surfaces]);

  const selected =
    commands.find((command) => command.id === selectedCommandId) ??
    commands.find((command) => command.id === thread.data?.defaultCommandId) ??
    commands[0];
  const status = pendingQuote
    ? "AWAITING_AUTHORIZATION"
    : (stream.snapshot.data?.invocations.at(0)?.executionStatus ?? "READY");

  if (thread.isPending || stream.snapshot.isPending)
    return <LoadingState className="px-8">Opening thread…</LoadingState>;
  if (thread.isError || stream.snapshot.isError || !thread.data)
    return (
      <div className="p-6">
        <ErrorNotice
          onRetry={() => {
            void thread.refetch();
            void stream.refresh();
          }}
        >
          {readableError(thread.error || stream.snapshot.error)}
        </ErrorNotice>
      </div>
    );

  const data = thread.data;
  const offline = data.app.availability !== "AVAILABLE";
  const banner =
    "border-b border-border bg-background-deep px-6 py-2.5 font-mono text-[11px] leading-relaxed text-warning";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-5 border-b border-border px-5 py-4 sm:px-7">
        <div className="min-w-0">
          <Eyebrow className="text-faint">THREAD / {threadId.slice(0, 8)}</Eyebrow>
          <h2 className="mt-1.5 truncate text-[clamp(1.15rem,2vw,1.6rem)] font-medium tracking-[-0.025em]">
            {data.title || data.app.name}
          </h2>
          <span className="text-xs text-faint">
            {data.app.name} · {selected ? `/${selected.name}` : "no command"} ·{" "}
            {plural(data.commands.length, "slash command")}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 font-mono text-[10px] uppercase">
          <span
            className={cn(
              "flex items-center gap-1.5 text-primary",
              stream.connection !== "connected" && "text-warning",
            )}
          >
            <Radio size={12} className={cn(stream.connection === "connected" && "animate-pulse")} />
            {stream.connection}
          </span>
          <Badge variant="outline">{status}</Badge>
        </div>
      </div>

      {offline && (
        <div className={banner} role="status">
          {data.app.status === "ARCHIVED"
            ? "This app is archived. It can't take new requests; earlier messages and results stay readable."
            : data.app.availability === "SUSPENDED"
              ? "The owner has suspended this app. It can't take new requests; earlier messages and results stay readable."
              : "This app is offline until its worker checks in again. Earlier messages and results stay readable."}
        </div>
      )}
      {data.archivedAt && (
        <div className={banner} role="status">
          This thread is archived. Start a new thread to keep going.
        </div>
      )}

      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
          <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-5 py-7 sm:px-[clamp(1.25rem,4vw,3.75rem)]">
            <ThreadPrimitive.Empty>
              <div className="my-auto py-14">
                <Eyebrow className="text-faint">01 / Start a conversation</Eyebrow>
                <h3 className="mt-5 max-w-md text-[clamp(1.8rem,4vw,3rem)] leading-[1.07] font-medium tracking-[-0.05em]">
                  Ask {data.app.name} something.
                </h3>
                {agent ? (
                  <p className="mt-5 max-w-md leading-7 text-muted-foreground">
                    Describe what you need. Messages are free: {data.app.name} replies and sends an
                    offer with a price. You pay only if you accept it. Type{" "}
                    <code className="font-mono text-primary">/</code> to use a command.
                  </p>
                ) : (
                  <p className="mt-5 max-w-md leading-7 text-muted-foreground">
                    Plain text goes to{" "}
                    <code className="font-mono text-primary">/{selected?.name ?? "default"}</code>.
                    Type <code className="font-mono text-primary">/</code> to pick another command.
                    You see a quote before every request.
                  </p>
                )}
                <div className="mt-6 flex flex-wrap gap-2">
                  {commands.slice(0, 5).map((command) => (
                    <Button
                      key={command.id}
                      variant="outline"
                      size="sm"
                      className="bg-background-deep font-mono text-primary hover:border-primary"
                      onClick={() => {
                        setDialogText("");
                        setDialogCommand(command);
                      }}
                    >
                      /{command.name}
                    </Button>
                  ))}
                </div>
              </div>
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages
              components={{ UserMessage: BuyerMessage, AssistantMessage: AssistantReply }}
            />
            {stream.surfaces.map((surface) => (
              <OpenUISurface
                key={surface.messageId}
                source={surface.content.source}
                questions={questions}
                invocationId={surface.content.invocationId}
                onAnswer={answer}
              />
            ))}
            {openQuestions
              .filter((question) => !widgetQuestionIds.has(question.questionId))
              .map((question) => (
                <ChatWidget
                  key={question.id}
                  label="App question"
                  meta={question.invocationId.slice(0, 8)}
                  aria-label="Provider question"
                >
                  <QuestionForm
                    question={question}
                    onSubmit={(values) => answer(question, values)}
                  />
                </ChatWidget>
              ))}
            {stream.snapshot.data?.invocations
              .filter((inv) => inv.executionStatus === "DELIVERED" && inv.output !== null)
              .map((inv) => {
                const used = stream.snapshot.data!.revisions.filter(
                  (revision) => revision.invocationId === inv.id,
                ).length;
                const remaining = Math.max(0, (data.revisionPolicy?.maxIncluded ?? 0) - used);
                return (
                  <ChatWidget
                    key={inv.id}
                    label="Verified output"
                    meta={inv.id.slice(0, 8)}
                    aria-label="Verified structured result"
                  >
                    <pre className="max-h-105 overflow-auto font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
                      {JSON.stringify(inv.output, null, 2)}
                    </pre>
                    {inv.files.length > 0 && (
                      <ul aria-label="Delivered files" className="mt-3 grid gap-1.5">
                        {inv.files.map((file) => (
                          <li key={file.fileId} className="min-w-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="max-w-full font-mono"
                              onClick={() =>
                                void downloadFile(file.fileId).catch((cause) =>
                                  setError(readableError(cause)),
                                )
                              }
                            >
                              <Download />
                              <span className="truncate">{file.name}</span>
                              <span className="text-faint">{formatBytes(file.size)}</span>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {remaining > 0 && (
                      <RevisionControl invocationId={inv.id} remaining={remaining} />
                    )}
                  </ChatWidget>
                );
              })}
            <ThreadPrimitive.ViewportFooter className="sticky bottom-0" />
          </ThreadPrimitive.Viewport>

          <div className="relative shrink-0 border-t border-border bg-card px-4 pt-2.5 pb-3.5 sm:px-6">
            {slashQuery !== null && suggestions.length > 0 && (
              <div
                role="listbox"
                aria-label="Slash commands"
                className="absolute inset-x-4 bottom-[calc(100%-4px)] z-20 grid max-h-68 overflow-y-auto border border-border-strong bg-background-deep shadow-float animate-in fade-in-0 slide-in-from-bottom-1 sm:inset-x-6"
              >
                {suggestions.map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    role="option"
                    aria-selected={command.id === selected?.id}
                    className="grid grid-cols-[minmax(5rem,auto)_minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-3.5 py-2.5 text-left text-muted-foreground last:border-b-0 hover:bg-card aria-selected:bg-card"
                    onClick={() => {
                      setSelectedCommandId(command.id);
                      setComposerText("");
                      setDialogText("");
                      setDialogCommand(command);
                    }}
                  >
                    <code className="font-mono text-xs text-primary">/{command.name}</code>
                    <span className="truncate text-xs">{command.description}</span>
                    <small className="font-mono text-[10px] text-faint">
                      {formatCommandPrice(command.revision)}
                    </small>
                  </button>
                ))}
              </div>
            )}
            {pendingQuote && !quoteHidden && (
              <div className="mb-3">
                <PaymentConfirm
                  quote={pendingQuote}
                  onHide={() => setQuoteHidden(true)}
                  onPaid={paid}
                />
              </div>
            )}
            {agent && openOffer && !pendingQuote && !data.activeQuoteId && (
              <OfferCard
                offer={openOffer}
                command={data.commands.find(
                  (command) => command.revision?.id === openOffer.commandRevisionId,
                )}
                busy={busy === "quoting"}
                onAccept={() => void prepare({ offerId: openOffer.id }).catch(() => undefined)}
                onDecline={() =>
                  void declineOffer(threadId, openOffer.id)
                    .then(refreshThread)
                    .catch((cause) => setError(readableError(cause)))
                }
              />
            )}
            {pendingQuote && quoteHidden && (
              <Button
                variant="outline"
                size="sm"
                className="mb-2 bg-background-deep font-mono text-primary"
                onClick={() => setQuoteHidden(false)}
              >
                <CircleDollarSign /> Review pending quote · {formatUsdc(pendingQuote.grossAmount)}
              </Button>
            )}
            {attachments.length > 0 && (
              <ul aria-label="Attachments" className="flex flex-wrap gap-2 pb-1">
                {attachments.map((item) => (
                  <li
                    key={item.key}
                    className={cn(
                      "inline-flex max-w-full min-w-0 items-center gap-2 border px-2.5 py-1 font-mono text-[11px]",
                      item.status === "error"
                        ? "border-destructive text-destructive"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {item.status === "uploading" ? (
                      <Spinner className="size-3" aria-label="Uploading" />
                    ) : (
                      <Paperclip size={12} aria-hidden="true" />
                    )}
                    <span className="max-w-48 truncate text-foreground">{item.name}</span>
                    <span className="truncate">
                      {item.status === "error" ? item.error : formatBytes(item.size)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      className="text-faint hover:text-foreground"
                      onClick={() =>
                        setAttachments((current) => current.filter(({ key }) => key !== item.key))
                      }
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {agent ? (
              <div className="flex items-center gap-3.5 pt-1 font-mono text-[10px] text-faint">
                <span className="inline-flex items-center gap-1.5">
                  <Slash size={12} /> Type / for commands
                </span>
                {presale && (
                  <span
                    className={cn(
                      "ml-auto",
                      presale.remaining === 0 ? "text-warning" : "text-primary",
                    )}
                  >
                    {presale.remaining === 0
                      ? "Free messages used up · accept an offer to continue"
                      : `${presale.remaining}/${presale.limit} free messages`}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3.5 pt-1 font-mono text-[10px] text-faint">
                <label className="inline-flex min-w-0 items-center gap-1.5">
                  <Slash size={12} />
                  <span>Command</span>
                  <select
                    aria-label="Selected command"
                    value={selected?.id ?? ""}
                    onChange={(event) => setSelectedCommandId(event.target.value)}
                    className="bg-transparent px-0.5 py-1 text-[11px] text-foreground"
                  >
                    {commands.map((command) => (
                      <option key={command.id} value={command.id}>
                        /{command.name}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="hidden truncate sm:inline">
                  {selected?.revision?.positionalParameter
                    ? `Plain text → ${selected.revision.positionalParameter}`
                    : "Options open in a form"}
                </span>
                <span className="ml-auto text-primary">
                  {selected ? formatCommandPrice(selected.revision) : ""}
                </span>
              </div>
            )}
            <ComposerPrimitive.Root className="flex items-end gap-3 pt-2">
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                accept={ACCEPTED_FILE_TYPES.join(",")}
                onChange={(event) => {
                  attach(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                className="size-12 shrink-0"
                aria-label="Attach files"
                disabled={sendDisabled}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip />
              </Button>
              <ComposerPrimitive.Input
                rows={2}
                placeholder={
                  offline ? "App unavailable. History is read-only." : `Message ${data.app.name}…`
                }
                aria-label="Message the app"
                onChange={(event) => setComposerText(event.currentTarget.value)}
                className="min-w-0 flex-1 resize-none border border-border bg-background px-3.5 py-3 text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
              />
              <ComposerPrimitive.Send
                aria-label={agent ? "Send message" : "Get a quote"}
                className="grid size-12 shrink-0 place-items-center bg-primary text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={18} />
              </ComposerPrimitive.Send>
            </ComposerPrimitive.Root>
          </div>
        </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>

      {busy && (
        <p className="flex items-center gap-2 px-6 py-2 font-mono text-xs text-muted-foreground">
          <Spinner className="size-3.5" /> {busy === "quoting" ? "Preparing quote…" : "Sending…"}
        </p>
      )}
      {error && <ErrorNotice className="mx-6 my-3 w-auto">{error}</ErrorNotice>}
      <footer className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border px-5 py-1.5 font-mono text-[10px] text-faint sm:px-6">
        <span>AG-UI STREAM / OPENUI LANG</span>
        <span>{plural(stream.snapshot.data?.invocations.length ?? 0, "paid invocation")}</span>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => void stream.refresh()}
          aria-label="Refresh thread status"
        >
          <RefreshCcw /> Refresh
        </Button>
      </footer>

      <CommandDialog
        command={dialogCommand}
        initialText={dialogText}
        kind={kind}
        onClose={() => setDialogCommand(null)}
        onSubmit={async (command, values) => {
          if (!command.revision) return;
          if (!agent) return prepare({ commandId: command.id, arguments: values });
          const positional = command.revision.positionalParameter;
          const text =
            positional && typeof values[positional] === "string" ? values[positional] : "";
          await send(`/${command.name}${text ? ` ${text}` : ""}`, command.id, values);
        }}
      />
    </div>
  );
}
