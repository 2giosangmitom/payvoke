import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/lib/api";
import { useSession } from "~/lib/use-session";
import { agentActions, declaredPrice, type CatalogAgent } from "~/lib/catalog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { paths } from "~/lib/schema";

type Quote = paths["/v1/quotes"]["post"]["responses"][200]["content"]["application/json"];
type Order = paths["/v1/orders"]["post"]["responses"][200]["content"]["application/json"];
type QuoteRequest = paths["/v1/quotes"]["post"]["requestBody"]["content"]["application/json"];

export function CommercePreview({ agent }: { agent: CatalogAgent }) {
  const { accountId } = useSession();
  const [open, setOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceOffset, setWorkspaceOffset] = useState(0);
  const [actionId, setActionId] = useState(agentActions(agent)[0]?.id ?? "");
  const [variantId, setVariantId] = useState(agent.manifest.variants[0]?.id ?? "");
  const [input, setInput] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lastQuote = useRef<{ fingerprint: string; request: QuoteRequest } | null>(null);
  const lastOrder = useRef<{
    quoteId: string;
    request: {
      id: string;
      operationId: string;
      quoteId: string;
      quoteDigest: string;
      confirmTerms: true;
    };
  } | null>(null);
  useEffect(() => {
    setQuote(null);
    setOrder(null);
    setConfirmed(false);
    setInput({});
    setWorkspaceId("");
    lastQuote.current = null;
    lastOrder.current = null;
  }, [accountId]);
  const workspaces = useQuery({
    queryKey: ["commerce-workspaces", accountId, workspaceOffset],
    enabled: open && !!accountId,
    queryFn: async () => {
      const response = await api.GET("/v1/workspaces", {
        params: { query: { offset: workspaceOffset } },
      });
      if (!response.data) throw new Error(response.error?.message ?? "Workspaces unavailable.");
      return response.data;
    },
  });
  const selectedWorkspace = workspaces.data?.find((item) => item.id === workspaceId);
  const selectedCommand =
    agent.manifest.schemaVersion === 2
      ? agent.commands?.find((item) => item.name === actionId)
      : undefined;
  const fields =
    agent.manifest.schemaVersion === 1
      ? [
          {
            name: "text",
            maxLength: agent.manifest.limits.inputChars,
            required: true,
            enum: undefined as string[] | undefined,
          },
        ]
      : Object.entries(selectedCommand?.inputSchema.properties ?? {}).map(([name, property]) => ({
          name,
          maxLength: property.maxLength,
          required: selectedCommand?.inputSchema.required.includes(name) ?? false,
          enum: property.enum,
        }));

  function invalidateQuote() {
    setQuote(null);
    setOrder(null);
    setConfirmed(false);
    setError("");
  }

  async function createQuote(event: FormEvent) {
    event.preventDefault();
    if (!selectedWorkspace) return;
    setBusy(true);
    setError("");
    setQuote(null);
    setOrder(null);
    const submittedInput = Object.fromEntries(
      fields
        .filter((field) => field.required || input[field.name])
        .map((field) => [field.name, input[field.name] ?? ""]),
    );
    const fingerprint = JSON.stringify({
      workspaceId,
      actionId,
      variantId,
      input: submittedInput,
      revision: selectedWorkspace.revision,
      versionId: agent.versionId,
    });
    const request: QuoteRequest =
      lastQuote.current?.fingerprint === fingerprint
        ? lastQuote.current.request
        : {
            id: crypto.randomUUID(),
            workspaceId,
            listingId: agent.id,
            versionId: agent.versionId,
            actionId,
            variantId,
            input: submittedInput,
            briefRevision: selectedWorkspace.revision,
          };
    lastQuote.current = { fingerprint, request };
    try {
      const response = await api.POST("/v1/quotes", { body: request });
      if (!response.data) throw new Error(response.error?.message ?? "Could not prepare quote.");
      setQuote(response.data);
      setConfirmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare quote.");
    } finally {
      setBusy(false);
    }
  }

  async function recordIntent() {
    if (!quote || !confirmed) return;
    setBusy(true);
    setError("");
    const request =
      lastOrder.current?.quoteId === quote.id
        ? lastOrder.current.request
        : {
            id: crypto.randomUUID(),
            operationId: crypto.randomUUID(),
            quoteId: quote.id,
            quoteDigest: quote.digest,
            confirmTerms: true as const,
          };
    lastOrder.current = { quoteId: quote.id, request };
    try {
      const response = await api.POST("/v1/orders", { body: request });
      if (!response.data) throw new Error(response.error?.message ?? "Could not record intent.");
      setOrder(response.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record intent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="market-card market-commerce-preview">
      <Button variant="outline" onClick={() => setOpen((value) => !value)}>
        {open ? "Hide quote preview" : "Preview fixed quote"}
      </Button>
      {open && (
        <div className="market-commerce-form">
          <p className="market-caption">
            This is a catalog quote preview. Payment and buyer execution are unavailable.
          </p>
          {!accountId ? (
            <p>Sign in to prepare a quote for your workspace.</p>
          ) : (
            <form onSubmit={(event) => void createQuote(event)}>
              <label htmlFor="quote-workspace">Workspace</label>
              <select
                id="quote-workspace"
                value={workspaceId}
                required
                onChange={(event) => {
                  setWorkspaceId(event.target.value);
                  invalidateQuote();
                }}
              >
                <option value="">Choose a workspace</option>
                {workspaces.data?.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.title}
                  </option>
                ))}
              </select>
              <div className="market-commerce-pages">
                <Button
                  type="button"
                  variant="outline"
                  disabled={workspaceOffset === 0}
                  onClick={() => {
                    setWorkspaceOffset((value) => Math.max(0, value - 50));
                    setWorkspaceId("");
                    invalidateQuote();
                  }}
                >
                  Previous
                </Button>
                <span>Page {Math.floor(workspaceOffset / 50) + 1}</span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={(workspaces.data?.length ?? 0) < 50 || workspaceOffset >= 10000}
                  onClick={() => {
                    setWorkspaceOffset((value) => value + 50);
                    setWorkspaceId("");
                    invalidateQuote();
                  }}
                >
                  Next
                </Button>
              </div>
              {workspaces.data?.length === 0 && <p>Create a workspace and brief first.</p>}
              {workspaces.error && <p role="alert">{workspaces.error.message}</p>}
              <label htmlFor="quote-action">Action</label>
              <select
                id="quote-action"
                value={actionId}
                onChange={(event) => {
                  setActionId(event.target.value);
                  setInput({});
                  invalidateQuote();
                }}
              >
                {agentActions(agent).map((action) => (
                  <option key={action.id} value={action.id}>
                    {action.id}
                  </option>
                ))}
              </select>
              <label htmlFor="quote-variant">Model variant</label>
              <select
                id="quote-variant"
                value={variantId}
                onChange={(event) => {
                  setVariantId(event.target.value);
                  invalidateQuote();
                }}
              >
                {agent.manifest.variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.id} · {variant.model}
                  </option>
                ))}
              </select>
              {fields.map((field) => (
                <label key={field.name} htmlFor={`quote-${field.name}`}>
                  {field.name}
                  {field.enum ? (
                    <select
                      id={`quote-${field.name}`}
                      value={input[field.name] ?? ""}
                      required={field.required}
                      onChange={(event) => {
                        setInput((previous) => ({ ...previous, [field.name]: event.target.value }));
                        invalidateQuote();
                      }}
                    >
                      <option value="">Choose…</option>
                      {field.enum.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  ) : field.name === "text" ? (
                    <textarea
                      id={`quote-${field.name}`}
                      className="market-textarea"
                      maxLength={field.maxLength}
                      required={field.required}
                      value={input[field.name] ?? ""}
                      onChange={(event) => {
                        setInput((previous) => ({ ...previous, [field.name]: event.target.value }));
                        invalidateQuote();
                      }}
                    />
                  ) : (
                    <Input
                      id={`quote-${field.name}`}
                      maxLength={field.maxLength}
                      required={field.required}
                      value={input[field.name] ?? ""}
                      onChange={(event) => {
                        setInput((previous) => ({ ...previous, [field.name]: event.target.value }));
                        invalidateQuote();
                      }}
                    />
                  )}
                </label>
              ))}
              <Button type="submit" disabled={busy || !selectedWorkspace || !actionId}>
                Prepare quote
              </Button>
            </form>
          )}
          {quote && (
            <div className="market-commerce-terms">
              <strong>
                {declaredPrice(quote.terms.pricing)} · {quote.terms.model}
              </strong>
              <p>
                Action: {quote.terms.actionId} · Version: {quote.terms.versionId}
              </p>
              <p>
                Brief revision {quote.terms.briefRevision}: {quote.terms.brief || "No saved brief"}
              </p>
              <pre className="market-code">{JSON.stringify(quote.terms.input, null, 2)}</pre>
              <p>
                Input limit: {quote.terms.limits.inputChars} characters · Deadline:{" "}
                {quote.terms.limits.timeoutSeconds} seconds
              </p>
              <p>Retention: {quote.terms.dataPolicy.retention}</p>
              <p>Terms: {quote.terms.dataPolicy.terms}</p>
              <p>Quote expires: {new Date(quote.expiresAt).toLocaleString()}</p>
              <label className="market-commerce-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />{" "}
                I reviewed these exact terms and want to record an intent. This does not pay or run
                the agent.
              </label>
              <Button
                variant="outline"
                disabled={busy || !confirmed || !!order}
                onClick={() => void recordIntent()}
              >
                Record intent
              </Button>
            </div>
          )}
          {order && (
            <p role="status">
              Intent {order.id} saved as pending admission. No payment or execution occurred.
            </p>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
