import { useId, useRef, useState } from "react";
import { ComposerPrimitive, useAui, useAuiState } from "@assistant-ui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpIcon, SlashIcon } from "lucide-react";
import { api } from "~/lib/api";
import {
  apiFailure,
  isActiveInvocation,
  type CommandSource,
  type CommandInvocation,
  type SlashCommand,
} from "~/lib/provider-commands";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import { CommandForm, InvocationCard } from "~/components/marketplace/command-invocation";

const historyKey = (account: string, conversation: string) => [
  "workspace",
  account,
  "command-invocations",
  conversation,
];
export function useCommandInvocations(accountId: string, conversationId: string) {
  return useQuery<CommandInvocation[]>({
    queryKey: historyKey(accountId, conversationId),
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.error ? false : query.state.data?.some(isActiveInvocation) ? 1000 : 5000,
    queryFn: async ({ signal }) => {
      const result = await api.GET("/v1/conversations/{id}/command-invocations", {
        params: { path: { id: conversationId } },
        signal,
      });
      if (!result.data) throw apiFailure(result.error);
      return result.data;
    },
  });
}
export function CommandInvocationHistory({
  history,
}: {
  history: ReturnType<typeof useCommandInvocations>;
}) {
  if (history.error)
    return (
      <div role="alert" className="px-4 py-3 text-sm">
        <p>Couldn’t load provider command history. {history.error.message}</p>
        <Button variant="outline" className="mt-2" onClick={() => void history.refetch()}>
          Retry command history
        </Button>
      </div>
    );
  if (!history.data?.length) return null;
  return (
    <section aria-label="Provider command history" className="gateway-chat-history">
      <h2 className="market-caption mb-3">Provider commands · owner-only development</h2>
      {history.data.map((invocation) => (
        <InvocationCard key={invocation.id} invocation={invocation} />
      ))}
    </section>
  );
}

