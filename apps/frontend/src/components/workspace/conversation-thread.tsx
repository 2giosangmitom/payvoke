import { useEffect, useMemo, useRef, useState } from "react";
import { HttpAgent } from "@ag-ui/client";
import { fromAgUiMessages, useAgUiRuntime } from "@assistant-ui/react-ag-ui";
import {
  AssistantRuntimeProvider,
  ExportedMessageRepository,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { ArrowDownIcon } from "lucide-react";
import { api, apiHost, authenticatedFetch } from "~/lib/api";
import { createAgUiFetch } from "~/lib/ag-ui-transport";
import { Button } from "~/components/ui/button";
import { SafeMarkdown } from "./safe-markdown";
import { CommandInvocationHistory, SlashComposer, useCommandInvocations } from "./slash-commands";

function UserMessage() {
  return (
    <MessagePrimitive.Root className="mx-auto w-full max-w-3xl px-4 py-4">
      <div className="ml-auto w-fit max-w-[85%] rounded-3xl bg-muted px-4 py-3 text-base whitespace-pre-wrap [overflow-wrap:anywhere]">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="mx-auto w-full max-w-3xl px-4 py-4">
      <div className="chat-markdown max-w-[65ch] text-base leading-7 [overflow-wrap:anywhere]">
        <MessagePrimitive.Parts components={{ Text: SafeMarkdown }} />
      </div>
      <MessagePrimitive.Error>
        <p role="alert" className="mt-2 text-sm text-destructive">
          Response interrupted. Reload saved messages to recover.
        </p>
      </MessagePrimitive.Error>
    </MessagePrimitive.Root>
  );
}

export function ConversationThread({
  conversationId,
  accountId,
  onSnapshotReset,
}: {
  conversationId: string;
  accountId: string;
  onSnapshotReset: () => void;
}) {
  const [error, setError] = useState("");
  const commandHistory = useCommandInvocations(accountId, conversationId);
  const needsHistoryReset = useRef(false);
  const agent = useMemo(
    () =>
      new HttpAgent({
        url: `${apiHost}/v1/conversations/${conversationId}/runs`,
        threadId: conversationId,
        fetch: createAgUiFetch(authenticatedFetch, () => {
          needsHistoryReset.current = true;
        }),
      }),
    [conversationId],
  );
  const history = useMemo(
    () => ({
      async load() {
        const result = await api.GET("/v1/conversations/{id}", {
          params: { path: { id: conversationId } },
        });
        if (!result.data) {
          const message =
            result.response.status === 401
              ? "Your session expired. Please sign in again."
              : (result.error?.message ?? "Couldn't load saved messages.");
          setError(message);
          throw new Error(message);
        }
        return ExportedMessageRepository.fromArray(
          fromAgUiMessages(result.data.messages, { showThinking: false }),
        );
      },
      // The command endpoint persists both sides of the turn transactionally.
      async append() {},
    }),
    [conversationId],
  );
  const runtime = useAgUiRuntime({
    agent,
    showThinking: false,
    adapters: { history },
    onError: (e) => setError(e.message),
  });
  useEffect(
    () =>
      runtime.thread.subscribe(() => {
        if (needsHistoryReset.current && !runtime.thread.getState().isRunning) {
          needsHistoryReset.current = false;
          // assistant-ui keeps an active text accumulator after MESSAGES_SNAPSHOT.
          // Once this completed development run settles, rebuild from canonical history
          // so its last accumulator update cannot overwrite the replacement snapshot.
          onSnapshotReset();
        }
      }),
    [runtime, onSnapshotReset],
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="market-thread flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto py-4">
          {!commandHistory.data?.length && (
            <ThreadPrimitive.Empty>
              <div className="mx-auto flex h-full max-w-3xl items-end px-4 pb-4">
                <p className="max-w-md text-sm leading-6 text-muted-foreground">
                  Describe your task to start a private conversation. This development workspace
                  saves messages but does not call an AI model.
                </p>
              </div>
            </ThreadPrimitive.Empty>
          )}
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          <CommandInvocationHistory history={commandHistory} />
        </ThreadPrimitive.Viewport>
        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          {error && (
            <p role="alert" className="mb-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <ThreadPrimitive.If running>
            <p role="status" className="mb-2 text-xs text-muted-foreground">
              Receiving saved response… Disconnecting does not delete it.
            </p>
          </ThreadPrimitive.If>
          <div className="mb-2 flex justify-center">
            <ThreadPrimitive.ScrollToBottom asChild>
              <Button variant="outline" size="icon" aria-label="Scroll to latest message">
                <ArrowDownIcon />
              </Button>
            </ThreadPrimitive.ScrollToBottom>
          </div>
          <SlashComposer accountId={accountId} conversationId={conversationId} />
          <p className="mt-2 text-center text-xs leading-5 text-muted-foreground">
            Development only · Commands may incur provider model costs.
          </p>
        </div>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
