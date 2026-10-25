"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import {
  CircleDollarSign,
  LoaderCircle,
  Radio,
  RefreshCcw,
  Send,
  ShieldCheck,
  Slash,
  X,
} from "lucide-react";
import { useConnection, usePublicClient, useSignTypedData } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { isHex, type Address, type Hex } from "viem";
import type { QuoteDocument } from "@payvoke/x402";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { OpenUISurface, surfaceQuestionIds } from "./openui-surface";
import { QuestionForm } from "./question-form";
import { apiOrigin } from "@/src/lib/api";
import { formatUsdc } from "@/src/lib/apps";
import {
  answerQuestion,
  checkGrant,
  getPendingQuote,
  getSnapshot,
  getThread,
  quoteFor,
  requestRevision,
  submitSigned,
  type AguiEvent,
  type ChatQuestion,
  type ChatSnapshot,
  type CommandOption,
  type ThreadCommand,
  type ThreadDetail,
} from "@/src/lib/paid-chat";

type ChatMessage = { id: string; role: "user" | "assistant"; text: string; complete: boolean };
type Surface = ChatSnapshot["surfaces"][number];
const readableError = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Request failed.";
const answerText = (values: Record<string, unknown>) => {
  const entries = Object.values(values);
  return entries.length === 1 && typeof entries[0] === "string"
    ? entries[0]
    : JSON.stringify(values);
};

function normalize(snapshot: ChatSnapshot) {
  const messages: ChatMessage[] = [];
  for (const prompt of snapshot.prompts) {
    messages.push({ id: prompt.quoteId, role: "user", text: prompt.text, complete: true });
    for (const reply of snapshot.messages.filter((m) => m.invocationId === prompt.invocationId)) {
      messages.push({
        id: reply.messageId,
        role: "assistant",
        text: reply.content,
        complete: reply.complete,
      });
    }
    for (const answer of snapshot.answers.filter(
      (item) => item.invocationId === prompt.invocationId,
    )) {
      messages.push({
        id: `answer-${answer.invocationId}-${answer.questionId}`,
        role: "user",
        text: answerText(answer.arguments),
        complete: true,
      });
    }
  }
  return messages;
}

function useStream(threadId: string) {
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
    setMessages(normalize(snapshot.data));
    setSurfaces(snapshot.data.surfaces);
  }, [snapshot.data]);

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
      setMessages(normalize(data));
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
  }, [threadId, ready, queryClient]);

  return { messages, surfaces, connection, snapshot, refresh: () => snapshot.refetch() };
}

