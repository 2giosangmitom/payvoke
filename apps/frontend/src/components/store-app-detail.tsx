import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, MessageSquareText, Play, Star } from "lucide-react";
import { BlurFade } from "./ui/blur-fade";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { CommandCard } from "./command-card";
import {
  AppStatus,
  BackLink,
  EmptyState,
  ErrorNotice,
  LoadingState,
  PageHeader,
  PageShell,
  SectionHeader,
  Tag,
  errorMessage,
  plural,
} from "./page-kit";
import { WalletAccess } from "./wallet-access";
import { authClient } from "@/src/lib/auth-client";
import { formatCommandPrice, getStoreApp, getStars, starApp, unstarApp } from "@/src/lib/apps";
import { formatDuration } from "./payment-confirm";
import { newThread } from "@/src/lib/paid-chat";

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

  // Agents open a chat; tools open their form.
  async function open() {
    if (!session) return;
    if (detail.data?.kind === "TOOL") {
      await navigate({ to: "/console/run/$appId", params: { appId } });
      return;
    }
    setError("");
    setOpening(true);
    try {
      const thread = await newThread(appId);
      await navigate({ to: "/console/chat/$threadId", params: { threadId: thread.id } });
    } catch (cause) {
      setError(errorMessage(cause, "Could not open a thread."));
    } finally {
      setOpening(false);
    }
  }

  if (detail.isPending)
    return (
      <PageShell>
        <LoadingState className="pt-20">Loading app…</LoadingState>
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
  const agent = app.kind === "AGENT";

  return (
    <PageShell>
      <BackLink to="/store">Store</BackLink>
      <PageHeader
        className="pt-8 lg:pt-10"
        eyebrow={`${app.visibility === "PRIVATE" ? "Private" : "Public"} ${agent ? "agent" : "tool"} / ${app.id.slice(0, 8)}`}
        title={app.name}
        description={
          <>
            {app.description || "No description yet."}
            <span className="mt-5 flex flex-wrap gap-2">
              <AppStatus availability={app.availability} />
              <Tag>{agent ? "Agent" : "Tool"}</Tag>
              <Tag>{app.visibility === "PUBLIC" ? "Public" : "Private"}</Tag>
              <Tag>{plural(app.commands.length, "slash command")}</Tag>
            </span>
          </>
        }
        actions={
          <aside className="grid w-full gap-3 border border-border bg-card p-5 lg:w-80">
            <Button size="lg" disabled={opening || offline || !session} onClick={() => void open()}>
              {opening ? <Spinner /> : agent ? <MessageSquareText /> : <Play />}
              {suspended
                ? "App suspended"
                : offline
                  ? "App offline"
                  : !session
                    ? "Sign in to use this app"
                    : agent
                      ? "Start a chat"
                      : "Run the tool"}
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
                ? "The owner has suspended this app. Old threads stay readable, but it can't take new requests."
                : offline
                  ? "The app's worker isn't responding, so new requests are paused. Old threads stay readable."
                  : agent
                    ? "Chatting is free. The agent sends an offer with a price; nothing is charged unless you accept and approve it."
                    : "You fill in a form and see a quote first. Nothing is charged until you approve it."}
            </p>
          </aside>
        }
      />

      {error && <ErrorNotice>{error}</ErrorNotice>}

      <section aria-labelledby="commands-title" className="mt-14">
        <SectionHeader
          id="commands-title"
          eyebrow="Slash commands"
          title="What this app can do"
          aside={agent ? "Commands describe the jobs the agent quotes." : "Each runs from a form."}
        />
        {app.commands.length === 0 ? (
          <EmptyState title="No commands yet.">
            This app has no active command, so it can't quote a price yet.
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
                      agent
                        ? `offers ${formatCommandPrice(command.revision)}`
                        : formatCommandPrice(command.revision),
                      `delivery ≤ ${formatDuration(command.revision.deliverySeconds)}`,
                      `review ${formatDuration(command.revision.reviewSeconds)}`,
                    ]
                  }
                />
              </BlurFade>
            ))}
          </div>
        )}
      </section>

      <section className="mt-14 flex flex-col justify-between gap-4 border-t border-border pt-8 sm:flex-row sm:items-center">
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Chats, tool runs and every held payment live in your console, whatever app they belong to.
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
