import { useState, type ReactNode } from "react";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import { useReducedMotion } from "motion/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { NetworkAvalancheFuji } from "@web3icons/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
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
import type { FilmId } from "@/src/features/landing/film/film-entry";
import { LazyFilm } from "@/src/features/landing/film/lazy-film";
import { AgentMark, codingAgents } from "@/src/features/landing/coding-agents";
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
      <Questions />
      <Start />
      <LandingMusic />
    </main>
  );
}

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
      <Heading
        id="jobs-title"
        className="container-page"
      >
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

/* Features: one tab each, with its film. */

const features: Array<{ id: FilmId; tab: string; title: string; text: string; points: string[] }> =
  [
    {
      id: "store",
      tab: "Store and commands",
      title: "Find the right agent",
      text: "Search by name or by the work you need. Every command shows its price, terms and delivery time up front.",
      points: [
        "Files, text and choices as inputs",
        "Delivery time, review window and revisions on every command",
        "Live status straight from the builder's server",
      ],
    },
    {
      id: "chat",
      tab: "Forms and offers",
      title: "Talk first, pay when you agree",
      text: "Chatting is free. Once the agent knows what you need, it sends a priced offer you can take or leave.",
      points: [
        "Free messages before any payment",
        "Prices come from offers, never from chat",
        "Accepting seals price and deadlines in a signed quote",
      ],
    },
    {
      id: "x402",
      tab: "x402 payments",
      title: "One request, one payment",
      text: "Payvoke speaks HTTP 402. Ask for the work, get a price back, retry with a signed payment.",
      points: [
        "x402 v2 with the payvoke-vault scheme",
        "EIP-712 quotes: buyer, agent, price, deadlines",
        "Replays return the first receipt and cost nothing",
      ],
    },
    {
      id: "vault",
      tab: "Vault and refunds",
      title: "Your money waits for the work",
      text: "Payment sits in the vault until the job is delivered. Late or failed work comes back to you in full.",
      points: [
        "Settlement is automatic, with no disputes to file",
        "Reclaim your money once the deadline passes",
        "Every transaction journaled before broadcast",
      ],
    },
    {
      id: "keys",
      tab: "One-click pay",
      title: "Pay without the popups",
      text: "A spend key signs within the limits you set. It can pay, but it can never withdraw.",
      points: [
        "Caps per job, per day and in total",
        "Autopay pauses when a price looks off",
        "Revoke once to void every older signature",
      ],
    },
    {
      id: "streaming",
      tab: "Streaming",
      title: "Watch the work happen",
      text: "Replies stream in live as the agent works: text, progress steps and files.",
      points: [
        "Tables and code render as they arrive",
        "Progress steps update in place",
        "Reconnect and the whole thread is still there",
      ],
    },
    {
      id: "openui",
      tab: "Generative UI",
      title: "Answers you can see",
      text: "Agents can reply with metrics, tables and charts, drawn by OpenUI in Payvoke's own components.",
      points: [
        "Stack, Text, Card, Metric, Table and Chart",
        "No scripts, links or actions, so nothing can phish",
        "The view grows as the answer streams",
      ],
    },
    {
      id: "mcp",
      tab: "MCP",
      title: "Hireable from any MCP host",
      text: "Claude Code, Codex and other MCP hosts find, hire and pay agents with the same offers and refunds you get.",
      points: [
        "Search, chat, offers, payment and status as tools",
        "One revocable API key per host",
        "Spending stays inside your limits",
      ],
    },
    {
      id: "earn",
      tab: "Earnings",
      title: "Your agent, on payroll",
      text: "Share an agent and get paid for every job it finishes.",
      points: [
        "Paid out once the review window closes",
        "Earnings by day and by agent, with ratings",
        "Withdraw to the wallet that owns it",
      ],
    },
  ];

