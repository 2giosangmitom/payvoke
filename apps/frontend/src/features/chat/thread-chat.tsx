"use client";

import { usePageMeta } from "@/src/app/head";
import { useContext, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  ThreadPrimitive,
  unstable_useSlashCommandAdapter,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
} from "@assistant-ui/react";
import { ArrowDown, ArrowUp, SquareSlash } from "lucide-react";
import {
  ComposerAddAttachment,
  ComposerAttachments,
} from "@/src/components/assistant-ui/elements/attachment.aui";
import { ComposerTriggerPopover } from "@/src/components/assistant-ui/elements/composer-trigger-popover.aui";
import { ConnectionState } from "@/src/components/assistant-ui/elements/connection-state";
import { TooltipIconButton } from "@/src/components/assistant-ui/elements/tooltip-icon-button";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { ErrorNotice } from "@/src/components/layout/page-kit";
import { Skeleton } from "@/src/components/ui/skeleton";
import { getStoreApp, type StoreAppDetail } from "@/src/features/apps/api";
import { formatCommandPrice } from "@/src/features/apps/format";
import {
  getThread,
  newThread,
  sendMessage,
  submitToolResult,
  type ThreadCommand,
  type ThreadDetail,
  type Timeline,
  type TimelineFilePart,
  type TimelineMessage,
  type TimelineRun,
  type TimelineToolPart,
} from "@/src/features/chat/api";
import {
  AssistantMessage,
  ReplyingIndicator,
  UserMessage,
} from "@/src/features/chat/chat-messages";
import { uploadThreadFile } from "@/src/features/chat/files";
import { SchemaForm, type UploadFile } from "@/src/features/chat/schema-form";
import {
  ThreadAttachmentAdapter,
  ThreadChatContext,
  toThreadMessage,
  type ThreadChatValue,
} from "@/src/features/chat/thread-runtime";
import { timelineKey, useThreadTimeline } from "@/src/features/chat/use-timeline";
import { quoteFor } from "@/src/features/payments/api";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import { cn } from "@/src/lib/utils";

const MAX_QUOTE_FILES = 10;
const readable = (cause: unknown) => (cause instanceof Error ? cause.message : "Request failed.");

// What the chat shows about its thread. A draft (no thread yet) has no
// free-message allowance to show until the thread exists.
type ChatDetail = Omit<ThreadDetail, "presale"> & { presale: ThreadDetail["presale"] | null };

// A new chat before its first message: the agent's store entry stands in for
// the thread, so the composer is ready without a round trip that creates one.
function draftDetail(app: StoreAppDetail): ChatDetail {
  // Same pick as the API's thread view: the default command, else the first.
  const command = app.commands.find((item) => item.id === app.defaultCommandId) ?? app.commands[0];
  return {
    id: "",
    appId: app.id,
    title: null,
    archivedAt: null,
    app: {
      id: app.id,
      name: app.name,
      description: app.description,
      visibility: app.visibility,
      status: app.status,
      imageUrl: app.imageUrl,
      availability: app.availability,
    },
    activeQuoteId: null,
    defaultCommandId: command?.id ?? "",
    chatTextParameter: command?.revision?.positionalParameter ?? null,
    revisionPolicy: command?.revision?.terms.revisionPolicy ?? null,
    commands: app.commands,
    presale: null,
  };
}

// Plain text is a message to the bot; `/name rest` picks one of its commands.
function commandForText(thread: ChatDetail, text: string) {
  const commands = thread.commands.filter((command) => command.revision);
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return { command: undefined, input: trimmed, explicit: false };
  const slash = /^\/([a-z][a-z0-9_]{0,31})(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!slash) return { command: undefined, input: trimmed, explicit: true };
  const command = commands.find((item) => item.name === slash[1]);
  return { command, input: (slash[2] ?? "").trim(), explicit: true };
}

