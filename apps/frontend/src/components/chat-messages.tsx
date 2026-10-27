"use client";

import { Suspense, createContext, lazy, useContext, type ReactNode } from "react";
import {
  ActionBarPrimitive,
  MessagePrimitive,
  useAuiState,
  type TextMessagePartProps,
} from "@assistant-ui/react";
import { CheckIcon, CopyIcon, Handshake, UserRound } from "lucide-react";
import { TooltipIconButton } from "./assistant-ui/elements/tooltip-icon-button";
import { cn } from "@/src/lib/utils";

// The app on the other side of the thread, for avatars and indicators.
export const ChatAppContext = createContext<{ name: string }>({ name: "App" });

function AppAvatar({ className }: { className?: string }) {
  const { name } = useContext(ChatAppContext);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center border border-primary bg-primary-soft font-mono text-xs font-semibold text-primary uppercase max-sm:hidden",
        className,
      )}
    >
      {name.trim().slice(0, 2) || "AP"}
    </span>
  );
}

function MessageLabel({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-2 font-mono text-[10px] tracking-widest text-faint uppercase">
      {children}
    </span>
  );
}

// Provider pre-sale text is shown verbatim: no markdown, so no links or
// formatting can pass for Payvoke UI.
function PlainText({ text }: TextMessagePartProps) {
  return <span className="whitespace-pre-wrap">{text}</span>;
}

// Streamdown and its highlighter are heavy; the chat shell loads without them
// and app output shows as plain text until the renderer arrives.
const StreamdownText = lazy(() =>
  import("./assistant-ui/elements/streamdown-text").then((m) => ({ default: m.StreamdownText })),
);
function AppText(props: TextMessagePartProps) {
  return (
    <Suspense fallback={<PlainText {...props} />}>
      <StreamdownText />
    </Suspense>
  );
}

export function BuyerMessage() {
  return (
    <MessagePrimitive.Root className="group flex max-w-[min(85%,44rem)] flex-row-reverse max-sm:max-w-[92%] items-start gap-3 self-end animate-in fade-in-0 slide-in-from-bottom-2">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center border border-border-strong bg-background text-muted-foreground max-sm:hidden"
      >
        <UserRound size={15} />
      </span>
      <div className="grid min-w-0 justify-items-end gap-1.5">
        <MessageLabel>You</MessageLabel>
        <div className="border border-primary/30 bg-primary-soft px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap">
          <MessagePrimitive.Parts />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

// Streamed and delivered app output renders through streamdown with a live
// caret while the run streams; settled offers render as a compact receipt line.
export function AssistantReply() {
  const { name } = useContext(ChatAppContext);
  const label = useAuiState((s) => s.message.metadata.custom?.["label"] as string | undefined);
  const running = useAuiState((s) => s.message.status?.type === "running");
  const provider = label?.startsWith("PROVIDER");
  const offer = label?.startsWith("OFFER");

  if (offer)
    return (
      <MessagePrimitive.Root className="flex max-w-[min(85%,44rem)] items-center gap-3 self-start animate-in fade-in-0">
        <span className="grid size-8 shrink-0 place-items-center border border-dashed border-border-strong text-faint">
          <Handshake size={15} />
        </span>
        <div className="grid min-w-0 gap-1 border border-dashed border-border-strong px-4 py-2.5 text-sm text-muted-foreground">
          <MessageLabel>{label}</MessageLabel>
          <MessagePrimitive.Parts components={{ Text: PlainText }} />
        </div>
      </MessagePrimitive.Root>
    );

  return (
    <MessagePrimitive.Root className="group flex max-w-[min(90%,48rem)] items-start gap-3 self-start max-sm:max-w-full animate-in fade-in-0 slide-in-from-bottom-2">
      <AppAvatar />
      <div className="grid min-w-0 gap-1.5">
        <MessageLabel>
          {name}
          <span className="text-border-strong">·</span>
          {provider ? "message" : running ? "streaming" : "live output"}
          {running && (
            <span className="size-1.5 animate-pulse bg-primary motion-reduce:animate-none" />
          )}
        </MessageLabel>
        <div
          className={cn(
            "min-w-0 border px-4 py-3 text-sm leading-relaxed break-words",
            provider ? "border-border bg-background" : "border-border bg-background-deep",
          )}
        >
          <MessagePrimitive.Parts components={{ Text: provider ? PlainText : AppText }} />
        </div>
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

// Shown while the other side owes a reply: the provider answering free chat,
// or a paid run that has not streamed anything yet.
export function TypingIndicator({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 self-start animate-in fade-in-0"
    >
      <AppAvatar className="opacity-80" />
      <div className="flex items-center gap-3 border border-border bg-background-deep px-4 py-3">
        <span className="flex gap-1" aria-hidden="true">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="size-1.5 animate-bounce bg-primary motion-reduce:animate-none"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
