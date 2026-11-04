import { memo, useState, type ReactNode } from "react";
import { NetworkAvalancheFuji } from "@web3icons/react";
import { Check, FileText, Search } from "lucide-react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { AgentPlan } from "@/src/components/assistant-ui/elements/agent-plan";
import { ElicitationForm } from "@/src/components/assistant-ui/elements/elicitation-form";
import { AppStatus } from "@/src/components/layout/page-kit";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import { CommandCard } from "@/src/features/apps/command-card";
import { QuoteCard } from "@/src/features/chat/quote-card";
import {
  Enter,
  Rise,
  Scene,
  Wordmark,
  clamp,
  quietBadge,
  typed,
} from "@/src/features/landing/film/kit";
import {
  activity,
  agents,
  analyzeRevision,
  chain,
  chapters,
  commands,
  file,
  goal,
  offer,
  plan,
  query,
  regionRows,
} from "@/src/features/landing/film/mock";
import { cn } from "@/src/lib/utils";

// The overview film: one CSV Analyst job on Payvoke, from the store to the
// payout. Each scene is also exported, so feature films can reuse it.
//
// Performance: a scene re-renders on every frame, so anything that does not
// change with the frame (tables, cards, charts) is a memoized component with
// stable props, and React skips it.

function Intro() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      className="grid content-center gap-6 px-14"
      style={{ opacity: interpolate(frame, [80, 90], [1, 0], clamp) }}
    >
      <Enter>
        <Wordmark className="text-[28px]" />
      </Enter>
      <h3 className="max-w-[780px] text-[76px] leading-[0.96] font-semibold tracking-[-0.055em]">
        <Rise delay={6}>From the store</Rise>
        <Rise delay={10}>to the payout</Rise>
      </h3>
      <Enter delay={26}>
        <p className="flex items-center gap-2.5 text-[20px] text-muted-foreground">
          <NetworkAvalancheFuji size={22} aria-hidden="true" />
          One job on Payvoke, settled on Avalanche.
        </p>
      </Enter>
    </AbsoluteFill>
  );
}

const StoreRow = memo(function StoreRow({
  agent,
  shown,
  chosen,
}: {
  agent: (typeof agents)[number];
  shown: boolean;
  chosen: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 overflow-hidden bg-background-deep px-3",
        chosen && "bg-secondary ring-2 ring-primary",
      )}
      style={{ height: shown ? 64 : 0, opacity: shown ? 1 : 0, marginBottom: shown ? 0 : -8 }}
    >
      <AgentAvatar name={agent.name} className="size-9 text-base" />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="font-medium">{agent.name}</span>
        <span className="truncate text-[13px] text-muted-foreground">{agent.description}</span>
      </span>
      <AppStatus availability="AVAILABLE" className={quietBadge} />
    </div>
  );
});

export function Store() {
  const frame = useCurrentFrame();
  const text = typed(query, frame, 14, 0.25);
  const filtering = text.length >= 3;
  const picked = frame > 92;
  return (
    <Scene title="Find an agent" line="Search the store by name or by the job you need done.">
      <Card data-ui className="gap-3 p-4">
        <div className="relative">
          <Search
            size={15}
            aria-hidden="true"
            className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input readOnly value={text} aria-label="Search agents" className="pl-9" />
        </div>
        <div className="grid gap-2">
          {agents.map((agent) => (
            <StoreRow
              key={agent.name}
              agent={agent}
              shown={
                !filtering ||
                `${agent.name} ${agent.description}`.toLowerCase().includes(text) ||
                agent.commands.some((name) => name.includes(text))
              }
              chosen={picked && agent.name === "CSV Analyst"}
            />
          ))}
        </div>
      </Card>
    </Scene>
  );
}

const commandTerms = ["Up to $2.00", "Delivery 10 min", "Review 30 min", "1 revision"].map(
  (term) => (
    <span key={term} className="font-sans text-[13px] tracking-normal">
      {term}
    </span>
  ),
);

