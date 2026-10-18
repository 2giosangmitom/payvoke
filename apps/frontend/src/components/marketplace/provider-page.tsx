import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { api } from "~/lib/api";
import { useSession } from "~/lib/use-session";
import type { Manifest } from "~/lib/catalog";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import {
  AgentMark,
  Choice,
  ErrorState,
  LoadingState,
  Notice,
  Pagination,
  SignInState,
  StatusBadge,
} from "./shared";
import { ApplicationConsole } from "./application-console";
import { GatewayBinding } from "./gateway-binding";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed. Please try again.";
function fail(error?: { message: string }) {
  return new Error(error?.message ?? "The publishing service is unavailable.");
}

export function ProviderPage() {
  const session = useSession();
  if (session.checking)
    return (
      <div className="market-page">
        <LoadingState label="Checking session…" />
      </div>
    );
  if (!session.accountId)
    return (
      <div className="market-page">
        <SignInState
          title="Publish your focused skill"
          description="Sign in to manage your provider profile, listings and manifest versions."
          error={session.error}
        />
      </div>
    );
  return <ProviderConsole key={session.accountId} accountId={session.accountId} />;
}
function ProviderConsole({ accountId }: { accountId: string }) {
  const client = useQueryClient();
  const key = ["provider", accountId];
  const { listing, section } = useSearch({ from: "/provider" });
  const navigate = useNavigate({ from: "/provider" });
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const createId = useRef<string | null>(null);
  useEffect(
    () => () => client.removeQueries({ queryKey: ["provider", accountId] }),
    [client, accountId],
  );
  const profile = useQuery({
    queryKey: [...key, "profile"],
    queryFn: async ({ signal }) => {
      const result = await api.GET("/v1/provider/profile", { signal });
      if (result.response.status === 404) return null;
      if (!result.data) throw fail(result.error);
      return result.data;
    },
  });
  const listings = useQuery({
    queryKey: [...key, "listings", offset],
    enabled: !!profile.data && section === "listings",
    queryFn: async ({ signal }) => {
      const result = await api.GET("/v1/provider/listings", {
        params: { query: { offset } },
        signal,
      });
      if (!result.data) throw fail(result.error);
      return result.data;
    },
  });
  async function createListing() {
    if (busy) return;
    setBusy(true);
    setError("");
    createId.current ??= crypto.randomUUID();
    try {
      const result = await api.POST("/v1/provider/listings", { body: { id: createId.current } });
      if (!result.data) throw fail(result.error);
      createId.current = null;
      setOffset(0);
      await client.invalidateQueries({ queryKey: key });
      await navigate({ search: { listing: result.data.id } });
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="market-page">
      <header className="market-page-heading">
        <div>
          <h1>{section === "applications" ? "Your applications" : "Your agents"}</h1>
          <p>
            {section === "applications"
              ? "Connect your agent and manage its commands."
              : "Publish one skill. Make its boundaries clear."}
          </p>
        </div>
        {profile.data && section !== "applications" && (
          <Button onClick={createListing} disabled={busy}>
            <PlusIcon />
            {busy ? "Creating…" : "Create listing"}
          </Button>
        )}
      </header>
      {error && (
        <p role="alert" className="market-form-error">
          {error}
        </p>
      )}
      {profile.isPending ? (
        <LoadingState label="Loading provider profile…" />
      ) : profile.error ? (
        <ErrorState message={profile.error.message} retry={() => void profile.refetch()} />
      ) : !profile.data ? (
        <ProfileForm onSaved={() => client.invalidateQueries({ queryKey: key })} />
      ) : (
        <>
          <nav className="market-tabs mb-6" aria-label="Provider sections">
            <Link
              to="/provider"
              search={{ section: "listings" }}
              className={`market-tab ${section === "listings" ? "market-tab--active" : ""}`}
            >
              Listings
            </Link>
            <Link
              to="/provider"
              search={{ section: "applications" }}
              className={`market-tab ${section === "applications" ? "market-tab--active" : ""}`}
            >
              Applications
            </Link>
          </nav>
          {section === "applications" ? (
            <ApplicationConsole accountId={accountId} />
          ) : (
            <>
              <Notice>
                Review is required before publication. Publishing a catalog version does not enable
                provider execution.
              </Notice>
              <div className="market-tabs market-listing-tabs">
                <span className="market-tab market-tab--active">All listings</span>
                <span className="market-caption ml-auto self-center">
                  {profile.data.displayName}
                </span>
              </div>
              {listings.isPending ? (
                <LoadingState label="Loading listings…" />
              ) : listings.error ? (
                <ErrorState
                  message={listings.error.message}
                  retry={() => void listings.refetch()}
                />
              ) : !listings.data?.length ? (
                <div className="market-state">
                  <p className="text-muted-foreground">
                    No listings yet. Create a listing, then add its first manifest.
                  </p>
                </div>
              ) : (
                <>
                  <table className="market-listing-table">
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Candidate</th>
                        <th>Status</th>
                        <th>Availability</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {listings.data.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="flex items-center gap-3">
                              <AgentMark />
                              <div>
                                <h2>{item.name ?? "Untitled listing"}</h2>
                                <p className="market-caption market-mono">{item.id.slice(0, 8)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="market-mono">
                            {item.candidateVersionId?.slice(0, 8) ?? "No manifest"}
                          </td>
                          <td>
                            <StatusBadge status={item.candidateState ?? "draft"} />
                          </td>
                          <td>
                            {item.publishedVersionId ? (
                              <StatusBadge status={item.paused ? "paused" : "published"} />
                            ) : (
                              <span className="text-muted-foreground">Not published</span>
                            )}
                          </td>
                          <td>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void navigate({ search: { listing: item.id } })}
                            >
                              Manage
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="market-listing-cards">
                    {listings.data.map((item) => (
                      <article className="market-card" key={item.id}>
                        <div className="flex items-center justify-between gap-3">
                          <h2>{item.name ?? "Untitled listing"}</h2>
                          <StatusBadge status={item.candidateState ?? "draft"} />
                        </div>
                        <p className="market-caption mt-2">
                          {item.publishedVersionId
                            ? item.paused
                              ? "Paused"
                              : "Published"
                            : "Not published"}
                        </p>
                        <Button
                          className="mt-4"
                          variant="outline"
                          onClick={() => void navigate({ search: { listing: item.id } })}
                        >
                          Manage version
                        </Button>
                      </article>
                    ))}
                  </div>
                </>
              )}
              <Pagination
                offset={offset}
                hasMore={listings.data?.length === 50}
                onChange={setOffset}
                label="Listing pages"
              />
              {listing && (
                <ListingEditor
                  key={listing}
                  listingId={listing}
                  accountId={accountId}
                  onClose={() => void navigate({ search: {} })}
                  onChanged={() => client.invalidateQueries({ queryKey: key })}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
function ProfileForm({ onSaved }: { onSaved: () => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.POST("/v1/provider/profile", { body: { displayName: name.trim() } });
      if (!result.data) throw fail(result.error);
      await onSaved();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="market-card market-profile-form" onSubmit={submit}>
      <h2>Create your provider profile</h2>
      <p className="text-muted-foreground">
        Use a public provider name. Profile names cannot be changed in this development slice.
      </p>
      <label htmlFor="provider-name">
        Provider name <span className="text-destructive">*</span>
      </label>
      <Input
        id="provider-name"
        maxLength={100}
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        disabled={busy}
        placeholder="Your name or studio"
      />
      {error && (
        <p role="alert" className="market-form-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || !name.trim()}>
        {busy ? "Creating…" : "Create profile"}
      </Button>
    </form>
  );
}
function ListingEditor({
  listingId,
  accountId,
  onClose,
  onChanged,
}: {
  listingId: string;
  accountId: string;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const client = useQueryClient();
  const key = ["provider", accountId, "versions", listingId];
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const operation = useRef<{ source: string; id: string } | null>(null);
  const listing = useQuery({
    queryKey: ["provider", accountId, "listing", listingId],
    queryFn: async ({ signal }) => {
      const result = await api.GET("/v1/provider/listings/{id}", {
        params: { path: { id: listingId } },
        signal,
      });
      if (!result.data) throw fail(result.error);
      return result.data;
    },
  });
  const publishedVersionId = listing.data?.publishedVersionId;
  const paused = listing.data?.paused ?? true;
  const versions = useQuery({
    queryKey: [...key, offset],
    queryFn: async ({ signal }) => {
      const result = await api.GET("/v1/provider/listings/{id}/versions", {
        params: { path: { id: listingId }, query: { offset } },
        signal,
      });
      if (!result.data) throw fail(result.error);
      return result.data;
    },
  });
  const selected =
    versions.data?.find((version) => version.id === selectedId) ?? versions.data?.[0];
  async function changed() {
    await Promise.all([
      client.invalidateQueries({ queryKey: key }),
      onChanged(),
      client.invalidateQueries({ queryKey: ["catalog"] }),
      client.invalidateQueries({ queryKey: ["catalog-agent"] }),
    ]);
  }
  async function command(action: "submit" | "publish" | "pause") {
    if (busy || (!selected && action !== "pause")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result =
        action === "pause"
          ? await api.POST("/v1/provider/listings/{id}/pause", {
              params: { path: { id: listingId } },
            })
          : action === "submit"
            ? await api.POST("/v1/provider/listings/{id}/versions/{versionId}/submit", {
                params: { path: { id: listingId, versionId: selected!.id } },
              })
            : await api.POST("/v1/provider/listings/{id}/versions/{versionId}/publish", {
                params: { path: { id: listingId, versionId: selected!.id } },
              });
      if (!result.data) throw fail(result.error);
      await changed();
      setNotice(
        action === "publish"
          ? "Catalog version published. Execution remains disabled."
          : action === "pause"
            ? "Listing paused. Existing versions are unchanged."
            : "Submitted for operator review.",
      );
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (new TextEncoder().encode(source).length > 60000)
        throw new Error("Keep the manifest under 60 KB.");
      let manifest: Manifest;
      try {
        manifest = JSON.parse(source);
      } catch {
        throw new Error("Enter valid JSON for the complete manifest.");
      }
      if (!operation.current || operation.current.source !== source)
        operation.current = { source, id: crypto.randomUUID() };
      const result = await api.POST("/v1/provider/listings/{id}/versions", {
        params: { path: { id: listingId } },
        body: { id: operation.current.id, manifest },
      });
      if (!result.data) throw fail(result.error);
      setOffset(0);
      setSelectedId(result.data.id);
      setCreatingVersion(false);
      operation.current = null;
      await changed();
      setNotice("Immutable draft saved. Submit it when ready for review.");
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  const isNew = creatingVersion || versions.data?.length === 0;
  return (
    <section className="market-version-section" aria-label="Listing versions">
      <header className="market-page-heading">
        <div>
          <h2>
            {selected?.manifest.name ?? "New listing"}{" "}
            <span className="text-muted-foreground">/ Manifest versions</span>
          </h2>
          <p className="market-caption market-mono">{listingId}</p>
        </div>
        <Button variant="ghost" onClick={onClose}>
          Close editor
        </Button>
      </header>
      {versions.isPending || listing.isPending ? (
        <LoadingState label="Loading manifest versions…" />
      ) : versions.error || listing.error ? (
        <ErrorState
          message={(versions.error ?? listing.error)!.message}
          retry={() => {
            void versions.refetch();
            void listing.refetch();
          }}
        />
      ) : (
        <div className="market-editor-layout">
          <div className="market-card">
            <div className="market-editor-heading">
              <h2>Manifest candidate</h2>
              {selected && !isNew && <StatusBadge status={selected.state} />}
            </div>
            {!!versions.data?.length && (
              <Choice
                label="Manifest version"
                disabled={busy}
                value={selected?.id ?? ""}
                options={versions.data.map((version) => ({
                  value: version.id,
                  label: `${version.id.slice(0, 8)} · ${version.state}`,
                }))}
                onChange={(id) => {
                  setSelectedId(id);
                  setCreatingVersion(false);
                  setError("");
                  setNotice("");
                }}
              />
            )}
            {isNew ? (
              <form onSubmit={save} className="market-manifest-form">
                <GatewayBinding
                  accountId={accountId}
                  source={source}
                  onChange={setSource}
                  disabled={busy}
                />
                <label htmlFor="manifest-source">
                  Complete manifest JSON <span className="text-destructive">*</span>
                </label>
                <textarea
                  id="manifest-source"
                  className="market-textarea market-manifest-source"
                  value={source}
                  maxLength={60000}
                  onChange={(event) => setSource(event.target.value)}
                  required
                  spellCheck={false}
                  disabled={busy}
                  placeholder={
                    '{\n  "schemaVersion": 1,\n  "name": "Your focused agent",\n  ...complete manifest fields\n}'
                  }
                />
                <p className="market-caption">
                  Use the manifest from your provider package. Never include credentials, prompts or
                  model keys. The server validates HTTP v1 or Gateway v2, including ownership of the
                  pinned command revision.
                </p>
                <Button type="submit" disabled={busy || !source.trim()}>
                  {busy ? "Saving…" : "Save draft"}
                </Button>
                {creatingVersion && selected && (
                  <Button variant="ghost" onClick={() => setCreatingVersion(false)}>
                    Cancel
                  </Button>
                )}
              </form>
            ) : (
              selected && (
                <>
                  <pre className="market-code market-manifest-source" aria-label="Saved manifest">
                    {JSON.stringify(selected.manifest, null, 2)}
                  </pre>
                  <p className="market-caption">
                    Saved manifests are immutable. Changes need a new version.
                  </p>
                  <div className="market-editor-actions">
                    {selected.state === "draft" && (
                      <Button disabled={busy} onClick={() => void command("submit")}>
                        Submit for review
                      </Button>
                    )}
                    {selected.state === "submitted" && (
                      <Button variant="outline" disabled>
                        Awaiting operator review
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setSource(JSON.stringify(selected.manifest, null, 2));
                        setCreatingVersion(true);
                        setError("");
                      }}
                    >
                      New version
                    </Button>
                  </div>
                  {selected.reviewNote && (
                    <p className="market-caption mt-4">Review note: {selected.reviewNote}</p>
                  )}
                </>
              )
            )}
            {error && (
              <p role="alert" className="market-form-error">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="market-caption mt-4">
                {notice}
              </p>
            )}
            <Pagination
              offset={offset}
              hasMore={versions.data?.length === 50}
              onChange={(next) => {
                setOffset(next);
                setSelectedId("");
                setCreatingVersion(false);
              }}
              label="Version pages"
            />
          </div>
          <aside className="market-card market-version-controls">
            <h2>Version controls</h2>
            <dl className="market-key-pairs">
              <div>
                <dt>Review</dt>
                <dd>{selected ? <StatusBadge status={selected.state} /> : "No manifest"}</dd>
              </div>
              <div>
                <dt>Publication</dt>
                <dd>{publishedVersionId ? (paused ? "Paused" : "Published") : "Not published"}</dd>
              </div>
              <div>
                <dt>Execution</dt>
                <dd>Disabled</dd>
              </div>
              {selected && (
                <div>
                  <dt>Digest</dt>
                  <dd className="market-mono">{selected.digest}</dd>
                </div>
              )}
            </dl>
            <p className="market-caption">
              Publish becomes available after operator approval. Pause hides a listing. Publishing
              an older approved version rolls back the catalog pointer, not running work.
            </p>
            {selected?.state === "approved" && !isNew && (
              <Button
                disabled={busy || (!paused && publishedVersionId === selected.id)}
                onClick={() => void command("publish")}
              >
                {publishedVersionId === selected.id
                  ? paused
                    ? "Resume publication"
                    : "Current published version"
                  : "Publish this version"}
              </Button>
            )}
            {publishedVersionId && !paused && (
              <Button variant="outline" disabled={busy} onClick={() => void command("pause")}>
                Pause listing
              </Button>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
