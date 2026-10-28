import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Blocks, MessagesSquare, Store } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { ActivityLink, StageBadge } from "@/src/features/activity/activity-page";
import {
  EmptyState,
  ErrorNotice,
  LoadingState,
  PageHeader,
  PageShell,
  SectionHeader,
  errorMessage,
} from "@/src/components/layout/page-kit";
import { authClient } from "@/src/features/auth/auth-client";
import { stageOf } from "@/src/features/activity/activity";
import { formatUsdc } from "@/src/features/apps/format";
import { getThreads } from "@/src/features/chat/api";
import { getActivity } from "@/src/features/activity/api";

// Starts with what needs the buyer: results to review, overdue work and holds
// they can reclaim. Statistics are deliberately absent.
export function ConsoleHome() {
  const { data: session } = authClient.useSession();
  const activity = useQuery({
    queryKey: ["account", session?.user.id, "activity", "first"],
    queryFn: () => getActivity(),
    refetchInterval: 15_000,
  });
  const chats = useQuery({
    queryKey: ["threads", session?.user.id, ""],
    queryFn: () => getThreads(""),
    staleTime: 10_000,
  });
  const attention = (activity.data?.items ?? [])
    .map((item) => ({ item, stage: stageOf(item) }))
    .filter(({ stage }) => stage.tone === "attention" || stage.tone === "failed");
  const running = (activity.data?.items ?? [])
    .map((item) => ({ item, stage: stageOf(item) }))
    .filter(({ stage }) => stage.tone === "active");

  return (
    <PageShell className="pt-10">
      <PageHeader
        eyebrow="Console"
        title="Your work in one place"
        description="Hire agents and chat with them, follow every held payment and manage the agents you share."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button render={<Link to="/console/chat" />}>
              <MessagesSquare /> New chat
            </Button>
            <Button variant="outline" render={<Link to="/store" />}>
              <Store /> Find a tool
            </Button>
            <Button variant="outline" render={<Link to="/console/studio" />}>
              <Blocks /> Studio
            </Button>
          </div>
        }
      />

      <section aria-labelledby="attention-title" className="mt-12">
        <SectionHeader id="attention-title" eyebrow="To do" title="Needs your attention" />
        {activity.isPending ? (
          <LoadingState>Loading payments…</LoadingState>
        ) : activity.isError ? (
          <ErrorNotice onRetry={() => void activity.refetch()}>
            {errorMessage(activity.error, "Could not load payments.")}
          </ErrorNotice>
        ) : attention.length === 0 ? (
          <p className="border-t border-border py-6 text-sm text-muted-foreground">
            Nothing waits for you. Results to review, questions and reclaimable holds appear here.
          </p>
        ) : (
          <ul className="grid border-t border-border">
            {attention.map(({ item, stage }) => (
              <li
                key={item.invocationId}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4"
              >
                <div className="min-w-0">
                  <ActivityLink item={item}>
                    <strong className="font-medium break-words">{item.app.name}</strong>
                  </ActivityLink>
                  <p className="text-xs text-muted-foreground">{stage.detail}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs">{formatUsdc(item.grossAmount)}</span>
                  <StageBadge stage={stage} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-12 grid gap-12 lg:grid-cols-2">
        <section aria-labelledby="running-title">
          <SectionHeader
            id="running-title"
            eyebrow="In progress"
            title="Running now"
            aside={
              <Link to="/console/activity" className="hover:text-primary">
                All activity
              </Link>
            }
          />
          {running.length === 0 ? (
            <p className="border-t border-border py-6 text-sm text-muted-foreground">
              No paid request is running.
            </p>
          ) : (
            <ul className="grid border-t border-border">
              {running.slice(0, 6).map(({ item, stage }) => (
                <li
                  key={item.invocationId}
                  className="flex items-center justify-between gap-3 border-b border-border py-3"
                >
                  <ActivityLink item={item}>
                    <span className="text-sm">{item.app.name}</span>
                  </ActivityLink>
                  <span className="font-mono text-[11px] text-faint">{stage.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="chats-title">
          <SectionHeader
            id="chats-title"
            eyebrow="Agents"
            title="Recent chats"
            aside={
              <Link to="/console/chat" className="hover:text-primary">
                All chats
              </Link>
            }
          />
          {chats.isPending ? (
            <LoadingState>Loading chats…</LoadingState>
          ) : (chats.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              eyebrow="No chats yet"
              title="Talk to an agent."
              action={<Button render={<Link to="/console/chat" />}>Start a chat</Button>}
            >
              Chatting is free; you pay only for an offer you accept.
            </EmptyState>
          ) : (
            <ul className="grid border-t border-border">
              {chats.data?.items.slice(0, 6).map((thread) => (
                <li key={thread.id} className="border-b border-border py-3">
                  <Link
                    to="/console/chat/$threadId"
                    params={{ threadId: thread.id }}
                    className="flex items-center justify-between gap-3 hover:text-primary"
                  >
                    <span className="truncate text-sm">{thread.title || thread.app.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-faint">
                      {new Date(thread.lastMessageAt).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}
