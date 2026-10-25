import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { NetworkAvalancheFuji, TokenUSDC } from "@web3icons/react";
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Landmark,
  MessageSquareText,
  ReceiptText,
  Search,
  Star,
} from "lucide-react";
import { motion, useInView, useScroll, useSpring, useTransform } from "motion/react";
import { LandingMusic } from "@/src/components/landing-music";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { AnimatedBeam } from "@/src/components/ui/animated-beam";
import { AnimatedShinyText } from "@/src/components/ui/animated-shiny-text";
import { Badge } from "@/src/components/ui/badge";
import { BlurFade } from "@/src/components/ui/blur-fade";
import { BorderBeam } from "@/src/components/ui/border-beam";
import { Button } from "@/src/components/ui/button";
import { HeroPixelField } from "@/src/components/ui/hero-pixel-field";
import { Marquee } from "@/src/components/ui/marquee";
import { ParticleText } from "@/src/components/ui/particle-text";
import { Reveal, RevealGroup, RevealItem } from "@/src/components/ui/reveal";
import { ScrollProgress } from "@/src/components/ui/scroll-progress";
import { AnimatedSpan, Terminal, TypingAnimation } from "@/src/components/ui/terminal";
import { TextAnimate } from "@/src/components/ui/text-animate";
import { TextReveal } from "@/src/components/ui/text-reveal";
import { useMediaQuery } from "@/src/hooks/use-media-query";
import { landingAudio } from "@/src/lib/landing-audio";
import { cn } from "@/src/lib/utils";

const exampleCommands = [
  "/summarize",
  "/review-pr",
  "/translate",
  "/clean-csv",
  "/extract-invoice",
  "/research",
  "/caption",
  "/explain-sql",
];

export function LandingPage() {
  return (
    <main>
      <ScrollProgress />
      <Hero />
      <CommandStrip />
      <TextReveal
        className="border-b border-border bg-background-deep"
        aside={<p className="mb-8 eyebrow">Why Payvoke exists</p>}
      >
        Someone builds a small tool. Someone else finds it, types a slash command, and pays a few
        cents for that one request. Payvoke is the store and the checkout in between.
      </TextReveal>
      <Journey />
      <RequestFlow />
      <Builders />
      <LandingMusic />
    </main>
  );
}

function Hero() {
  // The field can walk the analysed timeline before the sound is touched.
  useEffect(() => {
    landingAudio.prime();
  }, []);

  return (
    <section
      id="top"
      className="relative isolate flex min-h-[calc(100svh-4.5rem)] flex-col overflow-hidden bg-field-bg"
    >
      <HeroPixelField sample={(now) => landingAudio.sample(now)} />

      <div className="relative z-10 container-page flex flex-1 items-center justify-center pt-16 pb-36 sm:pt-20 sm:pb-40">
        <div className="flex w-full flex-col items-center text-center">
          <BlurFade delay={0.05}>
            <p className="mb-[clamp(1.25rem,4vh,2.6rem)] inline-flex items-center gap-2.5 border border-primary/40 bg-field-bg/85 px-3 py-1.5 font-mono text-[10px] tracking-wider sm:text-[11px]">
              <NetworkAvalancheFuji size={16} aria-hidden="true" />
              <AnimatedShinyText shimmerWidth={120}>BUILDING ON AVALANCHE FUJI</AnimatedShinyText>
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
            Small apps with slash commands, paid per request.
          </TextAnimate>
          <BlurFade delay={0.45}>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-pretty text-muted-foreground">
              Browse apps from independent builders, open a thread, and call their commands. Each
              request gets a fixed USDC quote that you approve first.
            </p>
          </BlurFade>
          <BlurFade
            delay={0.6}
            className="mt-8 flex w-full flex-col justify-center gap-3 min-[420px]:w-auto min-[420px]:flex-row"
          >
            <Button size="lg" render={<Link to="/store" />}>
              Browse the store <ArrowUpRight />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="bg-field-bg"
              render={<Link to="/dashboard" />}
            >
              Open Studio <ArrowRight />
            </Button>
          </BlurFade>
        </div>
      </div>
    </section>
  );
}

