import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon, SearchIcon } from "lucide-react";
import { publicApi } from "~/lib/api";
import { declaredPrice, matchesAgent } from "~/lib/catalog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { AgentMark, StatusBadge, Notice, LoadingState, ErrorState, Pagination } from "./shared";

export function AgentStore() {
  const search = useSearch({ from: "/" });
  const navigate = useNavigate({ from: "/" });
  const [text, setText] = useState(search.q);
  useEffect(() => setText(search.q), [search.q]);
  const catalog = useQuery({
    queryKey: ["catalog", search.offset],
    queryFn: async ({ signal }) => {
      const result = await publicApi.GET("/v1/agents", {
        params: { query: { offset: search.offset } },
        signal,
      });
      if (!result.data) throw new Error("The agent catalog is unavailable. Please try again.");
      return result.data;
    },
  });
  const agents = catalog.data?.filter((agent) => matchesAgent(agent, search.q, search.filter));
  function submit(event: FormEvent) {
    event.preventDefault();
    void navigate({ search: { ...search, q: text.trim() } });
  }
  function clear() {
    setText("");
    void navigate({ search: { ...search, q: "", filter: "all" } });
  }
  return (
    <div className="market-page">
      <section className="market-store-hero">
        <p className="market-eyebrow">THE AGENT MARKETPLACE</p>
        <h1>
          Find the right agent.
          <br />
          Get one thing done.
        </h1>
        <p className="market-hero-copy">
          Purpose-built agents with clear inputs, outputs, and limits.
          <br className="hidden sm:block" />
          No all-purpose assistants. No guessing what happens next.
        </p>
        <form className="market-search" onSubmit={submit}>
          <label className="sr-only" htmlFor="agent-search">
            Search agents
          </label>
          <Input
            id="agent-search"
            placeholder="Search agents or tasks"
            value={text}
            maxLength={200}
            onChange={(event) => setText(event.target.value)}
          />
          <Button type="submit">
            <SearchIcon />
            Search
          </Button>
        </form>
        <div className="market-chips" role="group" aria-label="Catalog filters">
          {[
            ["all", "All agents"],
            ["design", "Design"],
            ["text", "Text output"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="market-chip"
              aria-pressed={search.filter === value}
              onClick={() => void navigate({ search: { ...search, filter: value } })}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
      <div className="market-section-heading">
        <h2>Explore agents</h2>
        {catalog.data && <span className="market-caption">{agents?.length} on this page</span>}
      </div>
      {(search.q || search.filter !== "all") && (
        <p className="market-caption mb-4">
          Filtering this catalog page.{" "}
          <button className="market-text-link" onClick={clear}>
            Clear filters
          </button>
        </p>
      )}
      {catalog.isPending ? (
        <LoadingState label="Loading agents…" />
      ) : catalog.error ? (
        <ErrorState message={catalog.error.message} retry={() => void catalog.refetch()} />
      ) : agents?.length ? (
        <div className="market-agent-grid">
          {agents.map((agent) => (
            <article key={agent.id} className="market-card market-agent-card">
              <div className="flex items-center justify-between gap-3">
                <AgentMark />
                <StatusBadge status="catalog" />
              </div>
              <div>
                <h2>
                  <Link to="/agents/$agentId" params={{ agentId: agent.id }}>
                    {agent.manifest.name}
                  </Link>
                </h2>
                <p className="market-caption mt-1">by {agent.providerName}</p>
              </div>
              <p className="market-agent-description">{agent.manifest.description}</p>
              <div className="flex flex-wrap gap-2">
                <span className="market-badge">Text source</span>
                <span className="market-badge">Final-only</span>
              </div>
              <footer className="market-agent-footer">
                <span className="market-caption">
                  {declaredPrice(agent.manifest.pricing)} · declared
                </span>
                <Link
                  className="market-text-link"
                  to="/agents/$agentId"
                  params={{ agentId: agent.id }}
                >
                  View agent <ArrowRightIcon />
                </Link>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="market-state market-card">
          <p className="text-muted-foreground">
            {search.q || search.filter !== "all"
              ? "No agents on this page match these filters."
              : "No published agents yet. Listings appear after operator review."}
          </p>
          {!search.q && search.filter === "all" && (
            <Button nativeButton={false} variant="outline" render={<Link to="/provider" />}>
              Publish an agent
            </Button>
          )}
        </div>
      )}
      <Pagination
        offset={search.offset}
        hasMore={catalog.data?.length === 50}
        onChange={(offset) => void navigate({ search: { ...search, offset } })}
        label="Catalog pages"
      />
      <div className="market-store-tail">
        <Notice>
          Early catalog · listings appear here only after operator review. A catalog listing does
          not authorize execution or spending.
        </Notice>
      </div>
    </div>
  );
}
