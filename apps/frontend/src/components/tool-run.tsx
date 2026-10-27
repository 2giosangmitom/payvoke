import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Paperclip, X } from "lucide-react";
import type { QuoteDocument } from "@payvoke/x402";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import {
  AppStatus,
  EmptyState,
  ErrorNotice,
  LoadingState,
  PageHeader,
  PageShell,
  errorMessage,
} from "./page-kit";
import { PaymentConfirm, formatDuration } from "./payment-confirm";
import { SchemaForm } from "./schema-form";
import { formatCommandPrice, getStoreApp } from "@/src/lib/apps";
import { ACCEPTED_FILE_TYPES, formatBytes, uploadThreadFile } from "@/src/lib/files";
import { newThread, quoteFor } from "@/src/lib/paid-chat";

const MAX_FILES = 10;

// A tool runs from a form generated from the command's input schema. Each run
// gets its own thread, so runs never wait on each other or share history.
export function ToolRun({ appId }: { appId: string }) {
  const navigate = useNavigate();
  const app = useQuery({
    queryKey: ["store", "app", appId],
    queryFn: () => getStoreApp(appId),
    staleTime: 15_000,
  });
  const [commandId, setCommandId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [quote, setQuote] = useState<QuoteDocument | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (app.isPending) return <LoadingState className="px-8">Loading tool…</LoadingState>;
  if (app.isError || !app.data)
    return (
      <PageShell className="pt-10">
        <ErrorNotice onRetry={() => void app.refetch()}>
          {errorMessage(app.error, "Could not load this tool.")}
        </ErrorNotice>
      </PageShell>
    );
  const data = app.data;
  if (data.kind !== "TOOL")
    return (
      <PageShell className="pt-10">
        <EmptyState
          eyebrow="Agent"
          title={`${data.name} works through chat.`}
          action={<Button render={<Link to="/console/chat" />}>Start a chat</Button>}
        >
          Agents send an offer after you describe the job; there is no fixed-price form.
        </EmptyState>
      </PageShell>
    );
  const commands = data.commands.filter((command) => command.revision);
  const command =
    commands.find((item) => item.id === commandId) ??
    commands.find((item) => item.id === data.defaultCommandId) ??
    commands[0];
  const revision = command?.revision;
  const available = data.availability === "AVAILABLE";

  async function run(values: Record<string, unknown>) {
    if (!command) return;
    const thread = await newThread(data.id);
    const uploaded = [];
    for (const file of files) uploaded.push(await uploadThreadFile(thread.id, file));
    setQuote(
      await quoteFor(
        thread.id,
        { commandId: command.id, arguments: values },
        uploaded.map((file) => file.id),
      ),
    );
  }

  return (
    <PageShell className="pt-10">
      <PageHeader
        eyebrow="Run a tool"
        title={data.name}
        description={data.description ?? undefined}
        actions={<AppStatus availability={data.availability} />}
      />
      {commands.length === 0 || !command || !revision ? (
        <EmptyState eyebrow="Not ready" title="This tool has no command yet.">
          The owner has to publish a command before it can run.
        </EmptyState>
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section aria-label="Tool input" className="grid content-start gap-6">
            {commands.length > 1 && (
              <Tabs value={command.id} onValueChange={(value) => setCommandId(String(value))}>
                <TabsList variant="line" className="h-auto flex-wrap justify-start gap-4 p-0">
                  {commands.map((item) => (
                    <TabsTrigger key={item.id} value={item.id} className="font-mono">
                      /{item.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
            <p className="leading-7 text-muted-foreground">{command.description}</p>
            {quote ? (
              <PaymentConfirm
                quote={quote}
                onHide={() => setQuote(null)}
                onPaid={(paid) =>
                  navigate({
                    to: "/console/runs/$invocationId",
                    params: { invocationId: paid.invocationId },
                  })
                }
              />
            ) : (
              <SchemaForm
                key={command.id}
                schema={revision.inputSchema}
                disabled={!available}
                submitLabel={available ? "Review price" : "Tool offline"}
                submitIcon={<ArrowRight />}
                onSubmit={run}
              >
                <div className="grid gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    hidden
                    accept={ACCEPTED_FILE_TYPES.join(",")}
                    onChange={(event) => {
                      const chosen = Array.from(event.currentTarget.files ?? []);
                      event.currentTarget.value = "";
                      setFiles((current) => [...current, ...chosen].slice(0, MAX_FILES));
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-self-start"
                    onClick={() => fileInput.current?.click()}
                  >
                    <Paperclip /> Attach files
                  </Button>
                  {files.length > 0 && (
                    <ul aria-label="Attachments" className="flex flex-wrap gap-2">
                      {files.map((file, index) => (
                        <li
                          key={`${file.name}-${index}`}
                          className="inline-flex max-w-full items-center gap-2 border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground"
                        >
                          <span className="max-w-48 truncate text-foreground">{file.name}</span>
                          {formatBytes(file.size)}
                          <button
                            type="button"
                            aria-label={`Remove ${file.name}`}
                            className="text-faint hover:text-foreground"
                            onClick={() =>
                              setFiles((current) => current.filter((_, at) => at !== index))
                            }
                          >
                            <X size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </SchemaForm>
            )}
          </section>
          <aside
            aria-label="Price and terms"
            className="grid content-start gap-4 border border-border bg-background-deep p-5 font-mono text-xs"
          >
            <div>
              <p className="text-faint">Price per run</p>
              <p className="mt-1 text-2xl text-primary">{formatCommandPrice(revision)}</p>
            </div>
            <dl className="grid gap-3">
              <div>
                <dt className="text-faint">Delivery within</dt>
                <dd>{formatDuration(revision.terms.deliverySeconds)}</dd>
              </div>
              <div>
                <dt className="text-faint">Review window</dt>
                <dd>{formatDuration(revision.terms.reviewSeconds)}</dd>
              </div>
              <div>
                <dt className="text-faint">Refund</dt>
                <dd className="font-sans leading-relaxed">{revision.terms.refundPolicy}</dd>
              </div>
              <div>
                <dt className="text-faint">Data use</dt>
                <dd className="font-sans leading-relaxed">{revision.terms.dataUse}</dd>
              </div>
            </dl>
            <p className="font-sans leading-relaxed text-muted-foreground">
              You see a Payvoke quote before paying. The vault holds the amount until the result is
              verified, and refunds it if the tool fails or misses the deadline.
            </p>
          </aside>
        </div>
      )}
    </PageShell>
  );
}