function CommandStrip() {
  return (
    <section
      aria-label="Example slash commands"
      className="relative border-b border-border bg-background py-3"
    >
      <Marquee pauseOnHover className="[--duration:36s] [--gap:2.5rem]">
        {exampleCommands.map((command) => (
          <span key={command} className="font-mono text-sm text-muted-foreground">
            <span className="text-primary">{command.slice(0, 1)}</span>
            {command.slice(1)}
          </span>
        ))}
      </Marquee>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-linear-to-r from-background to-transparent sm:w-24"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-linear-to-l from-background to-transparent sm:w-24"
      />
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid items-end gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12", className)}>
      <Reveal>
        <p className="mb-5 eyebrow">{eyebrow}</p>
        <h2 className="text-[clamp(2.1rem,4.4vw,4rem)] leading-[1.06] font-medium tracking-[-0.055em] text-balance">
          {title}
        </h2>
      </Reveal>
      {children && (
        <Reveal delay={0.12}>
          <p className="max-w-md text-base leading-7 text-muted-foreground lg:ml-auto">
            {children}
          </p>
        </Reveal>
      )}
    </div>
  );
}

/* ── Journey: what works today, told as a scroll ─────────────────────────── */

type Step = {
  id: string;
  label: string;
  title: string;
  body: string;
  status: "live" | "next";
  link?: { to: "/store" | "/chat" | "/dashboard"; label: string };
  preview: ReactNode;
};

