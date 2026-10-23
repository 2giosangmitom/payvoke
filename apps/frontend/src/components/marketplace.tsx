import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { api } from "../lib/api";
import type { Product } from "../lib/catalog";

type Collection = { id: string; name: string; items: Product[] };
type App = { id: string; name: string; payoutAddress: string };
type ProviderKey = {
  id: string;
  prefix: string;
  scopes: string[];
  expiresAt: string;
  revokedAt: string | null;
};
type OwnedCommand = {
  commandId: string;
  name: string;
  title: string;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  positionalParameter: string | null;
  grossAmount: string;
  terms: {
    deliverySeconds: number;
    reviewSeconds: number;
    revisionPolicy: { maxIncluded: number; description: string };
    refundPolicy: string;
    sideEffects: string;
    dataUse: string;
  };
};
type Draft = {
  number: number;
  revision: number;
  status: string;
  defaultCommandId: string | null;
  chatTextParameter: string | null;
  commands: OwnedCommand[];
};
type OwnedProduct = {
  id: string;
  name: string;
  kind: string;
  status: string;
  activeVersion: number | null;
  versions: Draft[];
};
type Tab = "starred" | "provider";

export function Marketplace({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const accountKey = ["account", accountId] as const;
  const [tab, setTab] = useState<Tab>("starred");
  const [selectedApp, setSelectedApp] = useState("");
  const [selectedScopes, setSelectedScopes] = useState(["products:write"]);
  const [keyExpiry, setKeyExpiry] = useState(
    new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
  );
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [appName, setAppName] = useState("");
  const [payout, setPayout] = useState<string | null>(null);
  const [newPayout, setNewPayout] = useState("");
  const [collectionName, setCollectionName] = useState("");
  const [editingCollection, setEditingCollection] = useState("");
  const [editedName, setEditedName] = useState("");
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [kind, setKind] = useState("TOOL");
  const [commandName, setCommandName] = useState("ask");
  const [commandTitle, setCommandTitle] = useState("Ask");
  const [commandDescription, setCommandDescription] = useState("");
  const [positionalParameter, setPositionalParameter] = useState("");
  const [editingCommand, setEditingCommand] = useState<{
    productId: string;
    commandId: string;
  } | null>(null);
  const [price, setPrice] = useState("10000");
  const [deliverySeconds, setDeliverySeconds] = useState("600");
  const [reviewSeconds, setReviewSeconds] = useState("3600");
  const [refundPolicy, setRefundPolicy] = useState("");
  const [sideEffects, setSideEffects] = useState("none");
  const [dataUse, setDataUse] = useState("");
  const [includedRevisions, setIncludedRevisions] = useState("0");
  const [revisionDescription, setRevisionDescription] = useState("");
  const [inputSchema, setInputSchema] = useState(
    '{"type":"object","additionalProperties":false,"required":["text"],"properties":{"text":{"type":"string","minLength":1,"maxLength":20000}}}',
  );
  const [outputSchema, setOutputSchema] = useState(
    '{"type":"object","additionalProperties":false,"required":["result"],"properties":{"result":{"type":"string"}}}',
  );

  const starsQuery = useQuery({
    queryKey: [...accountKey, "stars"],
    queryFn: () => api<Product[]>("/v1/stars"),
  });
  const collectionsQuery = useQuery({
    queryKey: [...accountKey, "collections"],
    queryFn: () => api<Collection[]>("/v1/collections"),
  });
  const appsQuery = useQuery({
    queryKey: [...accountKey, "provider-apps"],
    queryFn: () => api<App[]>("/v1/provider/apps"),
  });
  const accountQuery = useQuery({
    queryKey: [...accountKey, "me"],
    queryFn: () => api<{ buyer: { address: string } }>("/v1/me"),
  });
  const ownedQuery = useQuery({
    queryKey: [...accountKey, "app", selectedApp, "products"],
    queryFn: () => api<OwnedProduct[]>(`/v1/provider/apps/${selectedApp}/products`),
    enabled: Boolean(selectedApp),
  });
  const keysQuery = useQuery({
    queryKey: [...accountKey, "app", selectedApp, "keys"],
    queryFn: () => api<ProviderKey[]>(`/v1/provider/apps/${selectedApp}/keys`),
    enabled: Boolean(selectedApp),
  });
  const stars = starsQuery.data ?? [];
  const collections = collectionsQuery.data ?? [];
  const apps = appsQuery.data ?? [];
  const owned = ownedQuery.data ?? [];
  const keys = keysQuery.data ?? [];
  const accountAddress = accountQuery.data?.buyer.address ?? "";
  const queryError = [
    starsQuery,
    collectionsQuery,
    appsQuery,
    accountQuery,
    ownedQuery,
    keysQuery,
  ].find((query) => query.error)?.error;
  useEffect(() => {
    if (appsQuery.data) setSelectedApp((current) => current || appsQuery.data[0]?.id || "");
  }, [appsQuery.data]);
  useEffect(() => {
    setNewPayout(apps.find((item) => item.id === selectedApp)?.payoutAddress ?? "");
  }, [selectedApp, appsQuery.data]);
  async function run(
    action: () => Promise<unknown>,
    changed: Array<"catalog" | "stars" | "collections" | "apps" | "owned" | "keys">,
  ) {
    setError("");
    setBusy(true);
    try {
      await action();
      for (const item of changed) {
        const queryKey =
          item === "catalog"
            ? ["catalog"]
            : item === "owned" || item === "keys"
              ? [...accountKey, "app", selectedApp, item === "owned" ? "products" : "keys"]
              : [...accountKey, item === "apps" ? "provider-apps" : item];
        void queryClient.invalidateQueries({ queryKey });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  function editCommand(productId: string, command: OwnedCommand) {
    setEditingCommand({ productId, commandId: command.commandId });
    setCommandName(command.name);
    setCommandTitle(command.title);
    setCommandDescription(command.description);
    setPositionalParameter(command.positionalParameter ?? "");
    setPrice(command.grossAmount);
    setInputSchema(JSON.stringify(command.inputSchema, null, 2));
    setOutputSchema(JSON.stringify(command.outputSchema, null, 2));
    setDeliverySeconds(String(command.terms.deliverySeconds));
    setReviewSeconds(String(command.terms.reviewSeconds));
    setIncludedRevisions(String(command.terms.revisionPolicy.maxIncluded));
    setRevisionDescription(command.terms.revisionPolicy.description);
    setRefundPolicy(command.terms.refundPolicy);
    setSideEffects(command.terms.sideEffects);
    setDataUse(command.terms.dataUse);
  }

  return (
    <main className="market-shell">
      <div className="market-intro">
        <h1>{tab === "starred" ? "Your saved listings." : "Your provider apps."}</h1>
        <p>
          {tab === "starred"
            ? "Save agents and tools, then group them into collections."
            : "Manage credentials, drafts, and published products."}
        </p>
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value === "provider" ? "provider" : "starred")}
      >
        <TabsList variant="line" className="market-tabs" aria-label="Workspace sections">
          <TabsTrigger value="starred">
            Saved <span>{stars.length}</span>
          </TabsTrigger>
          <TabsTrigger value="provider">
            Provider <span>{apps.length}</span>
          </TabsTrigger>
        </TabsList>
        {(error || queryError) && (
          <p className="market-error" role="alert">
            {error || (queryError instanceof Error ? queryError.message : String(queryError))}
          </p>
        )}
        <TabsContent value="starred">
          <section className="market-columns">
            <div>
              <h2>Saved listings</h2>
              <p className="workspace-panel-description">Listings you want to revisit.</p>
              {stars.map((product) => (
                <div className="market-row" key={product.id}>
                  <div>
                    <strong>{product.name}</strong>
                    <small>{product.status === "PUBLISHED" ? "Coming soon" : "Unavailable"}</small>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => api(`/v1/stars/${product.id}`, "DELETE"),
                        ["stars", "collections"],
                      )
                    }
                  >
                    Remove
                  </button>
                  <select
                    aria-label={`Add ${product.name} to collection`}
                    value=""
                    onChange={(event) => {
                      if (event.target.value)
                        void run(
                          () =>
                            api(
                              `/v1/collections/${event.target.value}/products/${product.id}`,
                              "PUT",
                            ),
                          ["collections"],
                        );
                    }}
                  >
                    <option value="">Add to collection</option>
                    {collections.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {starsQuery.isPending ? (
                <div
                  className="workspace-loading"
                  role="status"
                  aria-label="Loading saved listings"
                />
              ) : (
                !starsQuery.isError &&
                !stars.length && (
                  <div className="workspace-empty">
                    <p>Nothing saved yet.</p>
                    <Link to="/agents">Browse agents</Link>
                  </div>
                )
              )}
            </div>
            <div>
              <h2>Collections</h2>
              <p className="workspace-panel-description">
                Group your saved listings by project or task.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await api("/v1/collections", "POST", { name: collectionName });
                    setCollectionName("");
                  }, ["collections"]);
                }}
              >
                <label>
                  Collection name
                  <Input
                    aria-label="Collection name"
                    placeholder="New collection"
                    value={collectionName}
                    onChange={(event) => setCollectionName(event.target.value)}
                    required
                    maxLength={100}
                  />
                </label>
                <Button type="submit" disabled={busy}>
                  Create
                </Button>
              </form>
              {collections.map((collection) => (
                <article className="market-collection" key={collection.id}>
                  <div className="market-card-footer">
                    <h3>{collection.name}</h3>
                    <button
                      onClick={() => {
                        setEditingCollection(collection.id);
                        setEditedName(collection.name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => api(`/v1/collections/${collection.id}`, "DELETE"),
                          ["collections"],
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                  {editingCollection === collection.id && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void run(async () => {
                          await api(`/v1/collections/${collection.id}`, "PUT", {
                            name: editedName,
                          });
                          setEditingCollection("");
                        }, ["collections"]);
                      }}
                    >
                      <label>
                        New collection name
                        <Input
                          aria-label="New collection name"
                          value={editedName}
                          onChange={(event) => setEditedName(event.target.value)}
                          required
                          maxLength={100}
                        />
                      </label>
                      <button disabled={busy}>Save</button>
                    </form>
                  )}
                  {collection.items.map((product) => (
                    <div className="market-card-footer" key={product.id}>
                      <span>{product.name}</span>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              api(
                                `/v1/collections/${collection.id}/products/${product.id}`,
                                "DELETE",
                              ),
                            ["collections"],
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </article>
              ))}
            </div>
          </section>
        </TabsContent>
        <TabsContent value="provider">
          <section className="market-columns">
            <div>
              <h2>Apps</h2>
              <p className="workspace-panel-description">
                Each app has its own key and payout wallet.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    const created = await api<App>("/v1/provider/apps", "POST", {
                      name: appName,
                      payoutAddress: payout ?? accountAddress,
                      clientRequestId: crypto.randomUUID(),
                    });
                    setSelectedApp(created.id);
                    setAppName("");
                    setPayout(null);
                  }, ["apps"]);
                }}
              >
                <label>
                  App name
                  <input
                    value={appName}
                    onChange={(event) => setAppName(event.target.value)}
                    required
                    maxLength={120}
                  />
                </label>
                <label>
                  Payout wallet
                  <input
                    value={payout ?? accountAddress}
                    onChange={(event) => setPayout(event.target.value)}
                    required
                    placeholder="0x…"
                  />
                </label>
                <button disabled={busy}>Create app</button>
              </form>
              <label>
                Active app
                <select
                  value={selectedApp}
                  onChange={(event) => {
                    setSelectedApp(event.target.value);
                    setSecret("");
                  }}
                >
                  <option value="">Select app</option>
                  {apps.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedApp && (
                <>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(
                        () =>
                          api(`/v1/provider/apps/${selectedApp}/payout`, "PUT", {
                            payoutAddress: newPayout,
                          }),
                        ["apps"],
                      );
                    }}
                  >
                    <label>
                      Payout wallet for new versions
                      <input
                        value={newPayout}
                        onChange={(event) => setNewPayout(event.target.value)}
                        required
                      />
                    </label>
                    <button disabled={busy}>Update app payout</button>
                  </form>
                  <h3 className="workspace-subheading">API key</h3>
                  <p className="workspace-panel-description">
                    One active key per app. Choose only the permissions it needs.
                  </p>
                  {(
                    [
                      "products:write",
                      "events:read",
                      "events:ack",
                      "reports:write",
                      "files:write",
                    ] as const
                  ).map((scope) => (
                    <label key={scope}>
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(scope)}
                        onChange={(event) =>
                          setSelectedScopes((current) =>
                            event.target.checked
                              ? [...current, scope]
                              : current.filter((item) => item !== scope),
                          )
                        }
                      />{" "}
                      {scope}
                    </label>
                  ))}
                  <label>
                    Key expires
                    <input
                      type="date"
                      value={keyExpiry}
                      onChange={(event) => setKeyExpiry(event.target.value)}
                    />
                  </label>
                  <button
                    disabled={busy || !selectedScopes.length}
                    onClick={() =>
                      void run(async () => {
                        const key = await api<{ secret: string }>(
                          `/v1/provider/apps/${selectedApp}/keys`,
                          "POST",
                          {
                            scopes: selectedScopes,
                            expiresAt: new Date(`${keyExpiry}T23:59:59Z`).toISOString(),
                          },
                        );
                        setSecret(key.secret);
                      }, ["keys"])
                    }
                  >
                    Create or rotate API key
                  </button>
                  {keys
                    .filter((key) => !key.revokedAt)
                    .map((key) => (
                      <div className="market-card-footer" key={key.id}>
                        <span>
                          Key {key.prefix} · expires {new Date(key.expiresAt).toLocaleDateString()}
                        </span>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                api(
                                  `/v1/provider/apps/${selectedApp}/keys/${key.id}/revocations`,
                                  "POST",
                                ),
                              ["keys"],
                            )
                          }
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  {secret && (
                    <div className="market-secret">
                      <p>Copy now. This key appears only once. Rotating revoked the old key.</p>
                      <code>{secret}</code>
                      <button onClick={() => void navigator.clipboard.writeText(secret)}>
                        Copy key
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <h2>Products</h2>
              <p className="workspace-panel-description">
                Create a draft, add commands, then publish.
              </p>
              {!selectedApp && (
                <p className="workspace-empty">
                  Create or select an app to add your first product.
                </p>
              )}
              {selectedApp && (
                <>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () => {
                        await api(`/v1/provider/apps/${selectedApp}/products`, "POST", {
                          kind,
                          name: productName,
                          description: productDescription,
                        });
                        setProductName("");
                        setProductDescription("");
                      }, ["owned"]);
                    }}
                  >
                    <label>
                      Kind
                      <select value={kind} onChange={(event) => setKind(event.target.value)}>
                        <option value="TOOL">Tool</option>
                        <option value="AGENT">Agent</option>
                      </select>
                    </label>
                    <label>
                      Name
                      <input
                        value={productName}
                        onChange={(event) => setProductName(event.target.value)}
                        required
                        maxLength={160}
                      />
                    </label>
                    <label>
                      Description
                      <textarea
                        value={productDescription}
                        onChange={(event) => setProductDescription(event.target.value)}
                        required
                        maxLength={2000}
                      />
                    </label>
                    <button disabled={busy}>Create draft</button>
                  </form>
                  {owned.map((product) => {
                    const draft = product.versions.find((version) => version.status === "DRAFT");
                    return (
                      <article className="market-collection" key={product.id}>
                        <span className="eyebrow">{product.status}</span>
                        <h3>{product.name}</h3>
                        {product.activeVersion && !draft && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () =>
                                  api(
                                    `/v1/provider/apps/${selectedApp}/products/${product.id}/versions`,
                                    "POST",
                                    { baseVersion: product.activeVersion },
                                  ),
                                ["owned"],
                              )
                            }
                          >
                            Create new version
                          </button>
                        )}
                        {draft && (
                          <>
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                void run(async () => {
                                  const editing =
                                    editingCommand?.productId === product.id
                                      ? editingCommand
                                      : null;
                                  await api(
                                    `/v1/provider/apps/${selectedApp}/products/${product.id}/commands${editing ? `/${editing.commandId}` : ""}`,
                                    editing ? "PUT" : "POST",
                                    {
                                      draftVersion: draft.number,
                                      ...(editing ? { expectedRevision: draft.revision } : {}),
                                      name: commandName,
                                      title: commandTitle,
                                      description: commandDescription,
                                      ...(positionalParameter ? { positionalParameter } : {}),
                                      inputSchema: JSON.parse(inputSchema),
                                      outputSchema: JSON.parse(outputSchema),
                                      grossAmount: price,
                                      terms: {
                                        deliverySeconds: Number(deliverySeconds),
                                        reviewSeconds: Number(reviewSeconds),
                                        revisionPolicy: {
                                          maxIncluded: Number(includedRevisions),
                                          description: revisionDescription,
                                        },
                                        refundPolicy,
                                        sideEffects,
                                        dataUse,
                                      },
                                    },
                                  );
                                  setEditingCommand(null);
                                }, ["owned"]);
                              }}
                            >
                              <label>
                                Command name
                                <input
                                  value={commandName}
                                  onChange={(event) => setCommandName(event.target.value)}
                                  required
                                />
                              </label>
                              <label>
                                Title
                                <input
                                  value={commandTitle}
                                  onChange={(event) => setCommandTitle(event.target.value)}
                                  required
                                />
                              </label>
                              <label>
                                Description
                                <input
                                  value={commandDescription}
                                  onChange={(event) => setCommandDescription(event.target.value)}
                                  required
                                />
                              </label>
                              <label>
                                Positional input parameter (optional)
                                <input
                                  value={positionalParameter}
                                  onChange={(event) => setPositionalParameter(event.target.value)}
                                />
                              </label>
                              <label>
                                Price, atomic USDC
                                <input
                                  value={price}
                                  onChange={(event) => setPrice(event.target.value)}
                                  required
                                />
                              </label>
                              <label>
                                Delivery time, seconds
                                <input
                                  type="number"
                                  min="1"
                                  required
                                  value={deliverySeconds}
                                  onChange={(event) => setDeliverySeconds(event.target.value)}
                                />
                              </label>
                              <label>
                                Review time, seconds
                                <input
                                  type="number"
                                  min="0"
                                  required
                                  value={reviewSeconds}
                                  onChange={(event) => setReviewSeconds(event.target.value)}
                                />
                              </label>
                              <label>
                                Refund policy
                                <input
                                  required
                                  value={refundPolicy}
                                  onChange={(event) => setRefundPolicy(event.target.value)}
                                />
                              </label>
                              <label>
                                Side effects
                                <input
                                  required
                                  value={sideEffects}
                                  onChange={(event) => setSideEffects(event.target.value)}
                                />
                              </label>
                              <label>
                                Data use
                                <input
                                  required
                                  value={dataUse}
                                  onChange={(event) => setDataUse(event.target.value)}
                                />
                              </label>
                              <label>
                                Included revisions
                                <input
                                  type="number"
                                  min="0"
                                  required
                                  value={includedRevisions}
                                  onChange={(event) => setIncludedRevisions(event.target.value)}
                                />
                              </label>
                              <label>
                                Revision policy
                                <input
                                  required
                                  value={revisionDescription}
                                  onChange={(event) => setRevisionDescription(event.target.value)}
                                />
                              </label>
                              <label>
                                Input schema
                                <textarea
                                  value={inputSchema}
                                  onChange={(event) => setInputSchema(event.target.value)}
                                />
                              </label>
                              <label>
                                Output schema
                                <textarea
                                  value={outputSchema}
                                  onChange={(event) => setOutputSchema(event.target.value)}
                                />
                              </label>
                              <button disabled={busy}>
                                {editingCommand?.productId === product.id
                                  ? "Save command"
                                  : "Add command"}
                              </button>
                            </form>
                            {draft.commands.map((command) => (
                              <div className="market-card-footer" key={command.commandId}>
                                <span>
                                  /{command.name} · {command.grossAmount} atomic USDC
                                </span>
                                <button
                                  disabled={busy}
                                  onClick={() => editCommand(product.id, command)}
                                >
                                  Edit
                                </button>
                              </div>
                            ))}
                            {!draft.commands.length && <p>No commands yet</p>}
                            {
                              <button
                                disabled={busy || !draft.commands.length}
                                onClick={() =>
                                  void run(async () => {
                                    if (product.kind === "AGENT" && !draft.defaultCommandId)
                                      await api(
                                        `/v1/provider/apps/${selectedApp}/products/${product.id}/versions/${draft.number}/settings`,
                                        "PUT",
                                        {
                                          defaultCommandId: draft.commands[0].commandId,
                                          chatTextParameter: "text",
                                          expectedRevision: draft.revision,
                                        },
                                      );
                                    const current = await api<OwnedProduct[]>(
                                      `/v1/provider/apps/${selectedApp}/products`,
                                    );
                                    const revision = current
                                      .find((item) => item.id === product.id)
                                      ?.versions.find(
                                        (version) => version.number === draft.number,
                                      )?.revision;
                                    await api(
                                      `/v1/provider/apps/${selectedApp}/products/${product.id}/versions/${draft.number}/submissions`,
                                      "POST",
                                      { expectedRevision: revision },
                                    );
                                  }, ["owned", "catalog"])
                                }
                              >
                                Publish
                              </button>
                            }
                          </>
                        )}
                      </article>
                    );
                  })}
                </>
              )}
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </main>
  );
}