function BuyerMessage() {
  return (
    <MessagePrimitive.Root className="run-message is-user">
      <span className="run-message-label">YOU</span>
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}
function AssistantReply() {
  return (
    <MessagePrimitive.Root className="run-message is-assistant">
      <span className="run-message-label">APP · LIVE OUTPUT</span>
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}

function RevisionControl({ invocationId, remaining }: { invocationId: string; remaining: number }) {
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
    <form className="run-revision" onSubmit={(event) => void submit(event)}>
      <label htmlFor={`revision-${invocationId}`}>What should change?</label>
      <Textarea
        id={`revision-${invocationId}`}
        rows={2}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        required
        maxLength={2000}
      />
      <div className="run-payment-actions">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" /> : null} Request revision
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
      {error && (
        <div className="run-error" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}

function OptionField({
  option,
  value,
  onChange,
}: {
  option: CommandOption;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = `command-option-${option.name}`;
  if (option.type === "BOOLEAN")
    return (
      <label className="run-question-check" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        {option.name} {option.required && <span aria-hidden="true">*</span>}
      </label>
    );
  if (option.choices?.length)
    return (
      <label htmlFor={id}>
        {option.name} {option.required && <span aria-hidden="true">*</span>}
        <select
          id={id}
          value={String(value ?? "")}
          required={option.required}
          onChange={(event) => {
            const raw = event.target.value;
            if (!raw) return onChange("");
            const choice = option.choices?.find((item) => String(item) === raw);
            onChange(choice ?? raw);
          }}
        >
          <option value="">Choose…</option>
          {option.choices.map((choice) => (
            <option key={String(choice)} value={String(choice)}>
              {String(choice)}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <label htmlFor={id}>
      {option.name} {option.required && <span aria-hidden="true">*</span>}
      <Input
        id={id}
        type={option.type === "STRING" ? "text" : "number"}
        step={option.type === "INTEGER" ? 1 : option.type === "NUMBER" ? "any" : undefined}
        value={String(value ?? "")}
        required={option.required}
        min={option.min ?? option.minLength}
        max={option.max ?? option.maxLength}
        onChange={(event) =>
          onChange(
            option.type === "STRING"
              ? event.target.value
              : event.target.value === ""
                ? ""
                : Number(event.target.value),
          )
        }
      />
    </label>
  );
}

function CommandDialog({
  command,
  initialText,
  onClose,
  onSubmit,
}: {
  command: ThreadCommand | null;
  initialText: string;
  onClose: () => void;
  onSubmit: (command: ThreadCommand, values: Record<string, unknown>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!command) return;
    const next: Record<string, unknown> = {};
    const textTarget =
      command.revision?.positionalParameter ??
      command.revision?.options.find((option) => option.type === "STRING")?.name;
    for (const option of command.revision?.options ?? []) {
      if (option.type === "BOOLEAN") next[option.name] = false;
      else next[option.name] = option.name === textTarget && initialText ? initialText : "";
    }
    setValues(next);
    setError("");
  }, [command, initialText]);
  if (!command || !command.revision) return null;
  const revision = command.revision;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="command-dialog">
        <DialogHeader>
          <DialogTitle>
            <code>/{command.name}</code>
          </DialogTitle>
        </DialogHeader>
        <p className="command-dialog-description">{command.description}</p>
        <p className="command-dialog-price">{formatUsdc(revision.grossAmount)} per request</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const payload = Object.fromEntries(
              Object.entries(values).filter(([, value]) => value !== ""),
            );
            void onSubmit(command, payload)
              .then(onClose)
              .catch((cause) => setError(readableError(cause)))
              .finally(() => setBusy(false));
          }}
        >
          {revision.options.map((option) => (
            <OptionField
              key={option.name}
              option={option}
              value={values[option.name]}
              onChange={(value) => setValues((current) => ({ ...current, [option.name]: value }))}
            />
          ))}
          {error && (
            <div className="run-error" role="alert">
              {error}
            </div>
          )}
          <div className="run-payment-actions">
            <Button type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : null} Prepare quote
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
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

function QuoteCard({
  quote,
  onAuthorize,
  onHide,
  busy,
}: {
  quote: QuoteDocument;
  onAuthorize: (grantId: string) => Promise<void>;
  onHide: () => void;
  busy: boolean;
}) {
  const [grantId, setGrantId] = useState("");
  const [error, setError] = useState("");
  return (
    <section className="composer-quote" aria-label="Quote awaiting authorization">
      <div className="composer-quote-head">
        <div className="composer-quote-icon">
          <CircleDollarSign size={18} />
        </div>
        <div>
          <strong>{formatUsdc(quote.grossAmount)}</strong>
          <span>
            Expires {new Date(quote.validUntil * 1000).toLocaleTimeString()} · Avalanche Fuji
          </span>
        </div>
        <button type="button" onClick={onHide} aria-label="Hide quote">
          <X size={15} />
        </button>
      </div>
      <p>
        The vault reserves this amount before the app receives your request. Delivery stays
        unverified until Payvoke checks it.
      </p>
      <label htmlFor="chat-grant">Delegated grant ID (bytes32)</label>
      <Input
        id="chat-grant"
        value={grantId}
        onChange={(event) => setGrantId(event.target.value)}
        placeholder="0x…"
        autoComplete="off"
      />
      <div className="run-payment-actions">
        <Button
          disabled={busy}
          onClick={() => {
            setError("");
            void onAuthorize(grantId).catch((cause) => setError(readableError(cause)));
          }}
        >
          <ShieldCheck size={15} /> {busy ? "Authorizing…" : "Authorize in wallet"}
        </Button>
        <Button variant="outline" onClick={onHide} disabled={busy}>
          Hide
        </Button>
      </div>
      {error && (
        <div className="run-error" role="alert">
          {error}
        </div>
      )}
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
  const stream = useStream(threadId);
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
  const [busy, setBusy] = useState<"quoting" | "signing" | null>(null);
  const [error, setError] = useState("");
  const { address, chainId } = useConnection();
  const publicClient = usePublicClient({ chainId: avalancheFuji.id });
  const { signTypedDataAsync } = useSignTypedData();
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

  async function prepare(commandId: string, args: Record<string, unknown>) {
    if (!thread.data) return;
    setError("");
    setBusy("quoting");
    try {
      const result = await quoteFor(thread.data, commandId, args);
      setQuote(result);
      setQuoteHidden(false);
      await stream.refresh();
      void queryClient.invalidateQueries({ queryKey: ["thread", threadId, "details"] });
    } catch (cause) {
      setError(readableError(cause));
      throw cause;
    } finally {
      setBusy(null);
    }
  }

  async function authorize(grant: string) {
    if (!pendingQuote || !address || chainId !== avalancheFuji.id || !publicClient) {
      throw new Error("Connect the authorized signer wallet on Avalanche Fuji.");
    }
    if (!isHex(grant, { strict: true }) || grant.length !== 66)
      throw new Error("Enter a valid 32-byte delegated grant ID.");
    setBusy("signing");
    try {
      const buyer = pendingQuote.protocolQuote.buyer as Address;
      const { epoch } = await checkGrant(pendingQuote, grant as Hex, buyer, address, (args) =>
        publicClient.readContract(args),
      );
      await submitSigned(pendingQuote, grant as Hex, epoch, (args) => signTypedDataAsync(args));
      setQuote(null);
      setQuoteHidden(false);
      void queryClient.invalidateQueries({ queryKey: ["thread", threadId, "pending-quote"] });
      void queryClient.invalidateQueries({ queryKey: ["thread", threadId, "details"] });
      await stream.refresh();
    } finally {
      setBusy(null);
    }
  }

  function submitText(text: string) {
    if (!thread.data) return;
    const resolved = commandForText(thread.data, text, selectedCommandId);
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
    if (positional && resolved.input && !needsForm)
      return prepare(command.id, { [positional]: resolved.input });
    setDialogText(resolved.input);
    setDialogCommand(command);
    return Promise.resolve();
  }

  const runtime = useExternalStoreRuntime({
    messages: stream.messages,
    convertMessage: (message) => ({
      id: message.id,
      role: message.role,
      content: [{ type: "text", text: message.text }],
    }),
    isRunning:
      stream.snapshot.data?.invocations.some((inv) =>
        ["QUEUED", "ACKED", "RUNNING", "WAITING_BUYER"].includes(inv.executionStatus),
      ) ?? false,
    isSendDisabled:
      !thread.data ||
      thread.data.app.availability !== "AVAILABLE" ||
      Boolean(thread.data.archivedAt) ||
      busy !== null ||
      Boolean(pendingQuote) ||
      Boolean(thread.data.activeQuoteId),
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
    return (
      <div className="run-state">
        <LoaderCircle className="animate-spin" /> Opening thread…
      </div>
    );
  if (thread.isError || stream.snapshot.isError || !thread.data)
    return (
      <div className="run-state" role="alert">
        {readableError(thread.error || stream.snapshot.error)}{" "}
        <Button
          onClick={() => {
            void thread.refetch();
            void stream.refresh();
          }}
        >
          Retry
        </Button>
      </div>
    );

  const data = thread.data;
  const offline = data.app.availability !== "AVAILABLE";
  return (
    <div className="run-stage thread-stage">
      <div className="run-stage-top">
        <div>
          <p>THREAD / {threadId.slice(0, 8)}</p>
          <h2>{data.title || data.app.name}</h2>
          <span>
            {data.app.name} · {selected ? `/${selected.name}` : "no command"} ·{" "}
            {data.commands.length} slash command
            {data.commands.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="run-status">
          <span>
            <Radio size={13} /> {stream.connection}
          </span>
          <span>{status}</span>
        </div>
      </div>

      {offline && (
        <div className="thread-banner" role="status">
          {data.app.status === "ARCHIVED"
            ? "This app has been archived. New quotes are blocked; previous messages and results remain readable."
            : data.app.availability === "SUSPENDED"
              ? "This app is suspended by its owner. New quotes are blocked; previous messages and results remain readable."
              : "This app is offline. New quotes are blocked until its provider heartbeat returns. Previous messages and results remain readable."}
        </div>
      )}
      {data.archivedAt && (
        <div className="thread-banner" role="status">
          This thread is archived. Unarchive support is coming; start a new thread to continue.
        </div>
      )}

      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root className="run-thread">
          <ThreadPrimitive.Viewport className="run-thread-viewport">
            <ThreadPrimitive.Empty>
              <div className="run-empty">
                <p>01 / START A CONVERSATION</p>
                <h3>Ask {data.app.name} anything.</h3>
                <span>
                  Type free text to use <code>/{selected?.name ?? "default"}</code>, or type{" "}
                  <code>/</code> to pick another command. Every request gets an explicit quote.
                </span>
                <div className="thread-command-chips">
                  {commands.slice(0, 5).map((command) => (
                    <button
                      key={command.id}
                      type="button"
                      onClick={() => {
                        setDialogText("");
                        setDialogCommand(command);
                      }}
                    >
                      /{command.name}
                    </button>
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
                <section key={question.id} className="run-widget" aria-label="Provider question">
                  <header>
                    APP QUESTION <span>{question.invocationId.slice(0, 8)}</span>
                  </header>
                  <QuestionForm
                    question={question}
                    onSubmit={(values) => answer(question, values)}
                  />
                </section>
              ))}
            {stream.snapshot.data?.invocations
              .filter((inv) => inv.executionStatus === "DELIVERED" && inv.output !== null)
              .map((inv) => {
                const used = stream.snapshot.data!.revisions.filter(
                  (revision) => revision.invocationId === inv.id,
                ).length;
                const remaining = Math.max(0, (data.revisionPolicy?.maxIncluded ?? 0) - used);
                return (
                  <section
                    key={inv.id}
                    className="run-widget"
                    aria-label="Verified structured result"
                  >
                    <header>
                      VERIFIED OUTPUT <span>{inv.id.slice(0, 8)}</span>
                    </header>
                    <pre className="run-result-json">{JSON.stringify(inv.output, null, 2)}</pre>
                    {remaining > 0 && (
                      <RevisionControl invocationId={inv.id} remaining={remaining} />
                    )}
                  </section>
                );
              })}
            <ThreadPrimitive.ViewportFooter className="run-viewport-footer" />
          </ThreadPrimitive.Viewport>

          <div className="run-composer-wrap">
            {slashQuery !== null && suggestions.length > 0 && (
              <div className="slash-popover" role="listbox" aria-label="Slash commands">
                {suggestions.map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    role="option"
                    aria-selected={command.id === selected?.id}
                    onClick={() => {
                      setSelectedCommandId(command.id);
                      setComposerText("");
                      setDialogText("");
                      setDialogCommand(command);
                    }}
                  >
                    <code>/{command.name}</code>
                    <span>{command.description}</span>
                    <small>{formatUsdc(command.revision?.grossAmount)}</small>
                  </button>
                ))}
              </div>
            )}
            {pendingQuote && !quoteHidden && (
              <QuoteCard
                quote={pendingQuote}
                busy={busy === "signing"}
                onHide={() => setQuoteHidden(true)}
                onAuthorize={authorize}
              />
            )}
            {pendingQuote && quoteHidden && (
              <button
                type="button"
                className="composer-quote-restore"
                onClick={() => setQuoteHidden(false)}
              >
                <CircleDollarSign size={15} /> Review pending quote ·{" "}
                {formatUsdc(pendingQuote.grossAmount)}
              </button>
            )}
            <div className="composer-toolbar">
              <div className="composer-command-picker">
                <Slash size={13} />
                <span>Command</span>
                <select
                  aria-label="Selected command"
                  value={selected?.id ?? ""}
                  onChange={(event) => setSelectedCommandId(event.target.value)}
                >
                  {commands.map((command) => (
                    <option key={command.id} value={command.id}>
                      /{command.name}
                    </option>
                  ))}
                </select>
              </div>
              <span className="composer-hint">
                {selected?.revision?.positionalParameter
                  ? `Free text → ${selected.revision.positionalParameter}`
                  : "Command options open in a form"}
              </span>
              <span>{selected ? formatUsdc(selected.revision?.grossAmount) : ""}</span>
            </div>
            <ComposerPrimitive.Root className="run-composer">
              <ComposerPrimitive.Input
                className="run-composer-input"
                rows={2}
                placeholder={
                  offline ? "App unavailable — history is read-only" : `Message ${data.app.name}…`
                }
                aria-label="Message the app"
                onChange={(event) => setComposerText(event.currentTarget.value)}
              />
              <ComposerPrimitive.Send className="run-send" aria-label="Prepare quote">
                <Send size={18} />
              </ComposerPrimitive.Send>
            </ComposerPrimitive.Root>
          </div>
        </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>

      {busy === "quoting" && (
        <p className="run-live-note">
          <LoaderCircle className="animate-spin" size={14} /> Preparing immutable quote…
        </p>
      )}
      {error && (
        <div className="run-error" role="alert">
          {error}
        </div>
      )}
      <footer className="run-stage-footer">
        <span>AG-UI STREAM / OPENUI LANG</span>
        <span>{stream.snapshot.data?.invocations.length ?? 0} paid invocations</span>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => void stream.refresh()}
          aria-label="Refresh thread status"
        >
          <RefreshCcw size={13} /> Refresh
        </Button>
      </footer>

      <CommandDialog
        command={dialogCommand}
        initialText={dialogText}
        onClose={() => setDialogCommand(null)}
        onSubmit={async (command, values) => {
          if (!command.revision) return;
          await prepare(command.id, values);
        }}
      />
    </div>
  );
}