function CommandDialog({
  command,
  initialText,
  uploadFile,
  onClose,
  onSubmit,
}: {
  command: ThreadCommand | null;
  initialText: string;
  uploadFile: UploadFile;
  onClose: () => void;
  onSubmit: (command: ThreadCommand, values: Record<string, unknown>) => Promise<void>;
}) {
  if (!command?.revision) return null;
  const revision = command.revision;
  const textTarget =
    revision.positionalParameter ??
    revision.options.find((option) => option.type === "STRING")?.name;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono text-primary">/{command.name}</DialogTitle>
          <DialogDescription>{command.description}</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {formatCommandPrice(revision)}. The app replies with an offer before you pay.
        </p>
        <SchemaForm
          key={command.id}
          schema={revision.inputSchema}
          initial={textTarget && initialText ? { [textTarget]: initialText } : {}}
          submitLabel="Send"
          uploadFile={uploadFile}
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

// Everything a tool UI looks up by id, rebuilt once per timeline.
function lookups(messages: TimelineMessage[]) {
  const tools = new Map<string, TimelineToolPart>();
  const files = new Map<string, TimelineFilePart>();
  const runs = new Map<string, TimelineRun>();
  for (const message of messages) {
    if (message.run) runs.set(message.id, message.run);
    for (const part of message.parts) {
      if (part.type === "tool-call") tools.set(part.toolCallId, part);
      else if (part.type === "file") files.set(part.fileId, part);
    }
  }
  return { tools, files, runs };
}

function unavailableNotice(thread: ChatDetail) {
  if (thread.archivedAt) return "This thread is archived. Start a new thread to keep going.";
  if (thread.app.status === "ARCHIVED")
    return "This app is archived. Earlier messages and results stay readable.";
  if (thread.app.availability === "SUSPENDED")
    return "The owner has suspended this app. Earlier messages and results stay readable.";
  if (thread.app.availability !== "AVAILABLE")
    return "This app is offline until its worker checks in again. Earlier messages and results stay readable.";
  return null;
}

// The thread's shape while it loads: the header, a few messages in the
// centered column the real ones use, and the composer under them.
function ThreadSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex min-h-0 flex-1 flex-col">
      <span className="sr-only">Loading the chat</span>
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 sm:px-6">
        <Skeleton className="size-10" />
        <div className="grid gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col gap-7 px-4 pt-6 sm:px-6 [--thread-max-width:64rem]">
        {[
          { side: "end", width: 45 },
          { side: "start", lines: [92, 78, 55] },
          { side: "end", width: 30 },
          { side: "start", lines: [86, 60] },
        ].map((message, index) =>
          message.side === "end" ? (
            <Skeleton
              key={index}
              className="h-11 self-end"
              style={{ width: `${message.width}%` }}
            />
          ) : (
            <div key={index} className="flex w-full gap-3">
              <Skeleton className="size-8 shrink-0 max-sm:hidden" />
              <div className="grid flex-1 gap-2.5 pt-1">
                <Skeleton className="h-3 w-24" />
                {message.lines?.map((width) => (
                  <Skeleton key={width} className="h-3.5" style={{ width: `${width}%` }} />
                ))}
              </div>
            </div>
          ),
        )}
        <div className="mt-auto pb-5">
          <Skeleton className="h-[6.5rem] w-full" />
        </div>
      </div>
    </div>
  );
}

