import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Spinner } from "@/src/components/ui/spinner";
import { Eyebrow, FormField, StatusDot, errorMessage } from "@/src/components/layout/page-kit";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import { cn } from "@/src/lib/utils";
import { authClient } from "@/src/features/auth/auth-client";
import {
  archiveThread,
  getThreads,
  renameThread,
  type ThreadSummary,
} from "@/src/features/chat/api";

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
    <div
      className={cn(
        // The console's one selection mark: a 1px jade line on the row's edge.
        "group relative flex min-w-0 items-center transition-colors hover:bg-card",
        "before:absolute before:inset-y-1.5 before:left-0 before:w-px",
        active && "bg-card before:bg-primary",
      )}
    >
      <Link
        to="/console/chat/$threadId"
        params={{ threadId: thread.id }}
        aria-current={active ? "page" : undefined}
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-2 pl-3"
      >
        <AgentAvatar
          name={thread.app.name}
          imageUrl={thread.app.imageUrl}
          className="size-8 text-sm"
        />
        <span className="grid min-w-0 gap-1">
          <span className="truncate text-[13px] font-semibold">
            {thread.title || thread.app.name}
          </span>
          <small className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
            <StatusDot availability={thread.app.availability} />
            {thread.app.name}
          </small>
        </span>
      </Link>
      <div className="flex shrink-0 pr-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Rename thread"
          onClick={onRename}
          disabled={busy}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Archive thread"
          onClick={onArchive}
          disabled={busy}
        >
          {busy ? <Spinner className="size-3" /> : <Archive />}
        </Button>
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
    // Tool runs are one thread each and live in Activity instead.
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
    onError: (cause) => setError(errorMessage(cause, "Rename failed.")),
  });
  const archive = useMutation({
    mutationFn: archiveThread,
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries({ queryKey: ["threads"] });
      if (pathname === `/console/chat/${id}`) await navigate({ to: "/console/chat" });
    },
    onError: (cause) => setError(errorMessage(cause, "Archive failed.")),
  });

  const note = "flex items-center gap-2 py-2 text-xs leading-relaxed text-faint";
  return (
    <aside
      aria-label="Threads"
      className="flex max-h-[45dvh] min-h-0 flex-col border-border bg-background-deep p-3.5 max-md:border-b md:max-h-none md:border-r"
    >
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Threads</Eyebrow>
        <Button render={<Link to="/console/chat" />} variant="outline" size="sm">
          <Plus /> New
        </Button>
      </div>
      <label className="relative mt-4 mb-3 block">
        <Search
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
        />
        <span className="sr-only">Search threads</span>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search threads"
          className="h-9 bg-background pl-8"
        />
      </label>
      {!session ? (
        <p className={note}>Sign in to keep your threads across apps.</p>
      ) : threads.isPending ? (
        <div role="status" aria-busy="true" className="grid gap-1 px-2 py-1">
          <span className="sr-only">Loading threads</span>
          {[72, 54, 64, 46].map((width) => (
            <div key={width} className="grid gap-1.5 px-2 py-2">
              <Skeleton className="h-3.5" style={{ width: `${width}%` }} />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
          ))}
        </div>
      ) : threads.isError ? (
        <p className={cn(note, "text-destructive")} role="alert">
          {errorMessage(threads.error, "Could not load threads.")}
        </p>
      ) : (threads.data?.items.length ?? 0) === 0 ? (
        <p className={note}>No chats yet. Start one with an agent from the store.</p>
      ) : (
        <nav
          aria-label="Your threads"
          className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-1"
        >
          {threads.data?.items.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              active={pathname === `/console/chat/${thread.id}`}
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
      {error && (
        <p className={cn(note, "text-destructive")} role="alert">
          {error}
        </p>
      )}
      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename thread</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (renaming) rename.mutate({ id: renaming.id, next: title });
            }}
          >
            <FormField label="Thread title" htmlFor="thread-title">
              <Input
                id="thread-title"
                value={title}
                maxLength={160}
                required
                onChange={(event) => setTitle(event.target.value)}
              />
            </FormField>
            <div className="flex gap-2">
              <Button type="submit" disabled={rename.isPending || !title.trim()}>
                {rename.isPending && <Spinner />}
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
