import { useState, type ComponentType, type ReactElement, type ReactNode } from "react";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import { useReducedMotion } from "motion/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, ChevronsRight } from "lucide-react";
import { NetworkAvalancheFuji } from "@web3icons/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Marquee } from "@/src/components/ui/marquee";
import { OrbitingCircles } from "@/src/components/ui/orbiting-circles";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useMediaQuery } from "@/src/hooks/use-media-query";
import { AgentMark, codingAgents } from "@/src/features/landing/coding-agents";
import {
  ChartMark,
  CoinMark,
  DeskBot,
  FormMark,
  JugglingBot,
  PlugMark,
} from "@/src/features/landing/doodles";
import { Hero } from "@/src/features/landing/landing-hero";
import { LandingMusic } from "@/src/features/landing/landing-music";
import { cn } from "@/src/lib/utils";

// Colour chapters: each section is one flat field. Copy lives in the arrays
// below; the sections are shadcn and Magic UI components on one grid.

export function LandingPage() {
  // Smooth scrolling for the landing only; reduced motion keeps the native scroll.
  const still = useReducedMotion();
  return (
    <main>
      {!still && <ReactLenis root options={{ lerp: 0.1, anchors: { offset: -64 } }} />}
      <Hero />
      <Jobs />
      <Features />
      <Stages />
      <Avalanche />
      <CodingAgents />
      <Roadmap />
      <Questions />
      <Start />
      <LandingMusic />
    </main>
  );
}

// Bands alternate light and dark down the page. Dark bands pin data-mode="dark";
// in dark mode the light bands lift to the card tone and the dark bands sink to
// the deepest one, so the rhythm survives either theme.
const lightBand = "bg-background dark:bg-card";
const darkBand = "bg-background dark:bg-background-deep";

// tailwind-merge drops a `leading-*` that comes before a `text-*` size, so the
// size goes first.
const title = (size: string) => cn(size, "font-semibold tracking-[-0.045em] leading-[0.98]");
const sectionTitle = title("text-[clamp(2.25rem,4.4vw,4rem)]");
const lead = "text-[18px] leading-[1.55]";

/** A section heading with its one supporting sentence. */
function Heading({
  id,
  children,
  text,
  className,
}: {
  id: string;
  children: string;
  text?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-8", className)}>
      <h2 id={id} className={cn(sectionTitle, "reveal lg:col-span-7")}>
        {children}
      </h2>
      {text && <p className={cn(lead, "reveal max-w-md lg:col-span-4 lg:col-start-9")}>{text}</p>}
    </div>
  );
}

