import { usePageMeta } from "@/src/app/head";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { BlurFade } from "@/src/components/ui/blur-fade";
import { Button } from "@/src/components/ui/button";
import {
  BackLink,
  CardGridSkeleton,
  EmptyState,
  ErrorNotice,
  PageShell,
  PageSkeleton,
  SectionHeader,
  errorMessage,
  plural,
} from "@/src/components/layout/page-kit";
import { authClient } from "@/src/features/auth/auth-client";
import { getStars } from "@/src/features/apps/api";
import { PersonAvatar, Stars } from "@/src/features/apps/agent-facts";
import { getDeveloper } from "@/src/features/people/api";
import { FigureStrip } from "@/src/features/stats/earnings";
import { AppCard } from "@/src/features/store/store-directory";

const joined = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { month: "long", year: "numeric" });

// A builder's public page: who they are, how their agents are used and
// rated, and every public agent they share.
export function DeveloperPage({ userId }: { userId: string }) {
  const { data: session } = authClient.useSession();
  const developer = useQuery({
    queryKey: ["developer", userId],
    queryFn: () => getDeveloper(userId),
    staleTime: 20_000,
  });
  const stars = useQuery({
    queryKey: ["stars", session?.user.id],
    queryFn: getStars,
    enabled: Boolean(session),
    staleTime: 20_000,
  });
  usePageMeta({
    title: developer.data?.name ?? "Developer",
    description: developer.data?.bio ?? undefined,
  });
  const saved = new Set((stars.data ?? []).map((item) => item.id));

  if (developer.isPending)
    return (
      <PageShell>
        <PageSkeleton label="Loading developer" />
        <CardGridSkeleton count={3} className="mt-10" />
      </PageShell>
    );
  if (developer.isError)
    return (
      <PageShell className="pt-16">
        <ErrorNotice>{errorMessage(developer.error, "Developer not found.")}</ErrorNotice>
        <Button render={<Link to="/store" />} variant="outline">
          Back to store
        </Button>
      </PageShell>
    );
  const person = developer.data;
  const own = session?.user.id === person.id;

  return (
    <PageShell>
      <BackLink to="/store">Store</BackLink>
      <BlurFade>
        <header className="grid gap-6 border-b border-border pt-8 pb-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:pt-10">
          <div className="flex min-w-0 items-center gap-5">
            <PersonAvatar person={person} className="size-20 shrink-0 text-3xl sm:size-24" />
            <div className="grid min-w-0 gap-2">
              <p className="text-sm font-medium text-primary">Developer</p>
              <h1 className="text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-medium tracking-[-0.05em] break-words">
                {person.name}
              </h1>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {person.address && <span className="font-mono text-xs">{person.address}</span>}
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={14} aria-hidden="true" /> Joined {joined(person.joinedAt)}
                </span>
              </p>
            </div>
          </div>
          {own && (
            <Button variant="outline" render={<Link to="/console/profile" />}>
              Edit profile
            </Button>
          )}
          {person.bio && (
            <p className="max-w-2xl text-base leading-7 text-pretty text-muted-foreground lg:col-span-2">
              {person.bio}
            </p>
          )}
        </header>
      </BlurFade>

      <BlurFade delay={0.08} className="mt-8">
        <FigureStrip
          figures={[
            { label: "Public agents", value: person.totals.apps },
            { label: "Paid jobs", value: person.totals.jobs },
            { label: "People served", value: person.totals.users },
            {
              label: "Average rating",
              value: person.totals.rating ?? 0,
              decimals: 1,
              note: person.totals.ratings
                ? plural(person.totals.ratings, "rating")
                : "No ratings yet",
            },
          ]}
        />
        {person.totals.rating !== null && (
          <Stars value={person.totals.rating} size={16} className="mt-3" />
        )}
      </BlurFade>

      <section aria-labelledby="developer-agents" className="mt-14">
        <SectionHeader
          id="developer-agents"
          title={`Agents by ${person.name}`}
          aside={plural(person.apps.length, "agent")}
        />
        {person.apps.length === 0 ? (
          <EmptyState title="No public agents yet.">
            {own
              ? "Make one of your agents public in Studio and it shows up here."
              : "This developer hasn't shared a public agent yet."}
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {person.apps.map((app, index) => (
              <BlurFade key={app.id} inView delay={Math.min(index, 8) * 0.04}>
                <AppCard
                  app={app}
                  starred={saved.has(app.id)}
                  canSave={Boolean(session)}
                  showOwner={false}
                />
              </BlurFade>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}
