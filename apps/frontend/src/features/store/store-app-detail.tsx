import { usePageMeta } from "@/src/app/head";
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, MessageSquareText, Star } from "lucide-react";
import { BlurFade } from "@/src/components/ui/blur-fade";
import { Button } from "@/src/components/ui/button";
import { Spinner } from "@/src/components/ui/spinner";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import { CommandCard } from "@/src/features/apps/command-card";
import { OwnerLink, RatingLine, UsageLine } from "@/src/features/apps/agent-facts";
import { AgentRatings } from "@/src/features/store/agent-ratings";
import {
  AppStatus,
  BackLink,
  EmptyState,
  ErrorNotice,
  PageSkeleton,
  PageHeader,
  PageShell,
  SectionHeader,
  Tag,
  errorMessage,
  plural,
} from "@/src/components/layout/page-kit";
import { WalletAccess } from "@/src/features/auth/wallet-access";
import { authClient } from "@/src/features/auth/auth-client";
import { getStoreApp, getStars, starApp, unstarApp } from "@/src/features/apps/api";
import { formatCommandPrice, formatLatePolicy, formatUsdc } from "@/src/features/apps/format";
import { formatDuration } from "@/src/features/payments/payment-confirm";

export function StoreAppDetail({ appId }: { appId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const detail = useQuery({
    queryKey: ["store", "app", appId],
    queryFn: () => getStoreApp(appId),
    staleTime: 15_000,
  });
  usePageMeta({
    title: detail.data?.name ?? "Agent",
    description: detail.data?.description ?? undefined,
  });
  const stars = useQuery({
    queryKey: ["stars", session?.user.id],
    queryFn: getStars,
    enabled: Boolean(session),
    staleTime: 15_000,
  });
  const starred = Boolean(stars.data?.some((item) => item.id === appId));
  const save = useMutation({
    mutationFn: () => (starred ? unstarApp(appId) : starApp(appId)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["stars"] }),
    onError: (cause) => setError(errorMessage(cause, "Could not save.")),
  });

  // Every app is used from a chat. The thread is created on the first message.
  async function open() {
    if (!session) return;
    setError("");
    setOpening(true);
    try {
      await navigate({ to: "/console/chat/new/$appId", params: { appId } });
    } finally {
      setOpening(false);
    }
  }

  if (detail.isPending)
    return (
      <PageShell>
        <PageSkeleton label="Loading agent" />
      </PageShell>
    );
  if (detail.isError || !detail.data)
    return (
      <PageShell className="pt-16">
        <ErrorNotice>{errorMessage(detail.error, "App not found.")}</ErrorNotice>
        <Button render={<Link to="/store" />} variant="outline">
          Back to store
        </Button>
      </PageShell>
    );
  const app = detail.data;
  const offline = app.availability !== "AVAILABLE";
  const suspended = app.availability === "SUSPENDED";

  return (
    <PageShell>
      <BackLink to="/store">Store</BackLink>
      <PageHeader
        className="pt-8 lg:pt-10"
        eyebrow={`${app.visibility === "PRIVATE" ? "Private" : "Public"} agent`}
        title={
          <span className="flex items-center gap-5">
            <AgentAvatar
              name={app.name}
              imageUrl={app.imageUrl}
              className="size-16 shrink-0 text-2xl"
            />
            <span className="min-w-0">{app.name}</span>
          </span>
        }
        description={
          <>
            <span className="line-clamp-3">{app.description || "No description yet."}</span>
            <span className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <OwnerLink owner={app.owner} className="text-sm" />
              <RatingLine rating={app.rating} />
              <UsageLine jobs={app.jobs} users={app.users} />
            </span>
            <span className="mt-4 flex flex-wrap gap-2">
              <AppStatus availability={app.availability} />
              <Tag>
                {app.priceCap ? `Offers up to ${formatUsdc(app.priceCap)}` : "Priced by offer"}
              </Tag>
              <Tag>{app.visibility === "PUBLIC" ? "Public" : "Private"}</Tag>
              <Tag>{plural(app.commands.length, "command")}</Tag>
            </span>
          </>
        }
        actions={
          <aside className="grid w-full gap-3 border border-border bg-card p-5 lg:w-80">
            <Button size="lg" disabled={opening || offline || !session} onClick={() => void open()}>
              {opening ? <Spinner /> : <MessageSquareText />}
              {suspended
                ? "App suspended"
                : offline
                  ? "App offline"
                  : !session
                    ? "Sign in to use this app"
                    : "Start a chat"}
            </Button>
            {!session && <WalletAccess variant="secondary" />}
            <Button
              variant="outline"
              size="lg"
              disabled={!session || save.isPending}
              onClick={() => save.mutate()}
            >
              <Star fill={starred ? "currentColor" : "none"} /> {starred ? "Saved" : "Save app"}
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {suspended
                ? "Suspended by its owner. Old threads stay readable."
                : offline
                  ? "Not responding, so new jobs are paused."
                  : "Chat is free. You pay only after you accept an offer."}
            </p>
          </aside>
        }
      />

      {error && <ErrorNotice>{error}</ErrorNotice>}

      <section aria-labelledby="commands-title" className="mt-14">
        <SectionHeader
          id="commands-title"
          eyebrow="Slash commands"
          title="What this agent can do"
          aside="Type / in the chat to run one."
        />
        {app.commands.length === 0 ? (
          <EmptyState title="No commands yet.">
            No active command yet, so it can't quote a price.
          </EmptyState>
        ) : (
          <div className="grid gap-3">
            {app.commands.map((command, index) => (
              <BlurFade key={command.id} inView delay={Math.min(index, 6) * 0.04}>
                <CommandCard
                  name={command.name}
                  description={command.description}
                  isDefault={command.id === app.defaultCommandId}
                  revision={command.revision}
                  terms={
                    command.revision && [
                      formatCommandPrice(command.revision),
                      `delivery ≤ ${formatDuration(command.revision.deliverySeconds)}`,
                      `review ${formatDuration(command.revision.reviewSeconds)}`,
                      formatLatePolicy(command.revision.terms) ?? "late: full refund",
                    ]
                  }
                />
              </BlurFade>
            ))}
          </div>
        )}
      </section>

      <AgentRatings appId={app.id} />

      <section className="mt-14 flex flex-col justify-between gap-4 border-t border-border pt-8 sm:flex-row sm:items-center">
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Your chats and payments live in your console.
        </p>
        <Link
          to="/console"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          Open console <ArrowUpRight size={15} />
        </Link>
      </section>
    </PageShell>
  );
}