function Points({ items }: { items: readonly string[] }) {
  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-[17px] leading-[1.5]">
          <Check size={18} className="mt-1 shrink-0 text-primary" aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

/* Kinds of job, scrolling past in two rows. */

const jobRows = [
  [
    ["/summarize", "a 40-page report"],
    ["/review", "a pull request"],
    ["/clean", "a messy CSV"],
    ["/research", "a market"],
    ["/translate", "product docs"],
  ],
  [
    ["/audit", "a smart contract"],
    ["/outline", "a talk"],
    ["/compare", "two contracts"],
    ["/transcribe", "a meeting"],
    ["/draft", "release notes"],
  ],
] as const;

function Jobs() {
  return (
    <section
      id="jobs"
      aria-labelledby="jobs-title"
      className="overflow-x-clip bg-primary py-24 text-primary-foreground lg:py-32"
    >
      <Heading id="jobs-title" className="container-page">
        An agent for every job
      </Heading>
      <div className="mt-14 grid gap-3">
        {jobRows.map((row, index) => (
          <Marquee key={index} reverse={index === 1} pauseOnHover className="p-0 [--duration:46s]">
            {row.map(([command, job]) => (
              <p
                key={command}
                className="flex items-baseline gap-3 bg-primary-hover px-6 py-5 text-[clamp(1.25rem,2vw,1.75rem)] tracking-[-0.02em] whitespace-nowrap"
              >
                <code className="font-mono font-medium">{command}</code>
                <span>{job}</span>
              </p>
            ))}
          </Marquee>
        ))}
      </div>
    </section>
  );
}

/* Features: two cards, what comes built in and how far it bends. */

type Column = {
  title: string;
  text: ReactNode;
  mark?: ComponentType<{ className?: string }>;
  link?: { label: string; render: ReactElement };
};

const builtIn: Column[] = [
  {
    title: "x402 with escrow",
    mark: CoinMark,
    text: "Plain x402 pays the seller up front, with no refund. Payvoke keeps the 402 flow, but the USDC waits in that job's escrow: released when your agent delivers, refunded when it fails.",
    link: {
      label: "How it works",
      render: <Link to="/docs/$section" params={{ section: "x402" }} />,
    },
  },
  {
    title: "MCP server",
    mark: PlugMark,
    text: "Claude Code, Codex and any other MCP host can search the store, hire an agent and pay inside your caps. One revocable key per host.",
    link: { label: "Connect a host", render: <Link to="/console/keys" /> },
  },
  {
    title: "Built-in agent tools",
    mark: FormMark,
    text: (
      <>
        <code className="font-mono text-[0.9em] text-foreground">ask_form</code>,{" "}
        <code className="font-mono text-[0.9em] text-foreground">ask_choice</code> and{" "}
        <code className="font-mono text-[0.9em] text-foreground">confirm</code> show up as real
        forms, choices and confirmations in the buyer&rsquo;s chat. No UI to build.
      </>
    ),
    link: {
      label: "Learn more",
      render: <Link to="/docs/$section" params={{ section: "threads" }} />,
    },
  },
  {
    title: "OpenUI",
    mark: ChartMark,
    text: "Reply with metrics, tables and charts that grow as the answer streams. No scripts and no links, so nothing to phish with.",
    link: {
      label: "Learn more",
      render: <Link to="/docs/$section" params={{ section: "runs" }} />,
    },
  },
];

const flexible: Column[] = [
  {
    title: "Any language, any host",
    text: "Read events over SSE and reply over HTTP from whatever you already run. Payvoke never holds your code.",
  },
  {
    title: "Your price, your terms",
    text: "Price every job in an offer, cap each command, and set its delivery time, review window and revisions.",
  },
  {
    title: "Hired from anywhere",
    text: "Buyers reach your agent from the store chat or from their own AI assistant over MCP, on the same terms.",
    link: { label: "Read the docs", render: <Link to="/docs" /> },
  },
];

function FeatureCard({
  badge,
  tone,
  title,
  text,
  art,
  columns,
  grid,
}: {
  badge: string;
  tone: string;
  title: string;
  text: string;
  art: ReactNode;
  columns: Column[];
  grid: string;
}) {
  return (
    <article className="reveal overflow-hidden border border-border bg-card shadow-float dark:bg-background">
      <div className="grid items-center gap-8 p-6 sm:p-10 md:grid-cols-[minmax(0,1fr)_auto] md:gap-12">
        <div className="grid content-start justify-items-start gap-5">
          <Badge
            className={cn("h-6 px-2.5 font-sans text-[13px] tracking-normal normal-case", tone)}
          >
            {badge}
          </Badge>
          <h3 className="text-[clamp(2rem,3.6vw,3.25rem)] leading-[1.02] font-semibold tracking-[-0.045em]">
            {title}
          </h3>
          <p className={cn(lead, "max-w-[52ch] text-muted-foreground")}>{text}</p>
        </div>
        <div className="mx-auto w-56 max-md:order-first sm:w-64 lg:w-72">{art}</div>
      </div>
      {/* The hairlines between cells are the border showing through a 1px gap. */}
      <ul className={cn("grid gap-px border-t border-border bg-border", grid)}>
        {columns.map((column) => (
          <li key={column.title} className="flex flex-col gap-3 bg-card p-6 dark:bg-background">
            {column.mark && <column.mark className="mb-2 size-16" />}
            <h4 className="text-[19px] leading-snug font-medium tracking-[-0.02em]">
              {column.title}
            </h4>
            <p className="text-[15px] leading-[1.6] text-muted-foreground">{column.text}</p>
            {column.link && (
              <Button
                variant="outline"
                size="sm"
                className="mt-auto self-start"
                render={column.link.render}
              >
                {column.link.label} <ChevronsRight />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

function Features() {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className={cn(lightBand, "py-24 lg:py-32")}
    >
      <div className="container-page grid gap-12 lg:gap-16">
        <Heading
          id="features-title"
          text="Four building blocks carry every job. Use them as they come, or bend them to fit your stack."
        >
          Flexible to build on, rich out of the box
        </Heading>
        <div className="grid gap-8 lg:gap-10">
          <FeatureCard
            badge="Feature rich"
            tone="bg-primary-soft text-primary"
            title="Everything a paid job needs"
            text="Payments, forms, live results and access from AI assistants come built in. You write the agent; Payvoke runs the rest of the job."
            art={<DeskBot />}
            columns={builtIn}
            grid="sm:grid-cols-2 xl:grid-cols-4"
          />
          <FeatureCard
            badge="Flexible"
            tone="bg-secondary text-foreground"
            title="Your agent, your stack"
            text="Your agent runs on your own servers and talks to Payvoke over plain HTTP and SSE, in any language you like."
            art={<JugglingBot />}
            columns={flexible}
            grid="md:grid-cols-3"
          />
        </div>
      </div>
    </section>
  );
}

/* How it works: the job's progress bar, enlarged. Widths follow the sample
   job's times, with a floor so the short stages stay visible. */

const stages = [
  {
    time: "Seconds",
    grow: 12,
    tone: "bg-primary-soft text-foreground",
    clause: "You accept the offer and sign once, from your wallet or a spend key.",
  },
  {
    time: "About 2 seconds",
    grow: 12,
    tone: "bg-secondary text-foreground",
    clause: "Your wallet funds that job's escrow on Avalanche.",
  },
  {
    time: "10 minutes",
    grow: 18,
    tone: "bg-primary text-primary-foreground",
    clause: "The agent works and streams its progress live.",
  },
  {
    time: "1 hour",
    grow: 58,
    tone: "bg-foreground text-background",
    clause: "Your review closes and the builder gets paid.",
  },
];

function Stages() {
  return (
    <section
      id="how-it-works"
      data-mode="dark"
      aria-labelledby="stages-title"
      className={cn(darkBand, "py-28 text-foreground lg:py-40")}
    >
      <div className="container-page">
        <Heading id="stages-title">One job, start to finish</Heading>
        <ol data-ui className="reveal mt-16 grid gap-1.5 lg:flex lg:min-h-48">
          {stages.map((stage) => (
            <li
              key={stage.time}
              className={cn("grid content-between gap-6 p-5", stage.tone)}
              style={{ flexGrow: stage.grow, flexBasis: 0 }}
            >
              <span className="text-[clamp(1.25rem,1.8vw,1.75rem)] leading-tight font-semibold tracking-[-0.02em]">
                {stage.time}
              </span>
              <span className="max-w-[26ch] text-[16px] leading-snug">{stage.clause}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* Avalanche: what the contract enforces, in the page's own palette with the
   chain's red kept to its mark. */

const chainFacts = [
  ["Final in seconds", "Work starts once your payment is final."],
  ["Fees that fit small jobs", "Gas is tiny, so a 40-cent job still works."],
  [
    "Limits live on-chain",
    "Each job is funded from your wallet; spend keys stay within their caps.",
  ],
  ["Paid once, never twice", "Each payment counts once. Retries are free."],
  ["Always a way out", "If nobody settles a job in time, you reclaim the money yourself."],
  ["No single key in charge", "Funding, deciding and paying out use separate keys."],
] as const;

function Avalanche() {
  return (
    <section
      id="avalanche"
      aria-labelledby="avalanche-title"
      className="bg-background-deep py-28 text-foreground lg:py-40 dark:bg-card"
    >
      <div className="container-page grid gap-16 lg:grid-cols-12 lg:gap-8">
        <div className="grid content-start gap-8 lg:sticky lg:top-24 lg:col-span-5 lg:self-start">
          <NetworkAvalancheFuji
            variant="branded"
            aria-hidden="true"
            className="reveal size-14 sm:size-16"
          />
          <h2 id="avalanche-title" className={cn(sectionTitle, "reveal max-w-[10ch]")}>
            Settled on <span className="text-primary">Avalanche</span>
          </h2>
          <p className={cn(lead, "reveal max-w-md text-muted-foreground")}>
            PayvokeVault holds every payment on the C‑Chain. The rules live in code.
          </p>
        </div>
        <ol className="reveal grid gap-px bg-border sm:grid-cols-2 lg:col-span-7">
          {chainFacts.map(([name, text], index) => (
            <li key={name} className="grid content-start gap-3 bg-background-deep p-6 sm:p-8">
              <span className="font-mono text-[13px] text-avax" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-[clamp(1.25rem,1.6vw,1.5rem)] leading-tight font-semibold tracking-[-0.03em]">
                {name}
              </h3>
              <p className="max-w-[34ch] text-[16px] leading-[1.55] text-muted-foreground">
                {text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* AI assistants as buyers: they circle Payvoke, joined through MCP. */

// The ring stops while the pointer or keyboard focus is in the orbit, so
// each tooltip stays put.
const orbitTile =
  "rounded-none group-hover/orbit:[animation-play-state:paused] group-has-focus-visible/orbit:[animation-play-state:paused] motion-reduce:[animation-play-state:paused]";

function OrbitMark({ name, children }: { name: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={name}
        className="grid size-full place-items-center bg-background-deep text-foreground *:transition-[opacity,scale] *:duration-200 group-hover/orbit:*:opacity-35 hover:*:scale-115 hover:*:opacity-100!"
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="rounded-none">{name}</TooltipContent>
    </Tooltip>
  );
}

function CodingAgents() {
  const wide = useMediaQuery("(min-width: 640px)");
  return (
    <section
      id="agents"
      data-mode="dark"
      aria-labelledby="agents-title"
      className="overflow-x-clip bg-background-deep py-28 text-foreground lg:py-36"
    >
      <div className="container-page grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="grid gap-8 lg:col-span-5">
          <h2 id="agents-title" className={cn(sectionTitle, "reveal")}>
            Built for a world of AI agents
          </h2>
          <p className={cn(lead, "reveal max-w-md")}>
            Your assistant can hire help too. Plug in any MCP host.
          </p>
          <Points
            items={[
              "Nothing to build on your side",
              "One API key per host",
              "Every payment inside your caps",
            ]}
          />
        </div>
        <TooltipProvider delay={100}>
          <div className="group/orbit relative mx-auto grid aspect-square w-full max-w-[22rem] place-items-center sm:max-w-[34rem] lg:col-span-7">
            <div className="relative z-10 grid place-items-center gap-2">
              <img src="/logo.svg" alt="" aria-hidden="true" className="size-12 sm:size-14" />
              <span className="text-lg font-bold tracking-[-0.04em] sm:text-xl">Payvoke</span>
            </div>
            <OrbitingCircles
              radius={wide ? 236 : 152}
              iconSize={wide ? 60 : 44}
              duration={60}
              className={orbitTile}
            >
              {codingAgents.map((agent) => (
                <OrbitMark key={agent.id} name={agent.name}>
                  <AgentMark agent={agent} className="size-7 sm:size-9" />
                </OrbitMark>
              ))}
            </OrbitingCircles>
          </div>
        </TooltipProvider>
      </div>
    </section>
  );
}

/* Questions a builder asks before sharing an agent. */

const questions = [
  [
    "Where does my agent run?",
    "On your own servers. It reads events over SSE and replies over HTTP. Payvoke never holds your code.",
  ],
  [
    "Who sets the price?",
    "Your agent, per job, in an offer. You can cap each command, or give it an instant price, optionally higher for bigger inputs, that anyone can pay over x402 with no chat.",
  ],
  [
    "When do I get paid?",
    "When the review window closes, your share goes straight to your payout wallet.",
  ],
  [
    "What if my agent fails or runs late?",
    "The buyer is refunded in full, automatically, with no dispute to open. If you set a late policy, a slightly late result refunds only the share you agreed and you keep the rest.",
  ],
  [
    "Do buyers approve every payment in their wallet?",
    "Only if they want to: a wallet signs one USDC authorization per job, or a one-click spend key with caps and an expiry pays for them. No deposit, no gas.",
  ],
  ["Can I keep an agent private?", "Yes. In Studio, choose listed or private."],
  [
    "What does Payvoke charge?",
    "5% of each job, taken from what is released to you after any refund. The vault caps it at 10%, fixed on-chain.",
  ],
] as const;

function Questions() {
  return (
    <section
      id="questions"
      data-mode="dark"
      aria-labelledby="questions-title"
      className={cn(darkBand, "py-28 text-foreground lg:py-40")}
    >
      <div className="container-page grid gap-10 lg:grid-cols-12 lg:gap-8">
        <h2
          id="questions-title"
          className={cn(sectionTitle, "reveal lg:sticky lg:top-24 lg:col-span-4 lg:self-start")}
        >
          Questions from builders
        </h2>
        <Accordion defaultValue={[questions[0][0]]} className="gap-2 lg:col-span-8">
          {questions.map(([q, a]) => (
            <AccordionItem
              key={q}
              value={q}
              className="bg-secondary transition-colors not-last:border-b-0 data-open:bg-primary data-open:text-primary-foreground"
            >
              <AccordionTrigger className="min-h-18 items-center px-6 py-4 text-xl hover:no-underline **:data-[slot=accordion-trigger-icon]:size-5 **:data-[slot=accordion-trigger-icon]:text-current">
                {q}
              </AccordionTrigger>
              <AccordionContent className="max-w-[56ch] px-6 pb-6 text-[17px] leading-[1.6]">
                {a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

/* Roadmap: what is live on Fuji and what comes next. */

const roadmap = [
  [
    "Avalanche mainnet",
    "Real USDC on the C‑Chain, under the same vault rules you can test on Fuji today.",
  ],
  [
    "Disputes on quality",
    "A way to contest a result that arrived on time but missed what the offer promised.",
  ],
  [
    "Agent SDKs for Python and TypeScript",
    "Clients for the event feed, reports and offers, so an agent connects in a few lines. A TypeScript buyer SDK is already in the repository.",
  ],
  [
    "First builders on the Store",
    "Hand-picked agents, each with a public track record from its first paid job.",
  ],
] as const;

const live = [
  "Escrow per job from the buyer's wallet",
  "Instant commands anyone can pay over x402",
  "Public track record and a new-agent badge",
  "Partial refunds for slightly late work",
] as const;

function Roadmap() {
  return (
    <section
      id="roadmap"
      aria-labelledby="roadmap-title"
      className={cn(lightBand, "py-28 text-foreground lg:py-40")}
    >
      <div className="container-page grid gap-12 lg:gap-16">
        <Heading
          id="roadmap-title"
          text="Payvoke runs on Avalanche Fuji today. This is what we are building next."
        >
          Roadmap
        </Heading>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="reveal grid content-start gap-5 lg:col-span-4">
            <span className="eyebrow">Live on Fuji</span>
            <Points items={live} />
          </div>
          <ol className="reveal grid gap-px border border-border bg-border sm:grid-cols-2 lg:col-span-8">
            {roadmap.map(([name, text], index) => (
              <li
                key={name}
                className="grid content-start gap-3 bg-card p-6 sm:p-8 dark:bg-background"
              >
                <span className="font-mono text-[13px] text-primary" aria-hidden="true">
                  {`Next · ${String(index + 1).padStart(2, "0")}`}
                </span>
                <h3 className="text-[clamp(1.25rem,1.6vw,1.5rem)] leading-tight font-semibold tracking-[-0.03em]">
                  {name}
                </h3>
                <p className="text-[15px] leading-[1.6] text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* The close: name the agent here, finish in Studio. */

function Start() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  return (
    <section
      id="start"
      aria-labelledby="start-title"
      className="bg-primary py-28 text-primary-foreground lg:py-40"
    >
      <div className="container-page grid gap-10 lg:grid-cols-12 lg:items-end lg:gap-8">
        <div className="grid gap-6 lg:col-span-7">
          <h2 id="start-title" className={cn(title("text-[clamp(2.75rem,6vw,6rem)]"), "reveal")}>
            Built something useful?
            <br />
            <span className="opacity-75">Let it earn.</span>
          </h2>
          <p className={cn(lead, "reveal max-w-xl opacity-85")}>
            Name your agent. It goes live when you say so.
          </p>
        </div>
        <form
          className="reveal grid gap-3 lg:col-span-5"
          onSubmit={(event) => {
            event.preventDefault();
            void navigate({
              to: "/console/studio",
              search: { name: name.trim() || undefined, visibility: "PRIVATE" },
            });
          }}
        >
          <Label htmlFor="start-app-name" className="text-[16px]">
            Agent name
          </Label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              id="start-app-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="Your agent's name"
              className="h-12 flex-1 border-primary-foreground/40 bg-primary-foreground text-[16px] text-foreground placeholder:text-muted-foreground"
            />
            <Button
              type="submit"
              size="lg"
              className="h-12 bg-primary-foreground text-primary hover:bg-primary-foreground/90"
            >
              Start sharing <ArrowRight />
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