const AnalyzeCard = memo(function AnalyzeCard() {
  return (
    <CommandCard
      name="analyze"
      description="Charts, outliers and a written analysis of a CSV file. Ask a question to focus it."
      isDefault={false}
      revision={analyzeRevision}
      terms={commandTerms}
    />
  );
});

export function Command() {
  const frame = useCurrentFrame();
  const text = typed("/analyze", frame, 10, 0.45);
  return (
    <Scene
      title="Type a command"
      line="Each slash command says what the agent does, what it needs and its terms."
    >
      <div className="grid gap-3">
        <Card data-ui className="gap-2 p-3">
          <div className="grid">
            {commands.map(([name, description]) => (
              <div
                key={name}
                className={cn(
                  "grid px-3 py-1.5",
                  name === "analyze" && text.length > 2 && "bg-secondary",
                )}
                style={{ opacity: `/${name}`.startsWith(text || "/") ? 1 : 0.3 }}
              >
                <code className="font-mono text-primary">/{name}</code>
                <span className="text-[13px] text-muted-foreground">{description}</span>
              </div>
            ))}
          </div>
          {/* The composer holds a literal slash command. taste-skill-ignore */}
          <Input
            readOnly
            value={text}
            aria-label="Message"
            className="border-primary font-mono" // taste-skill-ignore
          />
        </Card>
        {frame > 44 && (
          <Enter delay={46}>
            <AnalyzeCard />
          </Enter>
        )}
      </div>
    </Scene>
  );
}

const depths = ["Quick, $0.50", "Deep, $1.00"];

const DepthForm = memo(function DepthForm({ deep, sent }: { deep: boolean; sent: boolean }) {
  return (
    <ElicitationForm
      server="CSV Analyst"
      message="Quick gives key metrics and 2 charts. Deep adds 5 charts, outliers and a longer analysis."
      className="max-w-none"
      state={sent ? "accepted" : "request"}
      acceptedLabel="Sent to CSV Analyst"
      fields={[
        { name: "file", label: "File", kind: "text", value: `${file.name} · ${file.rows}` },
        { name: "goal", label: "Goal", kind: "text", value: goal },
        {
          name: "depth",
          label: "Depth",
          kind: "choice",
          options: depths,
          value: deep ? depths[1] : depths[0],
        },
      ]}
    />
  );
});

const Ask = memo(function Ask() {
  return (
    <div className="ml-auto grid max-w-[88%] gap-1.5 bg-secondary px-3.5 py-2.5">
      <span>
        <code className="font-mono text-primary">/analyze</code> {goal}
      </span>
      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <FileText size={14} aria-hidden="true" /> {file.name} · {file.size}
      </span>
    </div>
  );
});

export function Form() {
  const frame = useCurrentFrame();
  return (
    <Scene
      title="Answer a form"
      line="Before any payment, the agent can ask for details with a form or a choice."
    >
      <div className="grid gap-3">
        <Ask />
        <DepthForm deep={frame > 46} sent={frame > 100} />
      </div>
    </Scene>
  );
}

const offerTerms = [
  { label: "Delivery", value: "10 min" },
  { label: "Review", value: "30 min" },
  { label: "Revisions", value: "1 included" },
];
const noop = () => {};

const OfferCard = memo(function OfferCard({
  expiresAt,
  open,
  busy,
}: {
  expiresAt: string;
  open: boolean;
  busy: boolean;
}) {
  return (
    <QuoteCard
      command="analyze"
      amount="0"
      amountLabel={offer.price}
      summary={offer.summary}
      terms={offerTerms}
      refund={offer.refund}
      expiresAt={expiresAt}
      open={open}
      closedLabel="Accepted. Locking the payment on Avalanche."
      closedTone="done"
      busy={busy ? "accept" : null}
      onAccept={noop}
      onDecline={noop}
    />
  );
});