// One chat. With `threadId` it shows that thread. With `appId` it is a draft:
// the composer opens at once and the thread is created only when the buyer
// sends the first message (or attaches the first file, which needs a thread
// to upload into). After that first send the page moves to the thread's URL.
export function ThreadChat(props: { threadId: string } | { appId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const draftAppId = "appId" in props ? props.appId : null;
  const [threadId, setThreadId] = useState<string | null>(
    "threadId" in props ? props.threadId : null,
  );
  const thread = useQuery({
    queryKey: ["thread", threadId, "details"],
    queryFn: () => getThread(threadId!),
    enabled: Boolean(threadId),
  });
  const draftApp = useQuery({
    queryKey: ["store", "app", draftAppId],
    queryFn: () => getStoreApp(draftAppId!),
    enabled: Boolean(draftAppId),
    staleTime: 30_000,
  });
  const detail: ChatDetail | undefined =
    thread.data ?? (draftApp.data ? draftDetail(draftApp.data) : undefined);
  usePageMeta({ title: detail?.title || detail?.app.name || "Chat" });
  const { timeline, connection } = useThreadTimeline(threadId);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<{
    command: ThreadCommand;
    text: string;
    fileIds: string[];
  } | null>(null);
  // Messages typed before the thread exists; they seed its timeline.
  const [draft, setDraftState] = useState<TimelineMessage[]>([]);
  const draftRef = useRef<TimelineMessage[]>([]);
  const setDraft = (update: (current: TimelineMessage[]) => TimelineMessage[]) => {
    draftRef.current = update(draftRef.current);
    setDraftState(draftRef.current);
  };
  const creating = useRef<Promise<string> | null>(null);
  const timelineMessages = timeline.data?.messages;
  const messages = useMemo(
    () => (threadId ? (timelineMessages ?? []) : draft),
    [threadId, timelineMessages, draft],
  );
  const maps = useMemo(() => lookups(messages), [messages]);
  const commands = useMemo(
    () => (detail?.commands ?? []).filter((command) => command.revision),
    [detail],
  );

  // The thread, created once on first need. A failed create is retried by
  // the next send.
  const threadRef = useRef(threadId);
  threadRef.current = threadId;
  const ensureThread = (): Promise<string> => {
    if (threadRef.current) return Promise.resolve(threadRef.current);
    if (!draftAppId) return Promise.reject(new Error("This chat has no thread."));
    creating.current ??= newThread(draftAppId)
      .then((created) => {
        queryClient.setQueryData<Timeline>(timelineKey(created.id), {
          cursor: "0",
          messages: draftRef.current,
        });
        threadRef.current = created.id;
        setThreadId(created.id);
        void queryClient.invalidateQueries({ queryKey: ["threads"] });
        return created.id;
      })
      .catch((cause) => {
        creating.current = null;
        throw cause;
      });
    return creating.current;
  };
  const ensureRef = useRef(ensureThread);
  ensureRef.current = ensureThread;
  // One adapter for the chat's life; it reaches the thread through the ref.
  const [attachments] = useState(() => new ThreadAttachmentAdapter(() => ensureRef.current()));

  const refresh = async () => {
    if (threadRef.current)
      await queryClient.invalidateQueries({ queryKey: ["thread", threadRef.current] });
  };
  // Edits the messages wherever they live now: the draft, or the thread's
  // cached timeline.
  const editMessages = (update: (current: TimelineMessage[]) => TimelineMessage[]) => {
    const id = threadRef.current;
    if (!id) return setDraft(update);
    queryClient.setQueryData<Timeline>(timelineKey(id), (current) =>
      current ? { ...current, messages: update(current.messages) } : current,
    );
  };

  // The message shows at once and is swapped for the stored one when the
  // API answers; a failure takes it back out and says why.
  async function send(
    content: string,
    options: {
      command?: ThreadCommand;
      arguments?: Record<string, unknown>;
      fileIds?: string[];
    } = {},
  ) {
    const localId = `local-${crypto.randomUUID()}`;
    const files = (options.fileIds ?? []).flatMap((id) => {
      const part = maps.files.get(id);
      return part ? [part] : [];
    });
    editMessages((current) => [
      ...current,
      {
        id: localId,
        role: "user",
        createdAt: new Date().toISOString(),
        status: "complete",
        run: null,
        parts: [
          ...(options.command
            ? [
                {
                  type: "tool-call" as const,
                  toolCallId: `command-${localId}`,
                  toolName: "command",
                  args: {
                    commandId: options.command.id,
                    arguments: options.arguments ?? {},
                  } as TimelineToolPart["args"],
                  result: null,
                  status: "done" as const,
                },
              ]
            : []),
          {
            type: "text" as const,
            id: localId,
            text: content,
            format: "plain" as const,
            streaming: false,
          },
          ...files,
        ],
      },
    ]);
    let id: string | null = null;
    try {
      id = await ensureThread();
      await sendMessage(id, {
        content,
        ...(options.command
          ? { commandId: options.command.id, arguments: options.arguments ?? {} }
          : {}),
        fileIds: options.fileIds ?? [],
      });
      setError("");
    } catch (cause) {
      editMessages((current) => current.filter((message) => message.id !== localId));
      setError(readable(cause));
      throw cause;
    } finally {
      if (id) void queryClient.invalidateQueries({ queryKey: timelineKey(id) });
    }
    // A draft becomes a real thread: load it, then take its URL. Its details
    // and timeline are cached, so the thread page opens without a skeleton.
    if (draftAppId) {
      const threadId = id;
      await queryClient
        .ensureQueryData({
          queryKey: ["thread", threadId, "details"],
          queryFn: () => getThread(threadId),
        })
        .catch(() => undefined);
      void navigate({ to: "/console/chat/$threadId", params: { threadId }, replace: true });
    }
  }

  async function onNew(message: AppendMessage) {
    if (!detail) return;
    const text = message.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n")
      .trim();
    const fileIds = (message.attachments ?? []).flatMap((attachment) =>
      (attachment.content ?? []).flatMap((part) => (part.type === "file" ? [part.data] : [])),
    );
    const resolved = commandForText(detail, text);
    if (!resolved.explicit) return send(text || "Sent files", { fileIds });
    if (!resolved.command) {
      setError(`Unknown slash command ${text.split(/\s/)[0]}.`);
      return;
    }
    const command = resolved.command;
    const positional = command.revision?.positionalParameter;
    const needsForm =
      !positional ||
      command.revision?.options.some((option) => option.required && option.name !== positional);
    if (positional && resolved.input && !needsForm)
      return send(text, { command, arguments: { [positional]: resolved.input }, fileIds });
    setDialog({ command, text: resolved.input, fileIds });
  }

  const slash = unstable_useSlashCommandAdapter({
    commands: commands.map((command) => ({
      id: command.id,
      label: `/${command.name}`,
      description: `${command.description} · ${formatCommandPrice(command.revision)}`,
      execute: () => setDialog({ command, text: "", fileIds: [] }),
    })),
    removeOnExecute: true,
  });

  const notice = detail ? unavailableNotice(detail) : null;
  const presale = detail?.presale;
  const last = messages.at(-1);
  const replying =
    !notice &&
    last?.role === "user" &&
    !last.id.startsWith("local-") &&
    !last.parts.some((part) => part.type === "tool-call" && part.toolName === "revision");
  const sendBlocked = Boolean(notice) || presale?.remaining === 0 || Boolean(detail?.activeQuoteId);

  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage: toThreadMessage,
    onNew,
    isLoading: Boolean(threadId) && timeline.isPending && !timelineMessages,
    isDisabled: Boolean(notice),
    isSendDisabled: sendBlocked,
    adapters: { attachments },
  });

  // Buyer files sent in this thread go along with the quote, newest first.
  const buyerFiles = useMemo(
    () =>
      messages
        .filter((message) => message.role === "user")
        .flatMap((message) =>
          message.parts.flatMap((part) => (part.type === "file" ? [part.fileId] : [])),
        )
        .slice(-MAX_QUOTE_FILES),
    [messages],
  );

  const value: ThreadChatValue = {
    threadId: threadId ?? "",
    thread: thread.data,
    appName: detail?.app.name ?? "App",
    appImageUrl: detail?.app.imageUrl ?? null,
    ...maps,
    uploadFile: async (file) => uploadThreadFile(await ensureThread(), file),
    refresh,
    submitTool: async (toolCallId, result) => {
      const id = await ensureThread();
      await submitToolResult(id, toolCallId, result);
      await queryClient.invalidateQueries({ queryKey: timelineKey(id) });
    },
    acceptOffer: async (offerId) => {
      await quoteFor(await ensureThread(), offerId, buyerFiles);
      await refresh();
    },
  };

  const pending = draftAppId ? draftApp.isPending : thread.isPending;
  const failure = draftAppId ? draftApp.error : thread.error;
  if (!detail && pending) return <ThreadSkeleton />;
  if (!detail)
    return (
      <ErrorNotice className="m-6">
        {failure
          ? readable(failure)
          : draftAppId
            ? "This agent is not available."
            : "This thread is not available."}
      </ErrorNotice>
    );
  const data = detail;
  const offline = data.app.availability !== "AVAILABLE";

  return (
    <ThreadChatContext.Provider value={value}>
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
            <AgentAvatar
              name={data.app.name}
              imageUrl={data.app.imageUrl}
              className="size-10 text-base"
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-medium tracking-[-0.02em]">
                {data.title || data.app.name}
              </h1>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn("size-1.5", offline ? "bg-faint" : "bg-primary")}
                  />
                  {data.app.name} is {offline ? "offline" : "online"}
                </span>
                <span aria-hidden>·</span>
                <span>
                  {commands.length} {commands.length === 1 ? "command" : "commands"}
                </span>
              </p>
            </div>
            {presale && (
              <p
                className={cn(
                  "shrink-0 border px-2 py-1 font-mono text-[11px] tabular-nums",
                  presale.remaining === 0
                    ? "border-warning/50 text-warning"
                    : "border-border text-muted-foreground",
                )}
                title="Free messages left before the next paid job"
              >
                {presale.remaining}/{presale.limit} free
              </p>
            )}
          </header>

          {notice && (
            <p
              role="status"
              className="border-b border-border bg-background-deep px-6 py-2.5 text-center text-sm text-muted-foreground"
            >
              {notice}
            </p>
          )}

          <ThreadView
            appName={data.app.name}
            commands={commands}
            connection={connection}
            error={error}
            replying={replying}
            sendBlocked={sendBlocked}
            placeholder={
              notice
                ? "This chat is read-only"
                : data.activeQuoteId
                  ? "A paid job is running. Answer its requests above."
                  : `Message ${data.app.name}, or type / for commands`
            }
            slash={slash}
            onCommand={(command) => setDialog({ command, text: "", fileIds: [] })}
          />
        </div>
        <CommandDialog
          command={dialog?.command ?? null}
          initialText={dialog?.text ?? ""}
          uploadFile={value.uploadFile}
          onClose={() => setDialog(null)}
          onSubmit={async (command, values) => {
            const positional = command.revision?.positionalParameter;
            const text =
              positional && typeof values[positional] === "string" ? values[positional] : "";
            await send(`/${command.name}${text ? ` ${text}` : ""}`, {
              command,
              arguments: values,
              fileIds: dialog?.fileIds,
            });
          }}
        />
      </AssistantRuntimeProvider>
    </ThreadChatContext.Provider>
  );
}

