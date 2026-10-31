"use client";

import { usePageMeta } from "@/src/app/head";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  unstable_useSlashCommandAdapter,
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
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { ErrorNotice, LoadingState } from "@/src/components/layout/page-kit";
import { formatCommandPrice } from "@/src/features/apps/format";
import {
  getThread,
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

// Plain text is a message to the bot; `/name rest` picks one of its commands.
function commandForText(thread: ThreadDetail, text: string) {
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

function unavailableNotice(thread: ThreadDetail) {
  if (thread.archivedAt) return "This thread is archived. Start a new thread to keep going.";
  if (thread.app.status === "ARCHIVED")
    return "This app is archived. Earlier messages and results stay readable.";
  if (thread.app.availability === "SUSPENDED")
    return "The owner has suspended this app. Earlier messages and results stay readable.";
  if (thread.app.availability !== "AVAILABLE")
    return "This app is offline until its worker checks in again. Earlier messages and results stay readable.";
  return null;
}

export function ThreadChat({ threadId }: { threadId: string }) {
  const queryClient = useQueryClient();
  const thread = useQuery({
    queryKey: ["thread", threadId, "details"],
    queryFn: () => getThread(threadId),
  });
  usePageMeta({ title: thread.data?.title || thread.data?.app.name || "Chat" });
  const { timeline, connection } = useThreadTimeline(threadId);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<{
    command: ThreadCommand;
    text: string;
    fileIds: string[];
  } | null>(null);
  const messages = useMemo(() => timeline.data?.messages ?? [], [timeline.data]);
  const maps = useMemo(() => lookups(messages), [messages]);
  const attachments = useMemo(() => new ThreadAttachmentAdapter(threadId), [threadId]);
  const commands = useMemo(
    () => (thread.data?.commands ?? []).filter((command) => command.revision),
    [thread.data],
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
  };
  const setTimeline = (update: (current: Timeline) => Timeline) =>
    queryClient.setQueryData<Timeline>(timelineKey(threadId), (current) =>
      current ? update(current) : current,
    );

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
    setTimeline((current) => ({
      ...current,
      messages: [
        ...current.messages,
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
      ],
    }));
    try {
      await sendMessage(threadId, {
        content,
        ...(options.command
          ? { commandId: options.command.id, arguments: options.arguments ?? {} }
          : {}),
        fileIds: options.fileIds ?? [],
      });
      setError("");
    } catch (cause) {
      setTimeline((current) => ({
        ...current,
        messages: current.messages.filter((message) => message.id !== localId),
      }));
      setError(readable(cause));
      throw cause;
    } finally {
      void queryClient.invalidateQueries({ queryKey: timelineKey(threadId) });
    }
  }

  async function onNew(message: AppendMessage) {
    if (!thread.data) return;
    const text = message.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n")
      .trim();
    const fileIds = (message.attachments ?? []).flatMap((attachment) =>
      (attachment.content ?? []).flatMap((part) => (part.type === "file" ? [part.data] : [])),
    );
    const resolved = commandForText(thread.data, text);
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

  const notice = thread.data ? unavailableNotice(thread.data) : null;
  const presale = thread.data?.presale;
  const last = messages.at(-1);
  const replying =
    !notice &&
    last?.role === "user" &&
    !last.id.startsWith("local-") &&
    !last.parts.some((part) => part.type === "tool-call" && part.toolName === "revision");
  const sendBlocked =
    Boolean(notice) || presale?.remaining === 0 || Boolean(thread.data?.activeQuoteId);

  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage: toThreadMessage,
    onNew,
    isLoading: timeline.isPending,
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
    threadId,
    thread: thread.data,
    appName: thread.data?.app.name ?? "App",
    appImageUrl: thread.data?.app.imageUrl ?? null,
    ...maps,
    uploadFile: (file) => uploadThreadFile(threadId, file),
    refresh,
    submitTool: async (toolCallId, result) => {
      await submitToolResult(threadId, toolCallId, result);
      await queryClient.invalidateQueries({ queryKey: timelineKey(threadId) });
    },
    acceptOffer: async (offerId) => {
      await quoteFor(threadId, offerId, buyerFiles);
      await refresh();
    },
  };

  if (thread.isPending) return <LoadingState className="px-8">Loading the thread</LoadingState>;
  if (thread.isError || !thread.data)
    return (
      <ErrorNotice className="m-6">
        {thread.error ? readable(thread.error) : "This thread is not available."}
      </ErrorNotice>
    );
  const data = thread.data;
  const offline = data.app.availability !== "AVAILABLE";

  return (
    <ThreadChatContext.Provider value={value}>
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-3 sm:px-6">
            <AgentAvatar
              name={data.app.name}
              imageUrl={data.app.imageUrl}
              className="size-10 text-base"
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-medium tracking-[-0.02em]">
                {data.title || data.app.name}
              </h1>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn("size-1.5 rounded-full", offline ? "bg-faint" : "bg-primary")}
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
                  "font-mono text-xs",
                  presale.remaining === 0 ? "text-warning" : "text-muted-foreground",
                )}
              >
                {presale.remaining}/{presale.limit} free messages
              </p>
            )}
          </header>

          {notice && (
            <p
              role="status"
              className="border-b border-border bg-background-deep px-6 py-2.5 text-sm text-muted-foreground"
            >
              {notice}
            </p>
          )}

          <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
            <ThreadPrimitive.Viewport className="relative flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-4 py-6 sm:px-[clamp(1.5rem,4vw,3.5rem)]">
              <div className="sticky top-0 z-10 flex justify-center empty:hidden">
                <ConnectionState
                  phase={connection.phase}
                  attempt={connection.attempt}
                  className="shadow-float"
                />
              </div>
              <ThreadPrimitive.Empty>
                <div className="mx-auto my-auto grid w-full max-w-2xl gap-5 py-10">
                  <div className="grid gap-2">
                    <h2 className="text-2xl font-medium tracking-[-0.03em]">
                      What should {data.app.name} do?
                    </h2>
                    <p className="max-w-lg text-sm leading-6 text-muted-foreground">
                      Messages and commands are free. {data.app.name} may ask for details, then
                      sends an offer. You pay only if you accept it, and the vault holds the amount
                      until the work is delivered.
                    </p>
                  </div>
                  {commands.length > 0 && (
                    <ul aria-label="Commands" className="grid border-y border-border">
                      {commands.slice(0, 6).map((command) => (
                        <li key={command.id} className="border-b border-border last:border-b-0">
                          <button
                            type="button"
                            onClick={() => setDialog({ command, text: "", fileIds: [] })}
                            disabled={sendBlocked}
                            className="grid w-full grid-cols-[minmax(6rem,auto)_minmax(0,1fr)] items-baseline gap-x-4 gap-y-0.5 px-1 py-3 text-left transition-colors hover:bg-muted/60 disabled:opacity-50 sm:grid-cols-[minmax(7rem,auto)_minmax(0,1fr)_auto]"
                          >
                            <code className="font-mono text-sm text-primary">/{command.name}</code>
                            <span className="truncate text-sm text-muted-foreground">
                              {command.description}
                            </span>
                            <span className="col-start-2 font-mono text-xs text-faint sm:col-start-auto">
                              {formatCommandPrice(command.revision)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages>
                {({ message }) =>
                  message.role === "user" ? <UserMessage /> : <AssistantMessage />
                }
              </ThreadPrimitive.Messages>
              {replying && <ReplyingIndicator label={`${data.app.name} is replying`} />}
              <ThreadPrimitive.ViewportFooter className="pointer-events-none sticky bottom-0 mt-auto flex justify-center pt-2">
                <ThreadPrimitive.ScrollToBottom
                  aria-label="Scroll to latest"
                  className="pointer-events-auto grid size-9 place-items-center border border-border-strong bg-card text-muted-foreground shadow-float transition-colors hover:text-foreground disabled:invisible"
                >
                  <ArrowDown size={16} />
                </ThreadPrimitive.ScrollToBottom>
              </ThreadPrimitive.ViewportFooter>
            </ThreadPrimitive.Viewport>

            <div className="shrink-0 border-t border-border bg-card px-3 pt-3 pb-3 sm:px-[clamp(1.5rem,4vw,3.5rem)]">
              {error && <ErrorNotice className="mt-0 mb-3">{error}</ErrorNotice>}
              <ComposerPrimitive.TriggerPopoverRoot>
                <ComposerPrimitive.Root className="relative border border-border-strong bg-background transition-colors focus-within:border-primary">
                  <ComposerTriggerPopover
                    char="/"
                    adapter={slash.adapter}
                    action={slash.action}
                    fallbackIcon={SquareSlash}
                    emptyItemsLabel="No command with that name"
                    className="w-[min(28rem,calc(100vw-2rem))] border-border-strong shadow-float"
                  />
                  <div className="px-3 pt-3 empty:hidden">
                    <ComposerAttachments />
                  </div>
                  <ComposerPrimitive.Input
                    rows={1}
                    autoFocus
                    placeholder={
                      notice
                        ? "History is read-only"
                        : data.activeQuoteId
                          ? "A paid job is running. Answer its requests above."
                          : "Describe what you need, or type / for commands"
                    }
                    aria-label={`Message ${data.app.name}`}
                    className="block max-h-48 min-h-14 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-sm leading-relaxed outline-none placeholder:text-faint"
                  />
                  <div className="flex items-center gap-2 px-2 pb-2">
                    <ComposerAddAttachment />
                    <span className="hidden items-center gap-1.5 text-xs text-faint sm:inline-flex">
                      <SquareSlash size={13} aria-hidden /> commands
                    </span>
                    <ComposerPrimitive.Send
                      aria-label="Send message"
                      className="ml-auto grid size-9 shrink-0 place-items-center bg-primary text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowUp size={17} />
                    </ComposerPrimitive.Send>
                  </div>
                </ComposerPrimitive.Root>
              </ComposerPrimitive.TriggerPopoverRoot>
            </div>
          </ThreadPrimitive.Root>
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
