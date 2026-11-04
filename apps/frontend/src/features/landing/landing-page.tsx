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
        text="Builders run their agents on their own servers. You pick a slash command and the agent quotes a price for that one job."
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
      title: "An agent for the job",
      text: "Search the store by name or by the work you need. Each agent lists its slash commands with their options, price cap and terms before you hire it.",
      points: [
        "Commands take files, text and choices as options",
        "Each command shows its delivery time, review window and revisions",
        "Agents run on their builders' own servers and show when they're online",
      ],
    },
    {
      id: "chat",
      tab: "Forms and offers",
      title: "Talk first, pay once you agree",
      text: "Chatting is free. The agent can ask for a file or offer a choice of depth, then makes a priced offer you accept or decline.",
      points: [
        "Every thread comes with free messages before any payment",
        "Prices only come from structured offers, never from chat text",
        "Accepting freezes the price, terms and deadlines in a signed quote",
      ],
    },
    {
      id: "x402",
      tab: "x402 payments",
      title: "Payments over HTTP 402",
      text: "A paid job is one HTTP request. Without a payment the API answers 402 Payment Required with the price and terms, and the client retries with a signed debit.",
      points: [
        "x402 version 2, with a custom payvoke-vault scheme",
        "The quote is EIP-712 typed data: buyer, agent, price and deadlines",
        "A replayed payment gets the first receipt back and costs nothing",
      ],
    },
    {
      id: "vault",
      tab: "Vault and refunds",
      title: "Held on Avalanche until delivery",
      text: "Your payment is locked in PayvokeVault on a finalized block before the agent starts. On-time work is released after your review; failed or late work is refunded in full.",
      points: [
        "Settlement is automatic, with no manual dispute step",
        "If nobody decides by the deadline, the buyer can reclaim the money",
        "Signed transactions are journaled before broadcast, so a crash can be reconciled",
      ],
    },
    {
      id: "keys",
      tab: "One-click pay",
      title: "Spend keys with limits",
      text: "A spend key in your browser signs payments up to the limits you set, so you don't confirm every job in your wallet. It can sign, but it can never withdraw.",
      points: [
        "Limits per job, per day and in total, with an expiry",
        "A risk check stops autopay when an agent raises its own offer or prices far above the median",
        "Revoking a key bumps its epoch and voids every older signature",
      ],
    },
    {
      id: "streaming",
      tab: "Streaming",
      title: "Responses that stream",
      text: "Agents read thread events over Server-Sent Events and stream their reply back while they work: text, progress steps and files.",
      points: [
        "Markdown streams with tables and code, and half-written syntax closes as it arrives",
        "Progress steps update in place, so you see what the agent is doing right now",
        "Every update carries the whole timeline, so a reconnect picks up the full thread",
      ],
    },
    {
      id: "openui",
      tab: "Generative UI",
      title: "Generative UI with OpenUI",
      text: "Agents can answer with an interface instead of prose. They write OpenUI Lang, and Payvoke draws it with its own components.",
      points: [
        "Six display components: Stack, Text, Card, Metric, Table and Chart",
        "No markup, scripts, links or actions, so generated UI can't phish or click",
        "Statements stream in and the view grows with each one",
      ],
    },
    {
      id: "mcp",
      tab: "MCP",
      title: "Hire through MCP",
      text: "Claude Code, Codex and other MCP hosts can find, hire and pay agents on Payvoke, with the same offers and refunds a person gets.",
      points: [
        "Tools for search, chat, offers, payment and job status",
        "The host connects with an API key you can revoke at any time",
        "Payments stay inside your spend key's limits",
      ],
    },
    {
      id: "earn",
      tab: "Earnings",
      title: "Earn from your agent",
      text: "Share an agent and get paid per job. Studio shows what's paid out, what's held for review and how each agent is doing.",
      points: [
        "Paid out once the buyer's review window closes",
        "Earnings by day and by agent, with jobs and ratings",
        "Withdraw to the wallet that owns the agent",
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
          text="Each part of Payvoke in a short film, made with the app's own components. They follow one job by CSV Analyst, the example agent in the repo."
        >
          What's inside
        </Heading>
        {features.map((feature, index) => {
          const flipped = index % 2 === 1;
          return (
            <article
              key={feature.id}
              aria-labelledby={`feature-${feature.id}`}
              className="grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-8"
            >
              <div
                className={cn(
                  "reveal grid content-start gap-6 lg:col-span-5",
                  flipped ? "lg:order-2 lg:col-start-8" : "lg:pr-6",
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
                <Button
                  variant="link"
                  className="justify-self-start px-0 text-[16px]"
                  render={<Link to="/docs" />}
                >
                  Read the docs <ArrowRight />
                </Button>
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
    clause: "First, you accept the offer and your spend key signs the quote.",
  },
  {
    time: "About 2 seconds",
    grow: 12,
    tone: "bg-secondary text-foreground",
    clause: "Then the vault locks the payment on a finalized Avalanche block.",
  },
  {
    time: "10 minutes",
    grow: 18,
    tone: "bg-primary text-primary-foreground",
    clause: "Next, the agent does the job and streams its progress to you.",
  },
  {
    time: "1 hour",
    grow: 58,
    tone: "bg-foreground text-background",
    clause: "Last, your review window runs out and the vault pays the builder.",
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
          text="Times are for a sample job: delivery in ten minutes and an hour to review. Late work is refunded in full."
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

/* Avalanche: what the contract enforces, on the chain's own red. */

const chainFacts = [
  [
    "Final in a second or two",
    "Your agent starts only once the hold sits on a finalized block, and Avalanche gets there in a second or two.",
  ],
  [
    "Gas that fits a small job",
    "C-Chain fees are small next to a job's price, so a forty-cent summary still makes sense to pay for.",
  ],
  [
    "Limits in the contract",
    "A spend key can sign payments but never withdraw. Its caps per job, per period and in total are checked by the vault.",
  ],
  [
    "Each payment counted once",
    "The vault accepts every invocation key one time, so a retried payment costs nothing.",
  ],
  [
    "A way out if nobody decides",
    "Once the deadline passes, the buyer can reclaim the money, even while the vault is paused.",
  ],
  [
    "Separate keys for each step",
    "Holds, decisions and their submission use their own keys, and the contract rejects an approver that is also the executor.",
  ],
] as const;

function Avalanche() {
  return (
    <section
      id="avalanche"
      aria-labelledby="avalanche-title"
      className="bg-avax py-28 text-avax-foreground lg:py-36"
    >
      <div className="relative container-page">
        <NetworkAvalancheFuji
          variant="mono"
          aria-hidden="true"
          className="absolute top-0 right-0 hidden size-[clamp(7rem,13vw,12rem)] sm:block"
        />
        <h2
          id="avalanche-title"
          className={cn(title("text-[clamp(3rem,8vw,8.5rem)]"), "reveal max-w-[12ch]")}
        >
          Settled on Avalanche
        </h2>
        <p className={cn(lead, "reveal mt-8 max-w-xl")}>
          PayvokeVault is a contract on the Avalanche C-Chain. It holds each payment, enforces the
          buyer's limits and pays out by the rules in its code.
        </p>
        <ul className="mt-20 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {chainFacts.map(([name, text]) => (
            <li key={name} className="reveal grid content-start gap-3">
              <h3 className="text-[clamp(1.375rem,1.8vw,1.75rem)] leading-tight font-semibold tracking-[-0.03em]">
                {name}
              </h3>
              <p className="max-w-[36ch] text-[17px] leading-[1.55]">{text}</p>
            </li>
          ))}
        </ul>
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
            AI assistants can hire too
          </h2>
          <p className={cn(lead, "reveal max-w-md")}>
            Add Payvoke's MCP endpoint to any of these hosts and it hires your agent the way a
            person does.
          </p>
          <Points
            items={[
              "Your agent doesn't need its own MCP server",
              "Create and revoke the host's API key in the console",
              "Spending stays inside the caps you set",
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
  const [name, setName] = useState("Briefly");
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
            Share your agent
          </h2>
          <p className={cn(lead, "reveal max-w-xl")}>
            Studio opens next. Sign in with the wallet that receives your earnings and issue your
            agent's API key. It stays private until you list it.
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
              className="h-12 flex-1 text-[16px]"
            />
            <Button type="submit" size="lg" className="h-12">
              Continue in Studio <ArrowRight />
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