const steps: Step[] = [
  {
    id: "explore",
    label: "Explore",
    title: "Search the store",
    body: "Search by name, read what each command takes as input, and see the price before you open a thread.",
    status: "live",
    link: { to: "/store", label: "Explore the store" },
    preview: (
      <>
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3 text-[13px] text-muted-foreground">
          <Search size={16} /> Find an app or command
          <kbd className="ml-auto font-mono text-[10px] text-faint">⌘ K</kbd>
        </div>
        {["Research apps", "Developer commands", "Data utilities"].map((category, index) => (
          <div
            key={category}
            className="flex items-center gap-3.5 border-b border-border px-4 py-2.5 text-[13px]"
          >
            <span className="font-mono text-[10px] text-primary">0{index + 1}</span>
            {category}
            <ArrowUpRight size={15} className="ml-auto text-primary" />
          </div>
        ))}
        <span className="block px-4 py-2 font-mono text-[9px] tracking-wider text-faint">
          ILLUSTRATIVE CATEGORIES
        </span>
      </>
    ),
  },
  {
    id: "save",
    label: "Save",
    title: "Star the apps you use",
    body: "Saved apps and threads belong to your wallet, so they follow you to any device you sign in from.",
    status: "live",
    link: { to: "/chat", label: "Open your threads" },
    preview: (
      <div className="grid gap-2 p-3.5">
        <span className="font-mono text-[9px] tracking-wider text-faint">SAVED APPS / EXAMPLE</span>
        {["Research brief", "Code review", "Data clean-up"].map((app, index) => (
          <div
            key={app}
            className="flex items-center gap-3 border border-border bg-card p-3.5 text-[13px]"
          >
            <Star size={16} className="shrink-0 text-primary" fill="currentColor" />
            {app}
            <small className="ml-auto font-mono text-faint">0{index + 1}</small>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "publish",
    label: "Publish",
    title: "Publish from Studio",
    body: "Create an app, write its commands and terms, and issue one API key for your worker. List it publicly or keep it private.",
    status: "live",
    link: { to: "/dashboard", label: "Open Studio" },
    preview: (
      <div className="p-4 font-mono">
        <div className="flex items-center justify-between text-[10px] tracking-wider text-faint">
          <span>EXAMPLE COMMAND</span>
          <span className="border border-border-strong px-1.5 py-1 text-primary">DRAFT</span>
        </div>
        <strong className="my-4 block text-[clamp(1.25rem,2.3vw,1.75rem)] font-medium">
          /summarize
        </strong>
        <div className="flex flex-wrap gap-1.5 text-[9px] tracking-wider text-muted-foreground">
          {["INPUT SCHEMA", "OUTPUT SCHEMA", "PRICE & TERMS"].map((item) => (
            <span key={item} className="bg-secondary px-2 py-1.5">
              {item}
            </span>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-1.5 border-t border-border pt-3 text-[10px] text-faint">
          App <ArrowRight size={12} /> Command <ArrowRight size={12} /> Store listing
        </div>
      </div>
    ),
  },
  {
    id: "pay",
    label: "Pay",
    title: "A fixed price per request",
    body: "Each command has its own USDC price. Payment runs through x402 and PayvokeVault on Avalanche Fuji. Execution and settlement are not live yet.",
    status: "next",
    preview: (
      <div className="flex items-center gap-3 p-4 font-mono text-primary">
        <TokenUSDC size={22} />
        <div className="grid min-w-0 gap-1">
          <span className="text-[9px] tracking-wider">PAY PER REQUEST</span>
          <strong className="text-[11px] font-medium text-foreground">USDC · FUJI TESTNET</strong>
        </div>
        <span className="ml-auto text-[9px] tracking-wider">PLANNED</span>
      </div>
    ),
  },
];

function Journey() {
  const section = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  // The rail fills while the steps column passes the middle of the screen.
  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start center", "end center"],
  });
  const fill = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });

  return (
    <section
      id="marketplace"
      ref={section}
      className="border-b border-border bg-background py-24 lg:py-32"
    >
      <div className="container-page grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div className="lg:sticky lg:top-20 lg:self-start lg:pt-16">
          <Reveal>
            <p className="mb-5 eyebrow">What works today</p>
            <h2 className="text-[clamp(2.1rem,4vw,3.6rem)] leading-[1.06] font-medium tracking-[-0.055em] text-balance">
              A store, a thread list, and a studio.
            </h2>
            <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
              Browsing, saving apps and publishing them in Studio all work now on testnet. Paid
              execution is the part still being finished.
            </p>
          </Reveal>

          <nav aria-label="Steps" className="relative mt-12 hidden pl-6 lg:block">
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-px bg-border" />
            <motion.span
              aria-hidden="true"
              style={{ scaleY: fill }}
              className="absolute inset-y-0 left-0 w-px origin-top bg-primary"
            />
            <ol className="grid gap-5">
              {steps.map((step, index) => (
                <li key={step.id}>
                  <a
                    href={`#step-${step.id}`}
                    aria-current={active === index ? "step" : undefined}
                    className="group flex items-baseline gap-4 text-muted-foreground transition-colors hover:text-foreground aria-[current=step]:text-foreground"
                  >
                    <span className="font-mono text-[11px] text-faint transition-colors group-aria-[current=step]:text-primary">
                      0{index + 1}
                    </span>
                    <span className="text-lg font-medium tracking-[-0.02em] transition-transform duration-300 group-aria-[current=step]:translate-x-1">
                      {step.label}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        <div>
          {steps.map((step, index) => (
            <JourneyStep
              key={step.id}
              step={step}
              index={index}
              onActive={() => setActive(index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function JourneyStep({
  step,
  index,
  onActive,
}: {
  step: Step;
  index: number;
  onActive: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  // "Current" is whichever step crosses the middle band of the viewport.
  const crossing = useInView(ref, { margin: "-45% 0px -45% 0px" });
  useEffect(() => {
    if (crossing) onActive();
  }, [crossing, onActive]);

  // The preview settles into place as the step scrolls up to the centre.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const scale = useTransform(scrollYProgress, [0, 1], [0.88, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [56, 0]);
  const opacity = useTransform(scrollYProgress, [0, 0.55], [0.15, 1]);

  return (
    <article
      id={`step-${step.id}`}
      ref={ref}
      className="flex scroll-mt-24 flex-col justify-center border-t border-border py-12 first:border-t-0 first:pt-0 lg:min-h-[80vh] lg:py-16 lg:first:pt-16"
    >
      <Reveal>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[11px] tracking-wider text-primary">
            0{index + 1} / {step.label.toUpperCase()}
          </span>
          <Badge
            variant="outline"
            className={cn(
              step.status === "live"
                ? "border-primary/50 text-primary"
                : "border-warning/50 text-warning",
            )}
          >
            {step.status === "live" ? "Live on testnet" : "In development"}
          </Badge>
        </div>
        <h3 className="mt-5 text-[clamp(1.7rem,3vw,2.5rem)] leading-tight font-medium tracking-[-0.045em]">
          {step.title}
        </h3>
        <p className="mt-3.5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          {step.body}
        </p>
        {step.link && (
          <Link
            to={step.link.to}
            className="group/link mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline hover:underline-offset-4"
          >
            {step.link.label}
            <ArrowUpRight
              size={16}
              aria-hidden="true"
              className="transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
            />
          </Link>
        )}
      </Reveal>
      <motion.div
        aria-hidden="true"
        style={{ scale, y, opacity }}
        // Scroll-linked transforms are not animations MotionConfig can skip,
        // so reduced motion pins them here.
        className="mt-8 max-w-xl origin-top-left border border-border bg-background-deep shadow-float motion-reduce:[opacity:1!important] motion-reduce:[transform:none!important]"
      >
        {step.preview}
      </motion.div>
    </article>
  );
}

/* ── How a paid request works ────────────────────────────────────────────── */

function FlowNode({
  ref,
  icon,
  label,
  detail,
  className,
}: {
  ref: React.Ref<HTMLDivElement>;
  icon: ReactNode;
  label: string;
  detail: string;
  className?: string;
}) {
  return (
    <RevealItem
      className={cn("relative z-10 flex flex-col items-center gap-2.5 text-center", className)}
      y={16}
    >
      <div
        ref={ref}
        className="grid size-14 place-items-center border border-border-strong bg-card text-primary shadow-float sm:size-16"
      >
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="font-mono text-[10px] tracking-wider text-faint">{detail}</p>
      </div>
    </RevealItem>
  );
}

function RequestFlow() {
  const container = useRef<HTMLDivElement>(null);
  const buyer = useRef<HTMLDivElement>(null);
  const quote = useRef<HTMLDivElement>(null);
  const vault = useRef<HTMLDivElement>(null);
  const app = useRef<HTMLDivElement>(null);
  // Phones lay the four steps out clockwise around a square, so the closing
  // beam runs straight up the left side instead of curving across the middle.
  const wide = useMediaQuery("(min-width: 640px)", true);

  return (
    <section
      id="how-it-works"
      className="overflow-x-clip border-b border-border bg-background-deep py-24 lg:py-32"
    >
      <div className="container-page">
        <SectionHeading
          eyebrow="How a paid request works · Fuji testnet"
          title="You approve the price before anything runs."
        >
          The app quotes a fixed USDC amount. A session key you authorized signs it, and
          PayvokeVault holds the money before the app starts. After the review window the app is
          paid, or the hold comes back to you if the delivery fails review.
        </SectionHeading>

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div ref={container} className="relative">
            <RevealGroup
              stagger={0.14}
              className="grid grid-cols-2 gap-x-6 gap-y-12 border border-border bg-background px-6 py-12 sm:grid-cols-4 sm:px-10"
            >
              <FlowNode
                ref={buyer}
                icon={<MessageSquareText strokeWidth={1.5} />}
                label="You"
                detail="THREAD"
              />
              <FlowNode
                ref={quote}
                icon={<ReceiptText strokeWidth={1.5} />}
                label="Quote"
                detail="FIXED USDC"
              />
              <FlowNode
                ref={vault}
                icon={<Landmark strokeWidth={1.5} />}
                label="PayvokeVault"
                detail="HOLDS FUNDS"
                className="max-sm:order-4"
              />
              <FlowNode
                ref={app}
                icon={<Boxes strokeWidth={1.5} />}
                label="App"
                detail="RUNS"
                className="max-sm:order-3"
              />
            </RevealGroup>
            <AnimatedBeam containerRef={container} fromRef={buyer} toRef={quote} duration={4} />
            <AnimatedBeam
              containerRef={container}
              fromRef={quote}
              toRef={vault}
              duration={4}
              delay={0.6}
            />
            <AnimatedBeam
              containerRef={container}
              fromRef={vault}
              toRef={app}
              duration={4}
              delay={1.2}
            />
            <AnimatedBeam
              containerRef={container}
              fromRef={app}
              toRef={buyer}
              curvature={wide ? -90 : 0}
              reverse
              duration={5}
              delay={2}
            />
          </div>

          <Reveal delay={0.15} x={32} y={0} className="min-w-0">
            <Terminal title="Example thread" className="shadow-float">
              <TypingAnimation className="text-primary">/summarize q3-report.pdf</TypingAnimation>
              <AnimatedSpan className="text-muted-foreground">
                Quote 0.05 USDC · due in 600s
              </AnimatedSpan>
              <AnimatedSpan>✓ Signed with your session key</AnimatedSpan>
              <AnimatedSpan>✓ 0.05 USDC held in PayvokeVault</AnimatedSpan>
              <AnimatedSpan>✓ Delivered · review window 1h</AnimatedSpan>
              <AnimatedSpan className="text-faint">
                Illustrative output, not a live run.
              </AnimatedSpan>
            </Terminal>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ── For builders ────────────────────────────────────────────────────────── */

const faqs = [
  {
    value: "publish",
    question: "How do I publish?",
    answer:
      "Create an app, add slash commands, pick a default command, then choose whether it shows up in the store.",
  },
  {
    value: "terms",
    question: "Can I set a price?",
    answer: "Yes. Each command has its own USDC price, delivery deadline and refund terms.",
  },
  {
    value: "next",
    question: "Are paid runs live?",
    answer: "Not yet. Execution and USDC settlement on Fuji are still in development.",
  },
];

function Builders() {
  return (
    <section id="providers" className="overflow-x-clip bg-card py-24 lg:py-32">
      <div className="container-page grid items-center gap-14 lg:grid-cols-2 lg:gap-24">
        <Reveal y={36}>
          <div className="relative overflow-hidden border border-border bg-background p-7 sm:p-10">
            <BorderBeam size={120} duration={9} />
            <p className="mb-5 eyebrow">For builders</p>
            <h2 className="text-[clamp(1.9rem,3.4vw,2.9rem)] leading-[1.1] font-medium tracking-[-0.045em] text-balance">
              Have a tool other people could use?
            </h2>
            <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
              Wrap it as an app with a few slash commands. You set the price and terms for each
              command, then list it in the store or keep it for your own threads.
            </p>
            <Button size="lg" className="mt-8" render={<Link to="/dashboard" />}>
              Open Studio <ArrowUpRight />
            </Button>
          </div>
        </Reveal>
        <RevealGroup stagger={0.1}>
          <Accordion>
            {faqs.map((faq) => (
              <RevealItem key={faq.value} x={24} y={0}>
                <AccordionItem value={faq.value} className="border-b border-border">
                  <AccordionTrigger className="py-6 text-lg font-semibold hover:text-primary hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-[15px] leading-7 text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              </RevealItem>
            ))}
          </Accordion>
        </RevealGroup>
      </div>
    </section>
  );
}
