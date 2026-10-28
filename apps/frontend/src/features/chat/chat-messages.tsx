"use client";

import { useContext } from "react";
import {
  ActionBarPrimitive,
  MessagePrimitive,
  useAuiState,
  type TextMessagePartProps,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { TooltipIconButton } from "@/src/components/assistant-ui/elements/tooltip-icon-button";
import { TypingIndicator } from "@/src/components/assistant-ui/elements/typing-indicator";
import { FilePart } from "@/src/features/chat/file-part";
import { RunBody } from "@/src/features/chat/run-message";
import { ThreadChatContext, type MessageKind } from "@/src/features/chat/thread-runtime";
import { toolUIs } from "@/src/features/chat/tool-uis";
import { cn } from "@/src/lib/utils";

const time = (date: Date | undefined) =>
  date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

function AppMark({ className }: { className?: string }) {
  const name = useContext(ThreadChatContext)?.appName ?? "App";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center border border-border-strong font-mono text-xs font-semibold text-foreground uppercase max-sm:hidden",
        className,
      )}
    >
      {name.trim().slice(0, 2) || "AP"}
    </span>
  );
}

// Bot chat text is shown verbatim: no markdown, so nothing in it can pass
// for Payvoke UI. Paid run output renders as markdown in the run body.
function PlainText({ text }: TextMessagePartProps) {
  return <p className="leading-relaxed break-words whitespace-pre-wrap">{text}</p>;
}

function Tool(props: ToolCallMessagePartProps) {
  const Component = toolUIs[props.toolName as keyof typeof toolUIs];
  return Component ? (
    <Component {...(props as ToolCallMessagePartProps<Record<string, unknown>>)} />
  ) : null;
}

const partComponents = {
  Text: PlainText,
  File: FilePart,
  tools: { Override: Tool },
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
      <MessagePrimitive.Root className="flex items-start gap-3 self-start">
        <AppMark className="invisible" />
        <MessagePrimitive.Parts components={partComponents} />
      </MessagePrimitive.Root>
    );

  return (
    <MessagePrimitive.Root
      className={cn(
        "group flex items-start gap-3 self-start",
        run ? "w-full" : "max-w-[min(90%,44rem)] max-sm:max-w-full",
      )}
    >
      <AppMark />
      <div className="grid min-w-0 flex-1 gap-2">
        <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{chat?.appName ?? "App"}</span>
          {run ? "Paid job" : null}
          <span className="font-mono text-[11px] text-faint">{time(createdAt)}</span>
        </span>
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

// The other side owes a reply: the bot answering free chat.
export function ReplyingIndicator({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 self-start">
      <AppMark className="opacity-70" />
      <div className="flex items-center gap-3 border border-border bg-card px-4 py-3">
        <TypingIndicator variant="bare" aria-hidden />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