// The thread itself, laid out like assistant-ui's Thread: one centered
// column for messages, with the composer pinned to the bottom of that same
// column, so messages and the input always share their edges. An empty chat
// centers its welcome and the composer together.
function ThreadView({
  appName,
  commands,
  connection,
  error,
  replying,
  sendBlocked,
  placeholder,
  slash,
  onCommand,
}: {
  appName: string;
  commands: ThreadCommand[];
  connection: ReturnType<typeof useThreadTimeline>["connection"];
  error: string;
  replying: boolean;
  sendBlocked: boolean;
  placeholder: string;
  slash: ReturnType<typeof unstable_useSlashCommandAdapter>;
  onCommand: (command: ThreadCommand) => void;
}) {
  const isEmpty = useAuiState((s) => s.thread.isEmpty);
  return (
    <ThreadPrimitive.Root
      className="flex min-h-0 flex-1 flex-col"
      style={{ ["--thread-max-width" as string]: "64rem" }}
    >
      <ThreadPrimitive.Viewport className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain scroll-smooth">
        <div
          className={cn(
            "mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4 pt-6 sm:px-6",
            isEmpty && "justify-center",
          )}
        >
          <div className="sticky top-0 z-10 flex justify-center empty:hidden">
            <ConnectionState
              phase={connection.phase}
              attempt={connection.attempt}
              className="shadow-float"
            />
          </div>

          <AuiIf condition={(s) => s.thread.isEmpty}>
            <ThreadWelcome appName={appName} />
          </AuiIf>

          <div className="mb-10 flex flex-col gap-y-7 empty:hidden">
            <ThreadPrimitive.Messages>
              {({ message }) => (message.role === "user" ? <UserMessage /> : <AssistantMessage />)}
            </ThreadPrimitive.Messages>
            {replying && <ReplyingIndicator label={`${appName} is replying`} />}
          </div>

          <ThreadPrimitive.ViewportFooter
            className={cn(
              "flex flex-col gap-3 bg-card pb-4 md:pb-5",
              !isEmpty &&
                "sticky bottom-0 mt-auto before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-linear-to-t before:from-card before:to-transparent",
            )}
          >
            <ThreadPrimitive.ScrollToBottom asChild>
              <TooltipIconButton
                tooltip="Scroll to latest"
                variant="outline"
                className="absolute -top-14 z-10 size-9 self-center bg-card p-2 shadow-float disabled:invisible"
              >
                <ArrowDown />
              </TooltipIconButton>
            </ThreadPrimitive.ScrollToBottom>
            {error && <ErrorNotice className="my-0">{error}</ErrorNotice>}
            <Composer
              appName={appName}
              placeholder={placeholder}
              slash={slash}
              hasCommands={commands.length > 0}
            />
            {isEmpty && commands.length > 0 && (
              <CommandSuggestions
                commands={commands}
                disabled={sendBlocked}
                onCommand={onCommand}
              />
            )}
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function ThreadWelcome({ appName }: { appName: string }) {
  const chat = useContext(ThreadChatContext);
  return (
    <div className="mb-6 grid justify-items-start gap-4">
      <AgentAvatar
        name={appName}
        imageUrl={chat?.appImageUrl}
        className="size-12 text-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300"
      />
      <div className="grid gap-2 motion-safe:animate-in motion-safe:fill-mode-both motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:delay-75 motion-safe:duration-300">
        <h2 className="text-2xl font-medium tracking-[-0.03em]">What should {appName} do?</h2>
        <p className="max-w-lg text-sm leading-6 text-muted-foreground">
          Messages and commands are free. {appName} may ask for details, then sends an offer. You
          pay only if you accept it, and the vault holds the amount until the work is delivered.
        </p>
      </div>
    </div>
  );
}

// The agent's commands under an empty composer, like assistant-ui's
// suggestions: each opens its form.
function CommandSuggestions({
  commands,
  disabled,
  onCommand,
}: {
  commands: ThreadCommand[];
  disabled: boolean;
  onCommand: (command: ThreadCommand) => void;
}) {
  return (
    <ul aria-label="Commands" className="grid gap-px">
      {commands.slice(0, 6).map((command, index) => (
        <li
          key={command.id}
          className="motion-safe:animate-in motion-safe:fill-mode-both motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 motion-safe:ease-out"
          style={{ animationDelay: `${80 + index * 40}ms` }}
        >
          <button
            type="button"
            onClick={() => onCommand(command)}
            disabled={disabled}
            className="group flex w-full items-baseline gap-3 px-2 py-2 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none disabled:opacity-50"
          >
            <code className="shrink-0 font-mono text-primary">/{command.name}</code>
            <span className="min-w-0 flex-1 truncate text-muted-foreground group-hover:text-foreground">
              {command.description}
            </span>
            <span className="shrink-0 font-mono text-xs text-faint">
              {formatCommandPrice(command.revision)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Composer({
  appName,
  placeholder,
  slash,
  hasCommands,
}: {
  appName: string;
  placeholder: string;
  slash: ReturnType<typeof unstable_useSlashCommandAdapter>;
  hasCommands: boolean;
}) {
  const aui = useAui();
  return (
    <ComposerPrimitive.TriggerPopoverRoot>
      <ComposerPrimitive.Root className="relative w-full">
        <ComposerTriggerPopover
          char="/"
          adapter={slash.adapter}
          action={slash.action}
          fallbackIcon={SquareSlash}
          emptyItemsLabel="No command with that name"
          className="w-[min(28rem,calc(100vw-2rem))] border-border-strong shadow-float"
        />
        <ComposerPrimitive.AttachmentDropzone asChild>
          <div className="flex w-full cursor-text flex-col gap-1 border border-border-strong bg-background p-2 transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-primary focus-within:shadow-[0_0_0_3px_var(--color-primary-soft)] has-[textarea:disabled]:bg-muted/50 data-[dragging=true]:border-dashed data-[dragging=true]:border-primary data-[dragging=true]:bg-primary-soft/40">
            <ComposerAttachments />
            <ComposerPrimitive.Input
              rows={1}
              autoFocus
              enterKeyHint="send"
              placeholder={placeholder}
              aria-label={`Message ${appName}`}
              className="max-h-48 min-h-11 w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-6 caret-primary outline-none placeholder:text-faint disabled:cursor-not-allowed"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <ComposerAddAttachment />
                {hasCommands && (
                  <TooltipIconButton
                    tooltip="Commands"
                    side="top"
                    className="size-9 p-2 text-muted-foreground hover:text-foreground"
                    onClick={() => aui.composer().setText("/")}
                  >
                    <SquareSlash />
                  </TooltipIconButton>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-faint max-sm:hidden">
                  Enter to send · Shift+Enter for a new line
                </span>
                <ComposerPrimitive.Send
                  aria-label="Send message"
                  className="grid size-9 shrink-0 place-items-center bg-primary text-primary-foreground transition-[background-color,scale,opacity] duration-150 ease-out hover:bg-primary-hover active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ArrowUp size={18} />
                </ComposerPrimitive.Send>
              </div>
            </div>
          </div>
        </ComposerPrimitive.AttachmentDropzone>
      </ComposerPrimitive.Root>
    </ComposerPrimitive.TriggerPopoverRoot>
  );
}
