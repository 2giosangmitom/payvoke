import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Check, Lock, RotateCcw } from "lucide-react";
import { NetworkAvalancheFuji, TokenUSDC } from "@web3icons/react";
import { SiClaudecode, SiModelcontextprotocol } from "@icons-pack/react-simple-icons";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { AnimatedShinyText } from "@/src/components/ui/animated-shiny-text";
import { BlurFade } from "@/src/components/ui/blur-fade";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { HeroPixelField } from "@/src/components/ui/hero-pixel-field";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Marquee } from "@/src/components/ui/marquee";
import { OrbitingCircles } from "@/src/components/ui/orbiting-circles";
import { ParticleText } from "@/src/components/ui/particle-text";
import { ScrollProgress } from "@/src/components/ui/scroll-progress";
import { Switch } from "@/src/components/ui/switch";
import { AnimatedSpan, Terminal, TypingAnimation } from "@/src/components/ui/terminal";
import { TextAnimate } from "@/src/components/ui/text-animate";
import { TextReveal } from "@/src/components/ui/text-reveal";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { WordRotate } from "@/src/components/ui/word-rotate";
import { useMediaQuery } from "@/src/hooks/use-media-query";
import { codingAgents } from "@/src/features/landing/coding-agents";
import { landingAudio } from "@/src/features/landing/landing-audio";
import { DemoThread } from "@/src/features/landing/landing-demo";
import { fragments } from "@/src/features/landing/landing-fragments";
import { LandingMusic } from "@/src/features/landing/landing-music";
import { cn } from "@/src/lib/utils";

export function LandingPage() {
  return (
    <main>
      <ScrollProgress />
      <Hero />
      <TextReveal className="bg-background-deep">
        Someone builds an agent that saves them an afternoon. Someone else hires it for the same job
        and pays only when the work arrives. Payvoke is the store, the checkout and the vault in
        between, on Avalanche.
      </TextReveal>
      <Jobs />
      <TryIt />
      <Showcase />
      <CodingAgents />
      <Lifecycle />
      <Safeguards />
      <Questions />
      <Start />
      <LandingMusic />
    </main>
  );
}

const sectionTitle =
  "text-[clamp(2rem,3.6vw,3.25rem)] leading-[1.05] font-semibold tracking-[-0.04em]";
const statement = "text-[clamp(1.375rem,2vw,1.75rem)] leading-[1.2] tracking-[-0.02em]";

// Section headings play word by word the first time they scroll into view.
function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <TextAnimate
      as="h2"
      id={id}
      by="word"
      animation="blurInUp"
      startOnView
      once
      className={sectionTitle}
    >
      {children}
    </TextAnimate>
  );
}

const jobs = ["summarize a report", "review a pull request", "clean a CSV", "research a market"];

const facts = [
  { icon: <TokenUSDC size={18} aria-hidden="true" />, label: "Paid in USDC on Avalanche" },
  { icon: <Lock size={16} aria-hidden="true" />, label: "Held until the work arrives" },
  { icon: <RotateCcw size={16} aria-hidden="true" />, label: "Refunded if it's late" },
];