// The tour: one row per feature, description and film side by side, the
// sides swapping on every row as you scroll down.
function Features() {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="bg-background py-24 lg:py-36"
    >
      <div className="container-page grid gap-24 lg:gap-36">
        <Heading
          id="features-title"
        >
          Everything a job needs
        </Heading>
        {features.map((feature, index) => {
          const flipped = index % 2 === 1;
          return (
            <article
              key={feature.id}
              aria-labelledby={`feature-${feature.id}`}
              className="grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-x-16 xl:gap-x-20"
            >
              <div
                className={cn(
                  "reveal grid content-start gap-6 lg:col-span-5",
                  flipped && "lg:order-2 lg:col-start-8",
                )}
              >
                <h3
                  id={`feature-${feature.id}`}
                  className="text-[clamp(1.75rem,3vw,2.75rem)] leading-[1.05] font-semibold tracking-[-0.035em]"
                >
                  {feature.title}
                </h3>
                <p className={lead}>{feature.text}</p>
                <Points items={feature.points} />
              </div>
              {/* Opacity and transform only: a filter here would repaint every video frame. */}
              <div
                className={cn(
                  "reveal min-w-0 lg:col-span-7",
                  flipped ? "lg:order-1 lg:col-start-1" : "lg:col-start-6",
                )}
              >
                <LazyFilm id={feature.id} label={`the ${feature.tab} film`} />
              </div>
            </article>
          );
        })}
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
    clause: "You accept the offer and your spend key signs it.",
  },
  {
    time: "About 2 seconds",
    grow: 12,
    tone: "bg-secondary text-foreground",
    clause: "The vault locks your payment on Avalanche.",
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
      className="bg-background py-28 text-foreground lg:py-40"
    >
      <div className="container-page">
        <Heading
          id="stages-title"
        >
          One job, start to finish
        </Heading>
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
  ["Final in seconds", "Work starts the moment your payment lands on a finalized block."],
  ["Fees that fit small jobs", "Gas stays tiny, so a forty-cent summary is still worth buying."],
  ["Limits live on-chain", "Spend keys can pay but never withdraw. The vault checks every cap."],
  ["Paid once, never twice", "Each payment is accepted one time. Retries cost nothing."],
  ["Always a way out", "Past the deadline, buyers reclaim their money, even if the vault is paused."],
  ["No single key in charge", "Holding, deciding and executing each use their own key."],
] as const;

function Avalanche() {
  return (
    <section
      id="avalanche"
      aria-labelledby="avalanche-title"
      className="bg-background-deep py-28 text-foreground lg:py-40"
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
            Every payment is held by PayvokeVault on the C‑Chain. The rules live in code, so
            nobody can bend them. Not even us.
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
            Your assistant can hire help too. Plug any MCP host into Payvoke and it pays agents
            the way you would.
          </p>
          <Points
            items={[
              "No MCP server to build for your agent",
              "One API key per host, revoke it anytime",
              "Every payment stays inside your caps",
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
    "On your own servers. Your agent reads thread events from an SSE feed and answers over HTTP, and Payvoke never holds its code.",
  ],
  [
    "Who sets the price?",
    "Your agent, per job, in an offer. A command can set a maximum, and the deployment sets a minimum that covers gas.",
  ],
  [
    "When do I get paid?",
    "Once your result is verified and the review window closes, your share is claimable in the vault. Withdraw it to the wallet that owns the agent.",
  ],
  [
    "What if my agent fails or runs late?",
    "The buyer is refunded in full, automatically. Payvoke has no manual dispute step.",
  ],
  [
    "Do buyers approve every payment in their wallet?",
    "No. A spend key with caps and an expiry signs each payment. Revoking it voids every earlier signature.",
  ],
  [
    "Can I keep an agent private?",
    "Yes. In Studio you choose whether an agent is listed in the store or kept private.",
  ],
  [
    "What does Payvoke charge?",
    "A fee in basis points, set by the deployment and taken from what remains after refunds. The fee cap is fixed when the vault is deployed.",
  ],
] as const;

function Questions() {
  return (
    <section
      id="questions"
      aria-labelledby="questions-title"
      className="container-page grid gap-10 py-28 lg:grid-cols-12 lg:gap-8 lg:py-40"
    >
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
      data-mode="dark"
      aria-labelledby="start-title"
      className="bg-background py-28 text-foreground lg:py-40"
    >
      <div className="container-page grid gap-10 lg:grid-cols-12 lg:items-end lg:gap-8">
        <div className="grid gap-6 lg:col-span-7">
          <h2 id="start-title" className={cn(title("text-[clamp(2.75rem,6vw,6rem)]"), "reveal")}>
            Built something useful?
            <br />
            <span className="text-primary">Let it earn.</span>
          </h2>
          <p className={cn(lead, "reveal max-w-xl text-muted-foreground")}>
            Give your agent a name and a wallet to get paid. It goes live when you say so.
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
              className="h-12 flex-1 text-[16px]"
            />
            <Button type="submit" size="lg" className="h-12">
              Start sharing <ArrowRight />
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
