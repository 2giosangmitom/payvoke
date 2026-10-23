import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Search, Star } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import { authClient } from "@/src/lib/auth-client";
import { api } from "@/src/lib/api";
import type { Product } from "@/src/lib/catalog";

export const Route = createFileRoute("/_market/agents")({
  head: () => ({
    meta: [
      { title: "Browse agents | Payvoke" },
      { name: "description", content: "Search published agents and tools on Payvoke." },
    ],
  }),
  component: AgentDirectory,
});

function SaveButton({
  product,
  accountId,
  saved,
}: {
  product: Product;
  accountId: string;
  saved: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: () => api(`/v1/stars/${product.id}`, saved ? "DELETE" : "PUT"),
    onSuccess: () => {
      setError("");
      void queryClient.invalidateQueries({ queryKey: ["account", accountId, "stars"] });
      if (saved)
        void queryClient.invalidateQueries({ queryKey: ["account", accountId, "collections"] });
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Could not save this item."),
  });
  return (
    <div className="directory-save">
      <Button
        type="button"
        variant="outline"
        className={saved ? "directory-save-button is-saved" : "directory-save-button"}
        disabled={mutation.isPending}
        aria-label={`${saved ? "Remove saved" : "Save"} ${product.name}`}
        onClick={() => mutation.mutate()}
      >
        <Star size={17} strokeWidth={1.7} fill={saved ? "currentColor" : "none"} />
        <span>{saved ? "Saved" : "Save"}</span>
      </Button>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

function AgentDirectory() {
  const { data: session } = authClient.useSession();
  const [kind, setKind] = useState<"AGENT" | "TOOL">("AGENT");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const catalog = useInfiniteQuery({
    queryKey: ["catalog", kind, query],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api<{ items: Product[]; nextCursor: string | null }>(
        `/v1/products?kind=${kind}&q=${encodeURIComponent(query)}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const accountId = session?.user.id;
  const stars = useQuery({
    queryKey: ["account", accountId, "stars"],
    queryFn: () => api<Product[]>("/v1/stars"),
    enabled: Boolean(accountId),
  });
  const savedIds = new Set(stars.data?.map((product) => product.id) ?? []);
  const products = catalog.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <main className="directory-shell">
      <section className="directory-intro">
        <div>
          <p className="workspace-kicker">Published on Payvoke</p>
          <h1>{kind === "AGENT" ? "Find an agent." : "Find a tool."}</h1>
          <p>Search published listings. Save useful ones to your workspace.</p>
        </div>
        <div className="directory-note">
          <span>AVALANCHE FUJI</span>
          <p>Listings are available to browse. Paid runs are coming later.</p>
        </div>
      </section>
      <section className="directory-body" aria-label="Published listings">
        <div className="directory-controls">
          <ToggleGroup
            value={[kind]}
            multiple={false}
            spacing={0}
            onValueChange={(values) => setKind(values[0] === "TOOL" ? "TOOL" : "AGENT")}
            className="directory-kind"
            aria-label="Listing type"
          >
            <ToggleGroupItem value="AGENT">Agents</ToggleGroupItem>
            <ToggleGroupItem value="TOOL">Tools</ToggleGroupItem>
          </ToggleGroup>
          <label className="directory-search">
            <span>Search by name</span>
            <span className="directory-search-field">
              <Search size={19} strokeWidth={1.6} aria-hidden="true" />
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={kind === "AGENT" ? "Research, review, extract…" : "Search tools…"}
              />
            </span>
          </label>
        </div>
        <div className="directory-results-heading">
          <h2>{kind === "AGENT" ? "Agents" : "Tools"}</h2>
          <span>{catalog.isPending ? "Loading" : `${products.length} shown`}</span>
        </div>
        {catalog.isPending ? (
          <div className="directory-skeleton" aria-label="Loading listings">
            <span />
            <span />
            <span />
          </div>
        ) : catalog.isError ? (
          <div className="directory-empty" role="alert">
            <h3>Could not load listings.</h3>
            <button type="button" onClick={() => void catalog.refetch()}>
              Try again
            </button>
          </div>
        ) : products.length ? (
          <div className="directory-list">
            {products.map((product) => (
              <article className="directory-item" key={product.id}>
                <div className="directory-item-main">
                  <span className="directory-provider">
                    {product.providerApp?.name ?? "Provider"}
                  </span>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                </div>
                <div className="directory-item-end">
                  <span className="directory-availability">Runs coming later</span>
                  {accountId ? (
                    <SaveButton
                      product={product}
                      accountId={accountId}
                      saved={savedIds.has(product.id)}
                    />
                  ) : (
                    <Link to="/app" className="directory-sign-in">
                      Sign in to save <ArrowUpRight size={16} />
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="directory-empty">
            <h3>
              {query
                ? `No ${kind.toLowerCase()}s match “${query}”.`
                : `No ${kind.toLowerCase()}s published yet.`}
            </h3>
            {query && (
              <button type="button" onClick={() => setSearch("")}>
                Clear search
              </button>
            )}
            {!query && (
              <Link to="/app" className="directory-sign-in">
                Publish {kind === "AGENT" ? "an agent" : "a tool"} <ArrowUpRight size={16} />
              </Link>
            )}
          </div>
        )}
        {catalog.hasNextPage && (
          <button
            className="directory-more"
            type="button"
            disabled={catalog.isFetchingNextPage}
            onClick={() => void catalog.fetchNextPage()}
          >
            {catalog.isFetchingNextPage ? "Loading…" : "Show more"}
          </button>
        )}
      </section>
    </main>
  );
}
