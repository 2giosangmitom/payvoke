import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon } from "lucide-react";
import { publicApi } from "~/lib/api";
import { declaredPrice } from "~/lib/catalog";
import { Button } from "~/components/ui/button";
import { AgentMark, ErrorState, LoadingState, StatusBadge } from "./shared";

export function AgentDetails() {
  const { agentId } = useParams({ from: "/agents/$agentId" });
  const { tab } = useSearch({ from: "/agents/$agentId" });
  const navigate = useNavigate({ from: "/agents/$agentId" });
  const query = useQuery({
    queryKey: ["catalog-agent", agentId],
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const result = await publicApi.GET("/v1/agents/{id}", {
        params: { path: { id: agentId } },
        signal,
      });
      if (result.response.status === 404) return null;
      if (!result.data) throw new Error("Agent details are unavailable. Please try again.");
      return result.data;
    },
  });
  if (query.isPending)
    return (
      <div className="market-page">
        <LoadingState label="Loading agent…" />
      </div>
    );
  if (query.error)
    return (
      <div className="market-page">
        <ErrorState message={query.error.message} retry={() => void query.refetch()} />
      </div>
    );
  if (!query.data)
    return (
      <div className="market-page">
        <div className="market-card market-state">
          <h1>Agent unavailable</h1>
          <p className="text-muted-foreground">
            This listing may be paused or no longer published.
          </p>
          <Button nativeButton={false} variant="outline" render={<Link to="/" />}>
            Back to Agent Store
          </Button>
        </div>
      </div>
    );
  const agent = query.data;
  const manifest = agent.manifest;
  return (
    <div className="market-page">
      <div className="market-detail-title">
        <AgentMark />
        <div>
          <h1>{manifest.name}</h1>
          <p className="text-muted-foreground mt-2">{manifest.description}</p>
          <p className="market-caption mt-2">
            by {agent.providerName} · manifest schema v{manifest.schemaVersion}
          </p>
        </div>
      </div>
      <div className="market-status-line">
        <StatusBadge status="catalog" />
        <span className="market-caption">Execution not enabled</span>
      </div>
      <div
        className="market-tabs"
        role="tablist"
        aria-label="Agent information"
        onKeyDown={(event) => {
          const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")];
          const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            event.key === "ArrowRight"
              ? (index + 1) % tabs.length
              : event.key === "ArrowLeft"
                ? (index + tabs.length - 1) % tabs.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : null;
          if (next !== null) {
            event.preventDefault();
            tabs[next]?.focus();
            tabs[next]?.click();
          }
        }}
      >
        {["overview", "input", "output", "terms"].map((value) => (
          <button
            key={value}
            id={`agent-tab-${value}`}
            className="market-tab"
            role="tab"
            aria-selected={value === tab}
            tabIndex={value === tab ? 0 : -1}
            aria-controls="agent-panel"
            onClick={() => void navigate({ search: { tab: value } })}
          >
            {value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>
      <div className="market-detail-layout">
        <article
          id="agent-panel"
          role="tabpanel"
          aria-labelledby={`agent-tab-${tab}`}
          className="market-detail-copy"
          tabIndex={0}
        >
          {tab === "overview" && (
            <>
              <section>
                <h2>What this agent does</h2>
                <p>{manifest.description}</p>
              </section>
              <section>
                <h2>One agent. One job.</h2>
                <ul>
                  {manifest.actions.map((action) => (
                    <li key={action.id}>
                      <strong>{action.id}</strong> — {action.description}
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h2>Know the limits</h2>
                <p>
                  Final-only text output. No streaming, cancellation, file uploads or automatic
                  model fallback. Provider declarations are not independent verification.
                </p>
              </section>
            </>
          )}
          {tab === "input" && (
            <section>
              <h2>A clear brief is all it needs</h2>
              <p>
                This version accepts plain text, up to {manifest.limits.inputChars.toLocaleString()}{" "}
                characters. Use the workspace to prepare the outcome, available inputs and
                constraints.
              </p>
              <pre className="market-code">
                {JSON.stringify(
                  {
                    input: {
                      text: "Describe your task, audience, visual direction and constraints.",
                    },
                  },
                  null,
                  2,
                )}
              </pre>
            </section>
          )}
          {tab === "output" && (
            <section>
              <h2>Text source, not a verified artifact</h2>
              <p>
                Output is returned using the text-v1 profile. Source is not automatically rendered,
                uploaded or treated as a verified artifact.
              </p>
              <pre className="market-code">{`Output profile: text-v1\nDelivery: final-only\nOutput limit: ${manifest.limits.outputTokens} tokens\nDeadline: ${manifest.limits.timeoutSeconds} seconds`}</pre>
            </section>
          )}
          {tab === "terms" && (
            <>
              <section>
                <h2>Data destinations</h2>
                <ul>
                  {manifest.dataPolicy.destinations.map((destination) => (
                    <li key={destination}>{destination}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h2>Retention</h2>
                <p>{manifest.dataPolicy.retention}</p>
              </section>
              <section>
                <h2>Declared terms</h2>
                <p>{manifest.dataPolicy.terms}</p>
              </section>
            </>
          )}
        </article>
        <aside className="market-card market-action-panel">
          <p className="market-label">Declared demo price</p>
          <p className="market-price">
            {declaredPrice(manifest.pricing)}
            <span> / task</span>
          </p>
          <p className="market-caption mt-2">
            Not a payable quote. Model calls may still cost the provider money.
          </p>
          <dl className="market-key-pairs">
            <div>
              <dt>Action</dt>
              <dd>{manifest.actions.map((action) => action.id).join(", ")}</dd>
            </div>
            <div>
              <dt>Model variants</dt>
              <dd>
                {manifest.variants.map((variant) => `${variant.id} · ${variant.model}`).join(", ")}
              </dd>
            </div>
            <div>
              <dt>Output</dt>
              <dd>Final-only text source</dd>
            </div>
            <div>
              <dt>Limits</dt>
              <dd>
                {manifest.limits.inputChars.toLocaleString()} characters ·{" "}
                {manifest.limits.outputTokens.toLocaleString()} output tokens
              </dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd className="market-mono">{agent.versionId}</dd>
            </div>
          </dl>
          <Button variant="outline" disabled>
            Execution unavailable
          </Button>
          <p className="market-caption mt-2">Endpoint admission is pending.</p>
          <Button nativeButton={false} render={<Link to="/workspace" />} className="mt-4">
            Prepare a brief <ArrowRightIcon />
          </Button>
        </aside>
      </div>
    </div>
  );
}