export function SlashComposer({
  accountId,
  conversationId,
}: {
  accountId: string;
  conversationId: string;
}) {
  const aui = useAui();
  const text = useAuiState((s) => s.composer.text);
  const running = useAuiState((s) => s.thread.isRunning);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const client = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<{ source: CommandSource; command: SlashCommand } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const slash = text.trimStart().startsWith("/");
  const show = slash && !dismissed;
  const commands = useQuery({
    queryKey: ["workspace", accountId, "slash-commands", conversationId],
    enabled: slash,
    staleTime: 0,
    refetchInterval: show ? 5000 : false,
    queryFn: async ({ signal }) => {
      const result = await api.GET("/v1/conversations/{id}/commands", {
        params: { path: { id: conversationId } },
        signal,
      });
      if (!result.data) throw apiFailure(result.error);
      return result.data;
    },
  });
  const filter = text.trimStart().slice(1).split(/\s/)[0]?.toLowerCase() ?? "";
  const options = (commands.data ?? []).flatMap((source) =>
    source.commands
      .filter((command) => command.name.includes(filter))
      .map((command) => ({ source, command })),
  );
  const active = Math.min(index, Math.max(0, options.length - 1));
  function choose(value: { source: CommandSource; command: SlashCommand }) {
    setSelected(value);
    setDismissed(true);
  }
  async function run(invocationId: string, input: Record<string, string>) {
    if (!selected) return;
    try {
      const result = await api.POST("/v1/conversations/{id}/command-invocations", {
        params: { path: { id: conversationId } },
        body: {
          id: invocationId,
          listingId: selected.source.listingId,
          versionId: selected.source.versionId,
          command: selected.command.name,
          input,
          confirmModelExpense: true,
        },
      });
      if (!result.data) throw apiFailure(result.error);
      setSelected(null);
      aui.composer.setText("");
    } finally {
      await client.invalidateQueries({ queryKey: historyKey(accountId, conversationId) });
    }
  }
  return (
    <>
      <div className="gateway-composer-tools">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Choose slash command"
          disabled={running}
          onClick={() => {
            aui.composer.setText("/");
            setDismissed(false);
            inputRef.current?.focus();
          }}
        >
          <SlashIcon />
          Commands
        </Button>
        <span className="market-caption">Your published Gateway agents only</span>
      </div>
      {show && (
        <div className="gateway-command-picker" id={id} role="listbox" aria-label="Slash commands">
          {commands.isPending ? (
            <p role="status">Loading commands…</p>
          ) : commands.error ? (
            <div role="alert">
              <p>{commands.error.message}</p>
              <Button type="button" variant="outline" onClick={() => void commands.refetch()}>
                Retry commands
              </Button>
            </div>
          ) : !options.length ? (
            <p className="text-muted-foreground">
              No matching commands. Publish a reviewed Gateway listing you own, then try again.
            </p>
          ) : (
            options.map((option, i) => (
              <button
                key={`${option.source.versionId}-${option.command.name}`}
                type="button"
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === active}
                className="gateway-command-option"
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(option)}
              >
                <span>
                  <strong>/{option.command.name}</strong>
                  <span className="market-caption">
                    {option.source.applicationName} ·{" "}
                    {option.source.gatewayConnected ? "Connected" : "Offline"}
                  </span>
                </span>
                <span className="market-caption">{option.command.description}</span>
              </button>
            ))
          )}
        </div>
      )}
      <ComposerPrimitive.Root
        className="flex items-end gap-2 rounded-3xl border bg-background p-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30"
        onSubmitCapture={(event) => {
          if (slash) {
            event.preventDefault();
            event.stopPropagation();
            setDismissed(false);
          }
        }}
      >
        <ComposerPrimitive.Input
          ref={inputRef}
          aria-label="Message"
          placeholder="Write a message, or / for commands…"
          maxLength={4000}
          rows={1}
          className="max-h-60 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-base outline-none"
          role={show ? "combobox" : undefined}
          aria-expanded={show ? true : undefined}
          aria-controls={show ? id : undefined}
          aria-activedescendant={show && options.length ? `${id}-${active}` : undefined}
          aria-autocomplete={show ? "list" : undefined}
          onChange={() => {
            setDismissed(false);
            setIndex(0);
          }}
          onKeyDown={(event) => {
            if (!slash || event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setDismissed(false);
              setIndex(
                (index) =>
                  (index + (event.key === "ArrowDown" ? 1 : Math.max(0, options.length - 1))) %
                  Math.max(1, options.length),
              );
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDismissed(true);
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (options[active]) choose(options[active]);
              else setDismissed(false);
            }
          }}
        />
        {slash ? (
          <Button
            type="button"
            size="icon"
            aria-label="Select slash command"
            disabled={!options.length || running}
            onClick={() => {
              if (options[active]) choose(options[active]);
            }}
          >
            <ArrowUpIcon />
          </Button>
        ) : (
          <ComposerPrimitive.Send asChild>
            <Button
              className="size-10 rounded-2xl disabled:opacity-30"
              size="icon"
              aria-label="Send message"
            >
              <ArrowUpIcon />
            </Button>
          </ComposerPrimitive.Send>
        )}
      </ComposerPrimitive.Root>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !submitting) setSelected(null);
        }}
      >
        <DialogContent className="gateway-dialog" showCloseButton={!submitting}>
          <DialogTitle>Run /{selected?.command.name}</DialogTitle>
          <DialogDescription>
            {selected?.source.applicationName} · owner-only development. Only the form inputs will
            be sent to your provider.
          </DialogDescription>
          {selected && (
            <CommandForm
              key={`${selected.source.versionId}-${selected.command.name}`}
              command={selected.command}
              revisionId={selected.source.revisionId}
              limits={selected.source.limits}
              onRun={run}
              onCancel={() => setSelected(null)}
              onBusyChange={setSubmitting}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