// QuoteCard counts down against the real clock, so the offer opens fifteen
// minutes from whenever the film is mounted.
export function Offer() {
  const frame = useCurrentFrame();
  const [expiresAt] = useState(() => new Date(Date.now() + 15 * 60_000).toISOString());
  return (
    <Scene
      title="Accept the offer"
      line="Price, deadline, review window and refund terms are fixed before you pay."
    >
      <OfferCard expiresAt={expiresAt} open={frame <= 96} busy={frame > 70 && frame <= 96} />
    </Scene>
  );
}

const STAGES = ["Accepted", "Held in vault", "Working", "Verifying", "Delivered"];

/** The job card's five-step bar, filled to `index`. */
function StageBar({ index }: { index: number }) {
  return (
    <div className="grid grid-cols-5 gap-1">
      {STAGES.map((name, i) => (
        <span
          key={name}
          className={cn(
            "h-1",
            i < index ? "bg-primary" : i === index ? "bg-primary/45" : "bg-border-strong/60",
          )}
        />
      ))}
    </div>
  );
}

const VaultCard = memo(function VaultCard({
  block,
  finality,
  finalized,
}: {
  block: number;
  finality: string;
  finalized: boolean;
}) {
  return (
    <Card data-ui className="gap-0 py-0">
      <CardHeader className="grid-cols-[auto_1fr_auto] items-center gap-3 bg-background-deep py-3">
        <NetworkAvalancheFuji size={28} aria-hidden="true" />
        <CardTitle>PayvokeVault</CardTitle>
        <Badge variant={finalized ? "default" : "secondary"} className={quietBadge}>
          {finalized ? "Finalized" : "Pending"}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3 py-4">
        <dl className="grid grid-cols-3 gap-3">
          {(
            [
              ["Held", offer.price],
              ["Block", `#${block.toLocaleString("en-US")}`],
              ["Finality", finality],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="grid gap-0.5">
              <dt className="text-[13px] text-muted-foreground">{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <StageBar index={finalized ? 2 : 1} />
        <p className="flex flex-wrap justify-between gap-2 text-[13px] text-muted-foreground">
          <span>{finalized ? "Stage 3 of 5 · Working" : "Stage 2 of 5 · Held in vault"}</span>
          <code className="font-mono">{chain.tx}</code>
        </p>
      </CardContent>
    </Card>
  );
});

export function Hold() {
  const frame = useCurrentFrame();
  const finalized = frame > 62;
  return (
    <Scene
      title="Locked on Avalanche"
      line="The vault holds the payment on a finalized block before any work starts."
    >
      <div className="grid gap-3">
        <VaultCard
          block={chain.block + Math.floor(interpolate(frame, [0, 140], [0, 5], clamp))}
          finality={`${interpolate(frame, [20, 62], [0, 1.4], clamp).toFixed(1)} s`}
          finalized={finalized}
        />
        {finalized && (
          <Enter delay={66}>
            <p className="flex items-center gap-2 bg-primary-soft px-3 py-2 text-[13px]">
              <Check size={14} className="text-primary" aria-hidden="true" />
              CSV Analyst receives <code className="font-mono">invocation.ready</code> and starts
            </p>
          </Enter>
        )}
      </div>
    </Scene>
  );
}

const RegionTable = memo(function RegionTable() {
  return (
    <div className="grid gap-2">
      <Table className="text-[13px]">
        <TableHeader>
          <TableRow>
            <TableHead>Region</TableHead>
            <TableHead className="text-right">Q2</TableHead>
            <TableHead className="text-right">Q3</TableHead>
            <TableHead className="text-right">Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">
          {regionRows.map(([region, q2, q3, delta]) => (
            <TableRow key={region}>
              <TableCell>{region}</TableCell>
              <TableCell className="text-right">{q2}</TableCell>
              <TableCell className="text-right">{q3}</TableCell>
              <TableCell className={cn("text-right", delta.startsWith("−") && "text-warning")}>
                {delta}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <FileText size={14} aria-hidden="true" /> analysis.json · summary.csv
      </p>
    </div>
  );
});

const Plan = memo(function Plan({ step }: { step: number }) {
  return (
    <AgentPlan
      steps={plan}
      activeIndex={step}
      title="CSV Analyst is working"
      className="max-w-none"
    />
  );
});

export function Work() {
  const frame = useCurrentFrame();
  const step = Math.floor(interpolate(frame, [6, 100], [0, plan.length], clamp));
  return (
    <Scene
      title="Watch it work"
      line="Progress, the dashboard and the files stream into the same thread."
    >
      <Card data-ui className="gap-4 p-4">
        <Plan step={step} />
        {frame > 104 && (
          <Enter delay={104}>
            <RegionTable />
          </Enter>
        )}
      </Card>
    </Scene>
  );
}

const Activity = memo(function Activity({ released }: { released: boolean }) {
  return (
    <Card data-ui className="gap-2 p-3">
      {activity.map((row, index) => {
        const live = index === 0;
        const state = live && !released ? "Delivered" : row.state;
        return (
          <div
            key={`${row.command}-${index}`}
            className={cn(
              "grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 bg-background-deep px-3 py-2.5",
              live && "ring-2 ring-primary",
            )}
          >
            <span className="flex items-baseline gap-2">
              <code className="font-mono text-primary">{row.command}</code>
              <span className="tabular-nums">{row.price}</span>
            </span>
            <Badge
              variant={state === "Released" && live ? "default" : "secondary"}
              className={quietBadge}
            >
              {state}
            </Badge>
            <span className="text-[13px] text-muted-foreground">
              {live && !released ? "Review ends in 30 min" : row.note}
            </span>
          </div>
        );
      })}
    </Card>
  );
});

const Close = memo(function Close() {
  return (
    <div className="flex items-center justify-between gap-3 bg-primary px-4 py-3 text-primary-foreground">
      <Wordmark className="text-[18px]" />
      <Button variant="secondary" size="sm">
        Browse the store
      </Button>
    </div>
  );
});

export function Settle() {
  const frame = useCurrentFrame();
  return (
    <Scene
      title="Paid on time"
      line="On-time work is paid after your review. A failed or late job is refunded in full."
    >
      <div className="grid gap-3">
        <Activity released={frame > 40} />
        <Enter delay={70}>
          <Close />
        </Enter>
      </div>
    </Scene>
  );
}

const scenes: Record<string, () => ReactNode> = {
  intro: Intro,
  store: Store,
  command: Command,
  form: Form,
  offer: Offer,
  hold: Hold,
  work: Work,
  settle: Settle,
};

/** A strip along the foot of the frame: one segment per chapter, filled as it plays. */
function ChapterStrip() {
  const frame = useCurrentFrame();
  return (
    <div className="absolute inset-x-14 bottom-7 grid grid-flow-col gap-1.5">
      {chapters.map((entry) => (
        <span key={entry.id} className="h-1 overflow-hidden bg-border-strong/40">
          <span
            className="block h-full origin-left bg-primary"
            style={{
              scale: `${interpolate(frame, [entry.from, entry.from + entry.duration], [0, 1], clamp)} 1`,
            }}
          />
        </span>
      ))}
    </div>
  );
}

export function PayvokeFilm() {
  return (
    <AbsoluteFill
      data-mode="dark"
      className="bg-background-deep font-sans text-foreground antialiased"
    >
      {chapters.map((entry) => {
        const Body = scenes[entry.id];
        return (
          <Sequence
            key={entry.id}
            name={entry.label}
            from={entry.from}
            durationInFrames={entry.duration}
          >
            <Body />
          </Sequence>
        );
      })}
      <ChapterStrip />
    </AbsoluteFill>
  );
}