function Hero() {
  const hero = useRef<HTMLElement>(null);
  // The copy drifts up and fades as the hero scrolls away; the field and the
  // wordmark stay put behind it.
  const { scrollYProgress } = useScroll({ target: hero, offset: ["start start", "end start"] });
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  // The field can walk the analysed timeline before the sound is touched.
  useEffect(() => {
    landingAudio.prime();
  }, []);

  return (
    <section
      id="top"
      ref={hero}
      className="relative isolate flex min-h-[calc(100svh-4rem)] flex-col overflow-hidden bg-field-bg"
    >
      <HeroPixelField sample={(now) => landingAudio.sample(now)} />

      <div className="relative z-10 container-page flex flex-1 items-center justify-center pt-16 pb-36 sm:pt-20 sm:pb-40">
        <div className="flex w-full flex-col items-center text-center">
          <BlurFade delay={0.05}>
            <p className="mb-[clamp(1.25rem,4vh,2.6rem)] inline-flex items-center gap-2.5 border border-primary/40 bg-field-bg/85 px-3 py-1.5 font-mono text-[10px] tracking-wider sm:text-[11px]">
              <NetworkAvalancheFuji size={16} aria-hidden="true" />
              <AnimatedShinyText shimmerWidth={120}>RUNNING ON AVALANCHE FUJI</AnimatedShinyText>
            </p>
          </BlurFade>

          <div
            data-field-anchor
            className="relative h-[clamp(5.75rem,16vw,13.6rem)] w-full max-w-245"
          >
            <ParticleText
              text="PAYVOKE"
              density={3}
              particleSize={3}
              color="var(--field-crest)"
              highlightColor="var(--field-hover)"
              fontSize="clamp(3.4rem, 17vw, 12rem)"
              fontWeight={800}
              shape="square"
              intro="gather"
              scatter={90}
              gatherDuration={1500}
              stagger={420}
              idleDrift={0.7}
              glow
              clickBurst
              // The canvas overhangs the slot so the scattered intro has room;
              // inside the slot alone, the gather was cut off by a hard edge.
              className="absolute! -inset-x-[12%] -inset-y-[55%] size-auto!"
            />
          </div>

          <motion.div
            style={{ y: copyY, opacity: copyOpacity }}
            className="flex w-full flex-col items-center motion-reduce:[transform:none!important]"
          >
            <TextAnimate
              as="h1"
              by="word"
              animation="blurInUp"
              duration={0.6}
              delay={0.15}
              startOnView={false}
              once
              className="mt-6 max-w-3xl font-mono text-[clamp(1.25rem,2.7vw,2rem)] leading-snug font-medium tracking-[-0.045em] text-balance"
            >
              Share your AI agent. Let anyone hire it.
            </TextAnimate>
            <BlurFade delay={0.45}>
              <p className="mt-5 max-w-xl text-[15px] leading-7 text-pretty text-muted-foreground">
                Hire an agent to{" "}
                <WordRotate words={jobs} duration={2600} className="font-medium text-foreground" />.
                Each job is paid in USDC and held in a vault on Avalanche until the work is
                delivered.
              </p>
            </BlurFade>
            <BlurFade
              delay={0.6}
              className="mt-8 flex w-full flex-col justify-center gap-3 min-[420px]:w-auto min-[420px]:flex-row"
            >
              <Button size="lg" render={<Link to="/console/studio" />}>
                Share your agent <ArrowRight />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="bg-field-bg"
                render={<Link to="/store" />}
              >
                Hire an agent <ArrowUpRight />
              </Button>
            </BlurFade>
            <ul className="mt-10 flex flex-wrap justify-center gap-x-7 gap-y-3 text-[14px]">
              {facts.map((fact, index) => (
                <li key={fact.label}>
                  <BlurFade delay={0.75 + index * 0.08}>
                    <span className="inline-flex items-center gap-2 bg-field-bg/85 px-1.5 py-0.5">
                      <span className="text-primary">{fact.icon}</span>
                      {fact.label}
                    </span>
                  </BlurFade>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
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
    <section id="jobs" aria-labelledby="jobs-title" className="overflow-x-clip py-28 lg:py-36">
      <div className="container-page grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-7">
          <SectionTitle id="jobs-title">An agent for every job</SectionTitle>
        </div>
        <BlurFade
          inView
          direction="up"
          offset={24}
          delay={0.15}
          className="lg:col-span-4 lg:col-start-9"
        >
          <p className="max-w-md text-[17px] leading-[1.6]">
            Each agent lists the commands it takes. You pick one, the agent prices the job, and you
            pay for that job alone.
          </p>
        </BlurFade>
      </div>
      <div className="mt-14 grid gap-3">
        {jobRows.map((row, index) => (
          <Marquee key={index} reverse={index === 1} pauseOnHover className="p-0 [--duration:46s]">
            {row.map(([command, job]) => (
              <p
                key={command}
                className="flex items-baseline gap-3 bg-secondary px-6 py-5 text-[clamp(1.25rem,2vw,1.75rem)] tracking-[-0.02em] whitespace-nowrap transition-colors hover:bg-primary hover:text-primary-foreground"
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

/* The thread: the visitor hires an agent and picks how the job ends. */

function TryIt() {
  return (
    <section
      id="try"
      aria-labelledby="try-title"
      className="container-page grid items-center gap-12 pb-28 lg:grid-cols-12 lg:gap-8 lg:pb-36"
    >
      <div className="lg:col-span-5">
        <SectionTitle id="try-title">Hire an agent in a chat</SectionTitle>
        <BlurFade inView direction="up" offset={16} delay={0.2}>
          <p className="mt-6 max-w-md text-[17px] leading-[1.6]">
            Tell the agent what you need. It answers with an offer: the price, the delivery deadline
            and how long you have to review. Accept it and the USDC moves into the vault.
          </p>
          <p className="mt-4 max-w-md text-[17px] leading-[1.6]">
            Work that arrives on time is paid out after your review. Work that doesn't comes back to
            you as a full refund.
          </p>
        </BlurFade>
      </div>
      <BlurFade
        inView
        direction="up"
        offset={24}
        delay={0.1}
        className="lg:col-span-6 lg:col-start-7 xl:col-span-5 xl:col-start-8"
      >
        <DemoThread />
      </BlurFade>
    </section>
  );
}

/* Each part of a thread, pinned beside its explanation while the list scrolls. */

function Showcase() {
  const list = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: list, offset: ["start center", "end center"] });
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    setActive(Math.min(fragments.length - 1, Math.max(0, Math.floor(value * fragments.length))));
  });

  return (
    <section
      id="thread"
      aria-labelledby="thread-title"
      className="bg-background-deep py-28 lg:py-36"
    >
      <div className="container-page grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-6">
          <SectionTitle id="thread-title">Everything happens in the thread</SectionTitle>
        </div>
        <BlurFade
          inView
          direction="up"
          offset={24}
          delay={0.15}
          className="lg:col-span-5 lg:col-start-8"
        >
          <p className="max-w-md text-[17px] leading-[1.6]">
            Buyers find your agent in the store, open a thread and talk to it. Commands, forms,
            offers and results all arrive in the same conversation.
          </p>
        </BlurFade>
      </div>

      <div className="container-page mt-12 grid gap-8 lg:mt-4 lg:grid-cols-12">
        <ol ref={list} className="grid lg:col-span-5">
          {fragments.map((fragment, index) => (
            <li
              key={fragment.id}
              className={cn(
                "flex flex-col justify-center gap-3 py-8 transition-opacity duration-300 lg:min-h-[52vh] lg:py-0",
                index !== active && "lg:opacity-30",
              )}
            >
              <h3 className="text-[clamp(1.5rem,2.4vw,2.25rem)] leading-tight font-semibold tracking-[-0.03em]">
                {fragment.name}
              </h3>
              <p className="max-w-md text-[17px] leading-[1.6]">{fragment.text}</p>
              <div className="mt-4 max-w-md lg:hidden">{fragment.panel}</div>
            </li>
          ))}
        </ol>
        <div className="relative hidden lg:col-span-6 lg:col-start-7 lg:block">
          <div className="sticky top-[calc(50vh-12rem)] flex gap-6">
            <motion.span
              aria-hidden="true"
              style={{ scaleY: scrollYProgress }}
              className="w-1 origin-top bg-primary"
            />
            <div className="min-h-96 flex-1">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={fragments[active].id}
                  initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -16, filter: "blur(6px)" }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="max-w-md"
                >
                  {fragments[active].panel}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Coding agents as buyers: they circle Payvoke, joined through MCP. */

const toolCall = "flex items-center gap-2";

const bridgePoints = [
  "Your agent needs no MCP server of its own. Payvoke's MCP endpoint lists it as a tool.",
  "The host connects with an access token you create and revoke in the console.",
  "Each payment is signed on your machine by a spend key with your caps, under the same vault rules.",
];

// Both rings stop together while the pointer or keyboard focus is in the
// orbit, so no mark slides over another and each tooltip stays put.
const orbitTile =
  "rounded-none group-hover/orbit:[animation-play-state:paused] group-has-focus-visible/orbit:[animation-play-state:paused] motion-reduce:[animation-play-state:paused]";

const rails = [
  {
    name: "Model Context Protocol",
    icon: <SiModelcontextprotocol className="size-6 sm:size-7" />,
  },
  { name: "USDC", icon: <TokenUSDC className="size-7 sm:size-8" /> },
  { name: "Avalanche", icon: <NetworkAvalancheFuji className="size-7 sm:size-8" /> },
];

// The mark sits on the section's own ground, which only hides the orbit line
// behind it. Hovering one dims the rest; only the logo grows, not its ground.
function OrbitMark({ name, children }: { name: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={name}
        className="grid size-full place-items-center bg-background text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary *:transition-[opacity,scale] *:duration-200 group-hover/orbit:*:opacity-35 group-has-focus-visible/orbit:*:opacity-35 hover:*:scale-115 hover:*:opacity-100! focus-visible:*:scale-115 focus-visible:*:opacity-100!"
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
      className="overflow-x-clip bg-background py-28 text-foreground lg:py-36"
    >
      <div className="container-page grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-5">
          <SectionTitle id="agents-title">Built for the age of agents</SectionTitle>
          <BlurFade inView direction="up" offset={16} delay={0.15}>
            <p className="mt-6 max-w-md text-[17px] leading-[1.6]">
              Coding agents already plan, write and review code on their own. Payvoke lets Claude
              Code, Copilot, Cursor and any other MCP host hire your agent the way a person does,
              with the same offer, the same vault and the same refund.
            </p>
          </BlurFade>
        </div>

        <BlurFade inView direction="up" offset={24} delay={0.1} className="min-w-0 lg:col-span-7">
          <TooltipProvider delay={100}>
            <div className="group/orbit relative mx-auto grid aspect-square w-full max-w-[22rem] place-items-center sm:max-w-[34rem]">
              <div className="relative z-10 grid place-items-center gap-2">
                <img src="/logo.svg" alt="" aria-hidden="true" className="size-12 sm:size-14" />
                <span className="text-lg font-bold tracking-[-0.04em] sm:text-xl">Payvoke</span>
              </div>
              <OrbitingCircles
                radius={wide ? 140 : 92}
                iconSize={wide ? 48 : 40}
                duration={28}
                reverse
                className={orbitTile}
              >
                {rails.map((rail) => (
                  <OrbitMark key={rail.name} name={rail.name}>
                    {rail.icon}
                  </OrbitMark>
                ))}
              </OrbitingCircles>
              <OrbitingCircles
                radius={wide ? 236 : 152}
                iconSize={wide ? 60 : 44}
                duration={60}
                className={orbitTile}
              >
                {codingAgents.map(({ name, Icon, brand }) => (
                  <OrbitMark key={name} name={name}>
                    <Icon color={brand ? "default" : "currentColor"} className="size-7 sm:size-9" />
                  </OrbitMark>
                ))}
              </OrbitingCircles>
            </div>
          </TooltipProvider>
        </BlurFade>
      </div>

      <div className="container-page mt-20 grid items-center gap-12 lg:mt-28 lg:grid-cols-12 lg:gap-8">
        <BlurFade inView direction="up" offset={24} className="min-w-0 lg:col-span-7">
          <Terminal
            title={
              <>
                <SiClaudecode color="default" className="size-4" aria-hidden="true" />
                Claude Code with Payvoke MCP
              </>
            }
            className="bg-background-deep text-[13px] leading-relaxed"
          >
            <TypingAnimation className="text-[13px] text-foreground" duration={28}>
              {"> Review PR #128. Hire a reviewer on Payvoke if you want a second pass."}
            </TypingAnimation>
            <AnimatedSpan className={toolCall}>
              <span aria-hidden="true" className="size-2 bg-primary" />
              <span className="text-muted-foreground">
                {'payvoke.search_agents("code review")'}
              </span>
            </AnimatedSpan>
            <AnimatedSpan className="pl-4 text-foreground">
              Reviewer, Lintwise and 2 more
            </AnimatedSpan>
            <AnimatedSpan className={toolCall}>
              <span aria-hidden="true" className="size-2 bg-primary" />
              <span className="text-muted-foreground">
                {'payvoke.send_message("/review PR #128")'}
              </span>
            </AnimatedSpan>
            <AnimatedSpan className="pl-4 text-foreground">
              0.60 USDC · delivery 15 min · review 1 h
            </AnimatedSpan>
            <AnimatedSpan className="text-primary">
              ? Sign 0.60 USDC with your spend key (4.40 left today)? › Yes
            </AnimatedSpan>
            <AnimatedSpan className={toolCall}>
              <Check size={14} className="text-primary" aria-hidden="true" />
              0.60 USDC held in PayvokeVault on Avalanche
            </AnimatedSpan>
            <AnimatedSpan className={toolCall}>
              <Check size={14} className="text-primary" aria-hidden="true" />
              Reviewer delivered 7 comments in 11 min
            </AnimatedSpan>
          </Terminal>
        </BlurFade>
        <ul className="grid max-w-md gap-5 lg:col-span-4 lg:col-start-9">
          {bridgePoints.map((point, index) => (
            <li key={point}>
              <BlurFade inView direction="up" offset={12} delay={0.1 + index * 0.08}>
                <p className="flex gap-3 text-[17px] leading-[1.5]">
                  <Check size={18} className="mt-1 shrink-0 text-primary" aria-hidden="true" />
                  {point}
                </p>
              </BlurFade>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* One job, from offer to payout, as the same card four times. */

type LifecycleStep = {
  clause: string;
  field: string;
  state: string;
  rows: Array<[string, string]>;
  note: ReactNode;
};

const lifecycle: LifecycleStep[] = [
  {
    clause: "First your agent posts an offer.",
    field: "bg-background",
    state: "Offer",
    rows: [
      ["Price", "0.40 USDC"],
      ["Delivery", "10 min"],
    ],
    note: "Waiting for the buyer",
  },
  {
    clause: "The buyer pays, and the vault holds it.",
    field: "bg-secondary",
    state: "Held",
    rows: [
      ["Price", "0.40 USDC"],
      ["Hold", "Finalized"],
    ],
    note: (
      <>
        Your agent receives <code className="font-mono">invocation.ready</code>
      </>
    ),
  },
  {
    clause: "Your agent delivers before the deadline.",
    field: "bg-primary-soft",
    state: "Delivered",
    rows: [
      ["Took", "9 min"],
      ["Result", "Verified"],
    ],
    note: "Buyer review ends in 1 h",
  },
  {
    clause: "After review, the money is yours.",
    field: "bg-primary text-primary-foreground",
    state: "Released",
    rows: [
      ["Price", "0.40 USDC"],
      ["Claimable", "0.40 less fee"],
    ],
    note: "Withdraw from the vault any time",
  },
];

function Lifecycle() {
  const section = useRef<HTMLElement>(null);
  // While the strip crosses the screen, a bar fills along its top and each
  // card rises a little later than the one before it.
  const { scrollYProgress } = useScroll({ target: section, offset: ["start end", "end start"] });
  const fill = useTransform(scrollYProgress, [0.15, 0.6], [0, 1]);

  return (
    <section
      id="how-it-works"
      ref={section}
      aria-labelledby="lifecycle-title"
      className="relative grid md:grid-cols-2 lg:grid-cols-4"
    >
      <motion.span
        aria-hidden="true"
        style={{ scaleX: fill }}
        className="absolute inset-x-0 top-0 z-10 h-1 origin-left bg-primary"
      />
      {lifecycle.map((step, index) => (
        <LifecycleField key={step.clause} step={step} index={index} progress={scrollYProgress} />
      ))}
    </section>
  );
}

function LifecycleField({
  step,
  index,
  progress,
}: {
  step: LifecycleStep;
  index: number;
  progress: MotionValue<number>;
}) {
  const y = useTransform(progress, [0.1 + index * 0.06, 0.45 + index * 0.06], [72, 0]);

  return (
    <div
      className={cn(
        "group flex flex-col gap-8 px-5 py-12 sm:px-10 lg:min-h-[36rem] lg:px-8",
        step.field,
      )}
    >
      {index === 0 ? (
        <TextAnimate
          as="h2"
          id="lifecycle-title"
          by="word"
          animation="blurInUp"
          startOnView
          once
          className={cn(statement, "font-bold md:h-[4.2em]")}
        >
          One job, start to finish
        </TextAnimate>
      ) : (
        <span aria-hidden="true" className={cn(statement, "hidden md:block md:h-[4.2em]")} />
      )}
      <motion.div style={{ y }} className="motion-reduce:[transform:none!important]">
        <Card
          data-ui
          size="sm"
          className="w-full max-w-[17rem] text-[14px] transition-transform duration-150 group-hover:-translate-y-1.5"
        >
          <CardHeader className="grid-cols-[1fr_auto]">
            <CardTitle>
              <code className="font-mono text-primary">/summarize</code>
            </CardTitle>
            <span className="font-medium">{step.state}</span>
          </CardHeader>
          <CardContent className="grid gap-2">
            {step.rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{label}</span>
                <span className="tabular-nums">{value}</span>
              </div>
            ))}
            <p className="text-muted-foreground">{step.note}</p>
          </CardContent>
        </Card>
      </motion.div>
      <BlurFade inView direction="up" offset={12} delay={0.1 + index * 0.08} className="mt-auto">
        <p className={cn(statement, "max-w-[16rem] font-medium")}>{step.clause}</p>
      </BlurFade>
    </div>
  );
}

/* What happens when something goes wrong. Each switch shows the consequence. */

const safeguards = [
  {
    id: "late",
    when: "Your agent misses its delivery deadline.",
    result: "The buyer gets the full 0.40 USDC back automatically. Nobody has to open a dispute.",
    field: "bg-primary-soft",
  },
  {
    id: "cap",
    when: "A spend key tries to pay past its cap.",
    result:
      "The vault refuses the debit. Caps per call, per period and in total are kept on Avalanche.",
    field: "bg-secondary",
  },
  {
    id: "replay",
    when: "The same signed payment arrives twice.",
    result: "The vault accepts each job once. The retry gets the first receipt and costs nothing.",
    field: "bg-primary-soft",
  },
  {
    id: "chat-price",
    when: "Your agent types a price into a message.",
    result: "Nothing can be paid from it. Only a structured offer becomes a quote.",
    field: "bg-secondary",
  },
  {
    id: "stuck",
    when: "Nobody settles the hold in time.",
    result:
      "Once the deadline passes, the buyer can reclaim the money, even while the vault is paused.",
    field: "bg-primary-soft",
  },
];

function Safeguards() {
  const [on, setOn] = useState<Record<string, boolean>>({ late: true, replay: true });

  return (
    <section id="safeguards" aria-labelledby="safeguards-title" className="pt-28 lg:pt-40">
      <div className="container-page grid gap-6 pb-14 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-6">
          <SectionTitle id="safeguards-title">When something goes wrong</SectionTitle>
        </div>
        <BlurFade
          inView
          direction="up"
          offset={24}
          delay={0.15}
          className="lg:col-span-5 lg:col-start-8"
        >
          <p className="max-w-md text-[17px] leading-[1.6]">
            The rules live in the PayvokeVault contract on Avalanche, so neither side has to trust
            the other or Payvoke. Flip a case to see what happens.
          </p>
        </BlurFade>
      </div>
      {safeguards.map((item, index) => {
        const active = Boolean(on[item.id]);
        return (
          <div
            key={item.id}
            className={cn("transition-colors duration-300", active ? item.field : "bg-background")}
          >
            <BlurFade
              inView
              direction="up"
              offset={16}
              delay={index * 0.05}
              className="container-page flex min-h-32 items-center justify-between gap-6 py-7"
            >
              <div className="min-w-0">
                <Label htmlFor={`case-${item.id}`} className={cn(statement, "font-medium")}>
                  {item.when}
                </Label>
                {active && (
                  <BlurFade>
                    <p className="mt-2 max-w-2xl text-[17px] leading-[1.55]">{item.result}</p>
                  </BlurFade>
                )}
              </div>
              <Switch
                id={`case-${item.id}`}
                checked={active}
                onCheckedChange={(checked) => setOn((state) => ({ ...state, [item.id]: checked }))}
                className="data-[size=default]:h-7 data-[size=default]:w-12 **:data-[slot=switch-thumb]:size-6!"
              />
            </BlurFade>
          </div>
        );
      })}
    </section>
  );
}

/* Questions a builder asks before sharing an agent. */

const questions = [
  {
    q: "Where does my agent run?",
    a: "On your own servers. Payvoke doesn't host agent code. Your agent reads thread events from an SSE feed, then replies, sends forms and offers, and streams results back over HTTP.",
  },
  {
    q: "How do I add slash commands?",
    a: "Your agent registers them through the provider API with its app key. Studio lists them so you can check what buyers will see.",
  },
  {
    q: "Who sets the price?",
    a: "Your agent, for each job, in an offer. A command can declare a maximum amount, and the deployment sets a minimum that covers gas.",
  },
  {
    q: "When do I get paid?",
    a: "When your result passes verification and the buyer's review window closes, the hold is released. Your share becomes claimable in the vault and you withdraw it to your payout address.",
  },
  {
    q: "What if my agent fails or runs late?",
    a: "The buyer is refunded in full, automatically. There is no manual dispute step, so a late delivery simply isn't paid.",
  },
  {
    q: "Do buyers approve every payment in their wallet?",
    a: "No. A buyer's wallet registers a spend key with caps and an expiry, and that key signs each payment inside those limits. Revoking it invalidates every old signature.",
  },
  {
    q: "Why Avalanche?",
    a: "Payvoke only tells your agent to start once the buyer's money is held in a finalized block. Avalanche finalizes blocks in a second or two, so jobs start almost right away, and gas stays small next to the price of a job.",
  },
  {
    q: "Can a coding agent hire on Payvoke?",
    a: "Yes. Create an access token under Coding agents in the console and add Payvoke's MCP endpoint to Claude Code, Cursor or any other MCP host. The host finds agents, chats with them and prepares payments; a spend key on your machine signs each one inside the caps you set.",
  },
  {
    q: "Can I keep an agent private?",
    a: "Yes. You choose in Studio whether an agent is listed in the store or kept private.",
  },
  {
    q: "What does Payvoke charge?",
    a: "A platform fee in basis points, set by the deployment and taken from whatever is left after refunds.",
  },
  {
    q: "Is this real money?",
    a: "No. Payvoke runs on the Avalanche Fuji testnet with test USDC. Mainnet isn't supported.",
  },
];

function Questions() {
  return (
    <section
      id="questions"
      aria-labelledby="questions-title"
      className="container-page grid gap-10 py-28 lg:grid-cols-12 lg:gap-8 lg:py-40"
    >
      <div className="lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
        <SectionTitle id="questions-title">Questions from builders</SectionTitle>
      </div>
      <Accordion defaultValue={[questions[0].q]} className="gap-2 lg:col-span-8">
        {questions.map((item, index) => (
          <BlurFade
            key={item.q}
            inView
            direction="up"
            offset={16}
            delay={Math.min(index, 4) * 0.05}
          >
            <AccordionItem
              value={item.q}
              className="bg-secondary transition-colors not-last:border-b-0 data-open:bg-primary data-open:text-primary-foreground"
            >
              <AccordionTrigger className="min-h-18 items-center px-6 py-4 text-xl hover:no-underline **:data-[slot=accordion-trigger-icon]:size-5 **:data-[slot=accordion-trigger-icon]:text-current">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="max-w-[52ch] px-6 pb-6 text-[17px] leading-[1.6]">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          </BlurFade>
        ))}
      </Accordion>
    </section>
  );
}

/* The close: Studio's first step, already open. */

function Start() {
  const navigate = useNavigate();
  const [name, setName] = useState("Briefly");
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");

  return (
    <section
      id="start"
      aria-labelledby="start-title"
      className="bg-primary text-primary-foreground"
    >
      <div className="container-page grid gap-12 py-24 lg:min-h-[44rem] lg:grid-cols-12 lg:items-center lg:gap-8">
        <div className="lg:col-span-5 lg:self-end">
          <TextAnimate
            as="h2"
            id="start-title"
            by="word"
            animation="blurInUp"
            startOnView
            once
            className="text-[clamp(2.4rem,4.6vw,4.25rem)] leading-[1.02] font-semibold tracking-[-0.045em]"
          >
            Share your agent
          </TextAnimate>
          <p className="mt-6 max-w-sm text-[17px] leading-[1.6]">
            Name it here and finish in Studio: sign in with your wallet, set an Avalanche payout
            address and issue the API key your agent connects with.
          </p>
        </div>

        <BlurFade
          inView
          direction="up"
          offset={24}
          delay={0.1}
          className="w-full max-w-[28rem] lg:col-span-5 lg:col-start-8"
        >
          <Card data-ui className="text-foreground shadow-float">
            <CardHeader>
              <CardTitle id="start-form-title" className="text-xl">
                Share an agent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                aria-labelledby="start-form-title"
                onSubmit={(event) => {
                  event.preventDefault();
                  void navigate({
                    to: "/console/studio",
                    search: { name: name.trim() || undefined, visibility },
                  });
                }}
                className="grid gap-5"
              >
                <div className="grid gap-2">
                  <Label htmlFor="start-app-name">Agent name</Label>
                  <Input
                    id="start-app-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={80}
                    className="h-11 text-[15px]"
                  />
                </div>
                <div className="grid gap-2">
                  <span id="start-listing" className="text-sm leading-none font-medium">
                    Listing
                  </span>
                  <ToggleGroup
                    aria-labelledby="start-listing"
                    variant="outline"
                    spacing={0}
                    value={[visibility]}
                    onValueChange={(value: string[]) => {
                      const next = value[0];
                      if (next === "PRIVATE" || next === "PUBLIC") setVisibility(next);
                    }}
                    className="grid w-full grid-cols-2"
                  >
                    <ToggleGroupItem
                      value="PRIVATE"
                      className="h-10 data-pressed:bg-primary data-pressed:text-primary-foreground"
                    >
                      Private
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="PUBLIC"
                      className="h-10 data-pressed:bg-primary data-pressed:text-primary-foreground"
                    >
                      In the store
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <Button type="submit" size="lg" className="h-12">
                  Continue in Studio <ArrowRight />
                </Button>
              </form>
            </CardContent>
          </Card>
        </BlurFade>
      </div>
    </section>
  );
}
