import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { api } from "~/lib/api";
import { useSession } from "~/lib/use-session";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { SignInDialog } from "~/components/sign-in-dialog";
import { ConversationThread } from "./conversation-thread";
import type { paths } from "~/lib/schema";

type Workspace =
  paths["/v1/workspaces"]["get"]["responses"][200]["content"]["application/json"][number];

function failure(error: { message: string } | undefined) {
  return new Error(error?.message ?? "Couldn't reach the workspace. Please try again.");
}

export function WorkspacePage() {
  const { accountId, checking, error } = useSession();
  if (checking)
    return (
      <p role="status" className="p-6 text-sm text-muted-foreground">
        Checking session…
      </p>
    );
  if (!accountId)
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 p-6">
        <Link to="/" className="text-sm text-muted-foreground">
          ← AgentNe
        </Link>
        <h1 className="text-xl font-semibold">Your private workspace</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to create workspaces and keep your conversations.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <SignInDialog />
      </main>
    );
  return <SignedInWorkspace key={accountId} accountId={accountId} />;
}

function SignedInWorkspace({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const search = useSearch({ from: "/workspace" });
  const navigate = useNavigate({ from: "/workspace" });
  const [workspaceId, setWorkspaceId] = useState(search.workspace ?? "");
  const [conversationId, setConversationId] = useState(search.conversation ?? "");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(search.offset);
  const [conversationOffset, setConversationOffset] = useState(search.conversationOffset);
  const [reload, setReload] = useState(0);
  const [showNavigation, setShowNavigation] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const key = ["workspace", accountId];
  const workspaces = useQuery({
    queryKey: [...key, "list", offset],
    queryFn: async () => {
      const result = await api.GET("/v1/workspaces", { params: { query: { offset } } });
      if (!result.data) throw failure(result.error);
      return result.data;
    },
  });
  const selected =
    workspaces.data?.find((entry) => entry.id === workspaceId) ?? workspaces.data?.[0];
  const conversations = useQuery({
    queryKey: [...key, selected?.id, "conversations", conversationOffset],
    enabled: !!selected,
    queryFn: async () => {
      const result = await api.GET("/v1/workspaces/{id}/conversations", {
        params: { path: { id: selected!.id }, query: { offset: conversationOffset } },
      });
      if (!result.data) throw failure(result.error);
      return result.data;
    },
  });
  const conversation =
    conversations.data?.find((entry) => entry.id === conversationId) ?? conversations.data?.[0];

  useEffect(() => {
    if (selected && !conversations.isPending) {
      void navigate({
        replace: true,
        search: {
          workspace: selected.id,
          conversation: conversation?.id,
          offset,
          conversationOffset,
        },
      });
    }
  }, [
    selected?.id,
    conversation?.id,
    conversations.isPending,
    offset,
    conversationOffset,
    navigate,
  ]);
  useEffect(() => {
    if (!showNavigation) headingRef.current?.focus();
  }, [conversation?.id, showNavigation]);

  useEffect(
    () => () => {
      queryClient.removeQueries({ queryKey: ["workspace", accountId] });
    },
    [accountId, queryClient],
  );

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    if (creating || !title.trim()) return;
    setCreating(true);
    setError("");
    try {
      const result = await api.POST("/v1/workspaces", {
        body: { id: crypto.randomUUID(), title: title.trim() },
      });
      if (!result.data) throw failure(result.error);
      setOffset(0);
      setConversationOffset(0);
      setWorkspaceId(result.data.id);
      setConversationId("");
      setTitle("");
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create workspace.");
    } finally {
      setCreating(false);
    }
  }

  async function createConversation() {
    if (!selected || creating) return;
    setCreating(true);
    setError("");
    try {
      const result = await api.POST("/v1/workspaces/{id}/conversations", {
        params: { path: { id: selected.id } },
        body: { id: crypto.randomUUID(), title: `Conversation ${new Date().toLocaleString()}` },
      });
      if (!result.data) throw failure(result.error);
      setConversationOffset(0);
      setConversationId(result.data.id);
      setShowNavigation(false);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create conversation.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="flex h-dvh min-w-0 flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b px-4 sm:px-6">
        <Link to="/" className="font-semibold">
          AgentNe<span className="text-muted-foreground">.</span>
        </Link>
        <span className="hidden text-xs text-muted-foreground sm:block">
          Private workspace · Development
        </span>
        <Button
          variant="outline"
          className="md:hidden"
          aria-expanded={showNavigation}
          aria-controls="workspace-navigation"
          onClick={() => setShowNavigation(!showNavigation)}
        >
          {showNavigation ? "Back to conversation" : "Workspaces"}
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          id="workspace-navigation"
          aria-label="Workspaces and conversations"
          className={`${showNavigation ? "flex" : "hidden"} min-h-0 w-full shrink-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:flex md:w-72 md:flex-none md:border-r`}
        >
          <form onSubmit={createWorkspace} className="space-y-2">
            <label htmlFor="workspace-title" className="text-sm font-medium">
              New workspace
            </label>
            <div className="flex gap-2">
              <Input
                id="workspace-title"
                className="min-w-0 bg-background"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                required
                placeholder="Workspace name"
                disabled={creating}
              />
              <Button
                variant="outline"
                size="icon"
                type="submit"
                disabled={creating || !title.trim()}
                aria-label="Create workspace"
              >
                <PlusIcon />
              </Button>
            </div>
          </form>
          {workspaces.isPending && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading workspaces…
            </p>
          )}
          {!!workspaces.data?.length && (
            <div className="space-y-2">
              <label htmlFor="workspace-select" className="text-sm font-medium">
                Workspace
              </label>
              <select
                id="workspace-select"
                value={selected?.id ?? ""}
                className="h-10 w-full min-w-0 rounded-lg border bg-background px-2 text-base md:text-sm"
                onChange={(event) => {
                  setWorkspaceId(event.target.value);
                  setConversationId("");
                  setConversationOffset(0);
                }}
              >
                {workspaces.data.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            {offset > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setOffset(offset - 50);
                  setWorkspaceId("");
                }}
              >
                Previous workspaces
              </Button>
            )}
            {workspaces.data?.length === 50 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setOffset(offset + 50);
                  setWorkspaceId("");
                }}
              >
                More workspaces
              </Button>
            )}
          </div>
          {selected && (
            <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium">Conversations</h2>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="New conversation"
                  onClick={createConversation}
                  disabled={creating}
                >
                  <PlusIcon />
                </Button>
              </div>
              <nav aria-label="Conversations" className="flex flex-col gap-1">
                {conversations.data?.map((entry) => (
                  <Button
                    key={entry.id}
                    variant={entry.id === conversation?.id ? "secondary" : "ghost"}
                    className="h-auto min-h-10 w-full justify-start whitespace-normal text-left"
                    title={entry.title}
                    aria-current={entry.id === conversation?.id ? "page" : undefined}
                    onClick={() => {
                      setConversationId(entry.id);
                      setShowNavigation(false);
                    }}
                  >
                    {entry.title}
                  </Button>
                ))}
              </nav>
              {conversations.isPending && (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading conversations…
                </p>
              )}
              {conversations.data?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Create a conversation to start your brief.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {conversationOffset > 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => setConversationOffset(conversationOffset - 50)}
                  >
                    Previous conversations
                  </Button>
                )}
                {conversations.data?.length === 50 && (
                  <Button
                    variant="ghost"
                    onClick={() => setConversationOffset(conversationOffset + 50)}
                  >
                    More conversations
                  </Button>
                )}
              </div>
            </>
          )}
          <div className="mt-auto pt-4">
            <SignInDialog />
          </div>
        </aside>
        <section
          aria-label="Conversation"
          className={`${showNavigation ? "hidden" : "flex"} min-h-0 min-w-0 flex-1 flex-col md:flex`}
        >
          {(error || workspaces.error || conversations.error) && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 p-4 text-sm text-destructive"
            >
              <p>{error || workspaces.error?.message || conversations.error?.message}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setError("");
                  void queryClient.invalidateQueries({ queryKey: key });
                }}
              >
                Retry
              </Button>
            </div>
          )}
          {selected ? (
            <BriefEditor
              key={`${selected.id}-${selected.revision}`}
              workspace={selected}
              onSaved={() => queryClient.invalidateQueries({ queryKey: key })}
            />
          ) : (
            !workspaces.isPending && (
              <div className="m-auto max-w-md p-6">
                <h1 className="text-xl font-semibold">A workspace for your next task</h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Create a workspace to save a brief and keep related conversations together. Only
                  you can access it.
                </p>
                <Button
                  className="mt-4 md:hidden"
                  variant="outline"
                  onClick={() => setShowNavigation(true)}
                >
                  Create your workspace
                </Button>
              </div>
            )
          )}
          {conversation && (
            <>
              <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2">
                <h1
                  ref={headingRef}
                  id="conversation-heading"
                  tabIndex={-1}
                  className="truncate text-sm font-medium outline-none"
                >
                  {conversation.title}
                </h1>
                <Button variant="ghost" size="sm" onClick={() => setReload(reload + 1)}>
                  Reload saved messages
                </Button>
              </div>
              <ConversationThread
                key={`${conversation.id}-${reload}`}
                conversationId={conversation.id}
                onSnapshotReset={() => setReload((revision) => revision + 1)}
              />
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function BriefEditor({
  workspace,
  onSaved,
}: {
  workspace: Workspace;
  onSaved: () => Promise<unknown>;
}) {
  const [brief, setBrief] = useState(workspace.brief);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setStatus("");
    try {
      const result = await api.PATCH("/v1/workspaces/{id}/brief", {
        params: { path: { id: workspace.id } },
        body: { brief, revision: workspace.revision },
      });
      if (!result.data) throw failure(result.error);
      setStatus("Brief saved.");
      await onSaved();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Couldn't save brief.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={save} className="shrink-0 space-y-2 border-b p-4">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="workspace-brief" className="text-sm font-medium">
          Task brief
        </label>
        <Button type="submit" variant="outline" disabled={saving || brief === workspace.brief}>
          {saving ? "Saving…" : "Save brief"}
        </Button>
      </div>
      <textarea
        id="workspace-brief"
        rows={2}
        maxLength={8000}
        value={brief}
        onChange={(event) => setBrief(event.target.value)}
        className="max-h-32 w-full resize-y rounded-lg border bg-background px-3 py-2 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 md:text-sm"
        placeholder="Outcome, available inputs, and constraints…"
      />
      {status && (
        <p role="status" className="text-xs text-muted-foreground">
          {status}
        </p>
      )}
    </form>
  );
}
