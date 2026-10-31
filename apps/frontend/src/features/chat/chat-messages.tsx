"use client";

import { useContext, useEffect, useState } from "react";
import {
  ActionBarPrimitive,
  MessagePrimitive,
  useAuiState,
  type TextMessagePartProps,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { TooltipIconButton } from "@/src/components/assistant-ui/elements/tooltip-icon-button";
import { ThinkingIndicator } from "@/src/components/assistant-ui/elements/thinking-indicator";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import { StreamdownText } from "@/src/features/chat/assistant-ui/streamdown-text";
import { FilePart } from "@/src/features/chat/file-part";
import { RunBody } from "@/src/features/chat/run-message";
import { ThreadChatContext, type MessageKind } from "@/src/features/chat/thread-runtime";
import { CommandData, toolUIs } from "@/src/features/chat/tool-uis";
import { cn } from "@/src/lib/utils";

// Messages rise into place once, when they first mount; reduced motion keeps them still.
const enter =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 motion-safe:ease-out";

const time = (date: Date | undefined) =>
  date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

// The agent's own picture (its initial when it has none), the same square
// avatar the store uses, so a buyer recognises the agent across the app.
function AppMark({ className }: { className?: string }) {
  const chat = useContext(ThreadChatContext);
  return (
    <AgentAvatar
      name={chat?.appName ?? "App"}
      imageUrl={chat?.appImageUrl}
      className={cn("size-8 text-sm max-sm:hidden", className)}
    />
  );
}

// Buyer text is shown verbatim. Agent replies are markdown, rendered by the
// same hardened Streamdown as paid run output: no raw HTML, no images, and
// every link opens behind a confirmation.
function MessageText({ text }: TextMessagePartProps) {
  const role = useAuiState((s) => s.message.role);
  const running = useAuiState((s) => s.message.status?.type === "running");
  const chat = useContext(ThreadChatContext);
  // A streamed reply that has no text yet: the agent is still thinking.
  if (role === "assistant" && running && !text)
    return <ThinkingIndicator label={`${chat?.appName ?? "The agent"} is writing`} />;
  if (role === "assistant") return <StreamdownText />;
  return <p className="leading-relaxed break-words whitespace-pre-wrap">{text}</p>;
}

function Tool(props: ToolCallMessagePartProps) {
  const Component = toolUIs[props.toolName as keyof typeof toolUIs];
  return Component ? (
    <Component {...(props as ToolCallMessagePartProps<Record<string, unknown>>)} />
  ) : null;
}

const partComponents = {
  Text: MessageText,
  File: FilePart,
  tools: { Override: Tool },
  data: { by_name: { command: CommandData } },
};

export function UserMessage() {
  const createdAt = useAuiState((s) => s.message.createdAt);
  const pending = useAuiState(
    (s) => (s.message.metadata.custom?.["kind"] as MessageKind | undefined) === "pending",
  );
  return (
    <MessagePrimitive.Root
      className={cn(
        "grid max-w-[min(85%,40rem)] justify-items-end gap-1.5 self-end max-sm:max-w-[92%]",
        enter,
        pending && "opacity-70",
      )}
    >
      <div className="grid min-w-0 justify-items-end gap-2 border border-primary/30 bg-primary-soft px-4 py-3 text-sm *:max-w-full">
        <MessagePrimitive.Parts components={partComponents} />
      </div>
      <span className="font-mono text-[11px] text-faint">
        {pending ? "Sending" : time(createdAt)}
      </span>
    </MessagePrimitive.Root>
  );
}

function MessageHeader({
  name,
  label,
  createdAt,
}: {
  name: string;
  label?: string;
  createdAt: Date | undefined;
}) {
  return (
    <span className="flex min-h-8 items-center gap-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{name}</span>
      {label && <span>{label}</span>}
      <time className="font-mono text-[11px] text-faint" dateTime={createdAt?.toISOString()}>
        {time(createdAt)}
      </time>
    </span>
  );
}

export function AssistantMessage() {
  const chat = useContext(ThreadChatContext);
  const id = useAuiState((s) => s.message.id);
  const createdAt = useAuiState((s) => s.message.createdAt);
  const kind = useAuiState(
    (s) => (s.message.metadata.custom?.["kind"] as MessageKind | undefined) ?? "conversation",
  );
  const run = chat?.runs.get(id);

  if (kind === "offer")
    return (
      <MessagePrimitive.Root className={cn("flex max-w-full items-start gap-3 self-start", enter)}>
        <AppMark />
        <div className="grid min-w-0 gap-2">
          <MessageHeader name={chat?.appName ?? "App"} createdAt={createdAt} />
          <MessagePrimitive.Parts components={partComponents} />
        </div>
      </MessagePrimitive.Root>
    );

  return (
    <MessagePrimitive.Root
      className={cn(
        "group flex items-start gap-3 self-start",
        enter,
        run ? "w-full max-w-4xl" : "max-w-[min(90%,44rem)] max-sm:max-w-full",
      )}
    >
      <AppMark />
      <div className="grid min-w-0 flex-1 gap-2">
        <MessageHeader
          name={chat?.appName ?? "App"}
          label={run ? "Paid job" : undefined}
          createdAt={createdAt}
        />
        {run ? (
          <RunBody run={run} />
        ) : (
          <div className="grid gap-3 text-sm">
            <MessagePrimitive.Parts components={partComponents} />
          </div>
        )}
        <ActionBarPrimitive.Root
          hideWhenRunning
          autohide="not-last"
          className="flex gap-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-floating:opacity-100"
        >
          <ActionBarPrimitive.Copy asChild>
            <TooltipIconButton tooltip="Copy" className="size-7">
              <MessagePrimitive.If copied>
                <CheckIcon />
              </MessagePrimitive.If>
              <MessagePrimitive.If copied={false}>
                <CopyIcon />
              </MessagePrimitive.If>
            </TooltipIconButton>
          </ActionBarPrimitive.Copy>
        </ActionBarPrimitive.Root>
      </div>
    </MessagePrimitive.Root>
  );
}

// The other side owes a reply: the bot answering free chat. The label
// shimmers and the seconds count up, so a slow model still reads as alive.
export function ReplyingIndicator({ label }: { label: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-3 self-start", enter)}
    >
      <AppMark className="opacity-70" />
      <div className="flex items-center gap-3 border border-border bg-card px-4 py-3">
        <ThinkingIndicator label={label} elapsed={seconds >= 3 ? `${seconds}s` : undefined} />
      </div>
    </div>
  );
}
