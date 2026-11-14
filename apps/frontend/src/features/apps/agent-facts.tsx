import { Link } from "@tanstack/react-router";
import { BriefcaseBusiness, CircleCheck, Clock, Sparkles, UsersRound } from "lucide-react";
import { Rating, RatingButton } from "@/src/components/ui/rating";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import { formatDuration } from "@/src/features/apps/format";
import { cn } from "@/src/lib/utils";

type Person = { id: string; name: string; imageUrl: string | null };

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
export const count = (value: number) => compact.format(value);

/** Five read-only stars for an average, rounded to the nearest star. */
export function Stars({
  value,
  size = 14,
  className,
}: {
  value: number | null;
  size?: number;
  className?: string;
}) {
  return (
    <Rating
      readOnly
      value={Math.round(value ?? 0)}
      aria-label={value === null ? "Not rated yet" : `Rated ${value} out of 5`}
      className={cn("gap-0 text-primary *:p-0", className)}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <RatingButton
          key={index}
          size={size}
          className="text-primary/30 data-active:text-primary"
        />
      ))}
    </Rating>
  );
}

/** Stars, the average and how many ratings it comes from. */
export function RatingLine({
  rating,
  className,
}: {
  rating: { average: number | null; count: number };
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <Stars value={rating.average} size={13} />
      {rating.count ? (
        <>
          <span className="font-medium text-foreground tabular-nums">
            {rating.average?.toFixed(1)}
          </span>
          <span className="text-muted-foreground tabular-nums">({count(rating.count)})</span>
        </>
      ) : (
        <span className="text-muted-foreground">No ratings yet</span>
      )}
    </span>
  );
}

/** Paid jobs and distinct buyers, small and side by side. */
export function UsageLine({
  jobs,
  users,
  className,
}: {
  jobs: number;
  users: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3 text-xs text-muted-foreground", className)}>
      <span className="inline-flex items-center gap-1" title="Paid jobs">
        <BriefcaseBusiness size={13} aria-hidden="true" />
        <span className="tabular-nums">{count(jobs)}</span>
        <span className="sr-only">paid jobs</span>
      </span>
      <span className="inline-flex items-center gap-1" title="People who chatted with it">
        <UsersRound size={13} aria-hidden="true" />
        <span className="tabular-nums">{count(users)}</span>
        <span className="sr-only">users</span>
      </span>
    </span>
  );
}

/** An agent's public track record, as the API computes it from escrow outcomes. */
export type Reputation = {
  paidJobs: number;
  sample: number;
  successRate: number | null;
  onTimeRate: number | null;
  refundRate: number | null;
  medianDeliverySeconds: number | null;
  isNew: boolean;
};

/** Marks an agent with few paid jobs, so a buyer knows there is little to go on. */
export function NewAgentBadge({ className }: { className?: string }) {
  return (
    <span
      title="Fewer than 3 paid jobs. Assistants ask you before paying it more than 1 USDC."
      className={cn(
        "inline-flex items-center gap-1 border border-border-strong px-1.5 py-0.5 font-mono text-[11px] text-foreground",
        className,
      )}
    >
      <Sparkles size={11} aria-hidden="true" />
      New agent
    </span>
  );
}

/** Success and on-time rates in one short line, or why there are none yet. */
export function ReputationLine({
  reputation,
  className,
}: {
  reputation: Reputation;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3 text-xs text-muted-foreground", className)}>
      {reputation.isNew && <NewAgentBadge />}
      {reputation.successRate === null || reputation.onTimeRate === null ? (
        !reputation.isNew && <span>Not enough jobs yet</span>
      ) : (
        <>
          <span className="inline-flex items-center gap-1" title="Jobs paid out to the builder">
            <CircleCheck size={13} aria-hidden="true" />
            <span className="tabular-nums text-foreground">{reputation.successRate}%</span>
            <span>success</span>
          </span>
          <span
            className="inline-flex items-center gap-1"
            title="Results delivered before the deadline"
          >
            <Clock size={13} aria-hidden="true" />
            <span className="tabular-nums text-foreground">{reputation.onTimeRate}%</span>
            <span>on time</span>
          </span>
        </>
      )}
    </span>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="grid gap-0.5 border border-border bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xl tabular-nums text-foreground">{value}</dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}

/** The full track record: four facts over the agent's recent closed jobs. */
export function TrackRecord({ reputation }: { reputation: Reputation }) {
  if (reputation.successRate === null)
    return (
      <p className="text-sm text-muted-foreground">
        {reputation.paidJobs === 0
          ? "No paid jobs yet."
          : `${reputation.sample} of ${reputation.paidJobs} paid jobs have settled so far. Rates show after 5.`}{" "}
        Payments stay in escrow until delivery either way.
      </p>
    );
  const over = `last ${reputation.sample} jobs`;
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Fact label="Success" value={`${reputation.successRate}%`} note={`paid out, ${over}`} />
      <Fact
        label="On time"
        value={`${reputation.onTimeRate}%`}
        note="first result before deadline"
      />
      <Fact label="Refunded" value={`${reputation.refundRate}%`} note={over} />
      <Fact
        label="Typical delivery"
        value={
          reputation.medianDeliverySeconds === null
            ? "—"
            : formatDuration(reputation.medianDeliverySeconds)
        }
        note="median, payment to result"
      />
    </dl>
  );
}

/** A person's picture, or their initial on a jade tint. */
export function PersonAvatar({ person, className }: { person: Person; className?: string }) {
  // Wallet-address names start with 0x; their initial says nothing.
  const name = person.name.startsWith("0x") ? person.name.slice(2) : person.name;
  return (
    <AgentAvatar
      name={name}
      imageUrl={person.imageUrl}
      className={cn("size-6 text-xs", className)}
    />
  );
}

/** "by <name>", linking to the developer's page. Sits above a card's link layer. */
export function OwnerLink({ owner, className }: { owner: Person; className?: string }) {
  return (
    <Link
      to="/developers/$userId"
      params={{ userId: owner.id }}
      className={cn(
        "relative z-10 inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      <PersonAvatar person={owner} className="size-5 text-[10px]" />
      <span className="truncate">
        by <span className="font-medium text-foreground">{owner.name}</span>
      </span>
    </Link>
  );
}
