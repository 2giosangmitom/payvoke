import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, LoaderCircle, Pencil, Plus, Search } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { authClient } from "@/src/lib/auth-client";
import { archiveThread, getThreads, renameThread, type ThreadSummary } from "@/src/lib/paid-chat";

function ThreadRow({
  thread,
  active,
  onRename,
  onArchive,
  busy,
}: {
  thread: ThreadSummary;
  active: boolean;
  onRename: () => void;
  onArchive: () => void;
  busy: boolean;
}) {
  return (
    <div className={active ? "thread-row is-active" : "thread-row"}>
      <Link to="/chat/$threadId" params={{ threadId: thread.id }} className="thread-row-link">
        <span className="thread-row-title">{thread.title || thread.app.name}</span>
        <small>
          <i
            className={`thread-dot is-${thread.app.availability.toLowerCase()}`}
            aria-hidden="true"
          />
          {thread.app.name}
        </small>
      </Link>
      <div className="thread-row-actions">
        <button type="button" aria-label="Rename thread" onClick={onRename} disabled={busy}>
          <Pencil size={13} />
        </button>
        <button type="button" aria-label="Archive thread" onClick={onArchive} disabled={busy}>
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Archive size={13} />}
        </button>
      </div>
    </div>
  );
}

export function ThreadSidebar() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: session } = authClient.useSession();
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState<ThreadSummary | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const threads = useQuery({
    queryKey: ["threads", session?.user.id, search],
    queryFn: () => getThreads(search),
    enabled: Boolean(session),
    staleTime: 10_000,
  });
  const rename = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) => renameThread(id, next),
    onSuccess: () => {
      setRenaming(null);
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Rename failed."),
  });
  const archive = useMutation({
    mutationFn: archiveThread,
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries({ queryKey: ["threads"] });
      if (pathname === `/chat/${id}`) await navigate({ to: "/chat" });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Archive failed."),
  });

  return (
    <aside className="thread-sidebar" aria-label="Threads">
      <div className="thread-sidebar-head">
        <p className="workspace-kicker">THREADS</p>
        <Button render={<Link to="/chat" />} className="thread-new" variant="outline">
          <Plus size={15} /> New
        </Button>
      </div>
      <label className="thread-search">
        <Search size={14} aria-hidden="true" />
        <span className="sr-only">Search threads</span>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search threads"
        />
      </label>
      {!session ? (
        <p className="thread-sidebar-note">Sign in to keep threads across apps.</p>
      ) : threads.isPending ? (
        <p className="thread-sidebar-note">
          <LoaderCircle size={14} className="animate-spin" /> Loading threads…
        </p>
      ) : threads.isError ? (
        <p className="thread-sidebar-note" role="alert">
          {threads.error instanceof Error ? threads.error.message : "Could not load threads."}
        </p>
      ) : (threads.data?.items.length ?? 0) === 0 ? (
        <p className="thread-sidebar-note">No threads yet. Pick an app on the store shelf.</p>
      ) : (
        <nav className="thread-list" aria-label="Your threads">
          {threads.data?.items.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              active={pathname === `/chat/${thread.id}`}
              busy={archive.isPending && archive.variables === thread.id}
              onRename={() => {
                setError("");
                setTitle(thread.title || thread.app.name);
                setRenaming(thread);
              }}
              onArchive={() => {
                setError("");
                archive.mutate(thread.id);
              }}
            />
          ))}
        </nav>
      )}
      {session && (
        <div className="thread-sidebar-foot">
          <Link to="/store">Browse store</Link>
          <Link to="/dashboard">Manage apps</Link>
        </div>
      )}
      {error && (
        <p className="thread-sidebar-note is-error" role="alert">
          {error}
        </p>
      )}
      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="thread-rename-dialog">
          <DialogHeader>
            <DialogTitle>Rename thread</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (renaming) rename.mutate({ id: renaming.id, next: title });
            }}
          >
            <label htmlFor="thread-title">Thread title</label>
            <Input
              id="thread-title"
              value={title}
              maxLength={160}
              required
              onChange={(event) => setTitle(event.target.value)}
            />
            <div className="thread-dialog-actions">
              <Button type="submit" disabled={rename.isPending || !title.trim()}>
                {rename.isPending ? <LoaderCircle size={14} className="animate-spin" /> : null}
                Save
              </Button>
              <Button type="button" variant="ghost" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
