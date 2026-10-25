import { useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { NetworkAvalancheFuji, TokenUSDC } from "@web3icons/react";
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  FolderOpen,
  Landmark,
  MessageSquareText,
  ReceiptText,
  Search,
  Star,
  Terminal as TerminalIcon,
  Wallet,
} from "lucide-react";
import { LandingMusic } from "@/src/components/landing-music";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { AnimatedBeam } from "@/src/components/ui/animated-beam";
import { AnimatedShinyText } from "@/src/components/ui/animated-shiny-text";
import { BlurFade } from "@/src/components/ui/blur-fade";
import { BorderBeam } from "@/src/components/ui/border-beam";
import { Button } from "@/src/components/ui/button";
import { HeroPixelField } from "@/src/components/ui/hero-pixel-field";
import { ParticleTextEffect } from "@/src/components/ui/interactive-text-particle";
import { MagicCard } from "@/src/components/ui/magic-card";
import { Marquee } from "@/src/components/ui/marquee";
import { ScrollProgress } from "@/src/components/ui/scroll-progress";
import { AnimatedSpan, Terminal, TypingAnimation } from "@/src/components/ui/terminal";
import { TextAnimate } from "@/src/components/ui/text-animate";
import { TextReveal } from "@/src/components/ui/text-reveal";
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
const catalogCategories = ["Research apps", "Developer commands", "Data utilities"];
const exampleSavedApps = ["Research brief", "Code review", "Data clean-up"];

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
      <Marketplace />
      <RequestFlow />
      <Builders />
      <LandingMusic />
    </main>
  );
}

function Hero() {
  return (
    <section
      id="top"
      className="relative isolate flex min-h-[calc(100svh-4.5rem)] flex-col overflow-hidden bg-field-bg dark:bg-[url(/images/payvoke-hero-field.webp)] dark:bg-cover dark:bg-center"
    >
      <HeroPixelField getAnalyser={landingAudio.analyser} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_50%_48%,var(--color-field-bg)_10%,transparent_75%)] opacity-80"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-linear-to-b from-field-bg/70 to-transparent"
      />

      <div className="relative z-10 container-page flex flex-1 items-center justify-center pt-20 pb-40">
        <div className="flex w-full flex-col items-center text-center">
          <BlurFade delay={0.05}>
            <p className="mb-[clamp(1.25rem,4vh,2.6rem)] inline-flex items-center gap-2.5 border border-primary/40 bg-field-bg/85 px-3 py-1.5 font-mono text-[11px] tracking-wider">
              <NetworkAvalancheFuji size={16} aria-hidden="true" />
              <AnimatedShinyText shimmerWidth={120}>BUILDING ON AVALANCHE FUJI</AnimatedShinyText>
            </p>
          </BlurFade>

          <div
            data-field-anchor
            aria-label="Payvoke"
            role="img"
            className="group relative h-[clamp(5.75rem,16vw,13.6rem)] w-full max-w-245 overflow-hidden"
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 grid place-items-center text-[clamp(3.4rem,13vw,10.4rem)] leading-none font-black tracking-[-0.075em] text-field-lit/50 transition-opacity duration-500 select-none group-data-ready:opacity-0"
            >
              PAYVOKE
            </span>
            <ParticleTextEffect
              text="PAYVOKE"
              particleDensity={4}
              className="relative block size-full"
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
            className="mt-6 max-w-3xl font-mono text-[clamp(1.3rem,2.7vw,2rem)] leading-snug font-medium tracking-[-0.045em] text-balance"
          >
            Small apps with slash commands, paid per request.
          </TextAnimate>
          <BlurFade delay={0.45}>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-pretty text-muted-foreground">
              Browse apps from independent builders, open a thread, and call their commands. Each
              request gets a fixed USDC quote that you approve first.
            </p>
          </BlurFade>
          <BlurFade delay={0.6} className="mt-8 flex flex-wrap justify-center gap-3">
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
        className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-linear-to-r from-background to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-linear-to-l from-background to-transparent"
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
      <BlurFade inView>
        <p className="mb-5 eyebrow">{eyebrow}</p>
        <h2 className="text-[clamp(2.2rem,4.4vw,4rem)] leading-[1.06] font-medium tracking-[-0.055em] text-balance">
          {title}
        </h2>
      </BlurFade>
      {children && (
        <BlurFade inView delay={0.1}>
          <p className="max-w-md text-base leading-7 text-muted-foreground lg:ml-auto">
            {children}
          </p>
        </BlurFade>
      )}
    </div>
  );
}

function FeatureCard({
  index,
  icon,
  title,
  children,
  link,
  preview,
  className,
  delay = 0,
}: {
  index: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
  link?: ReactNode;
  preview: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <BlurFade inView delay={delay} className={cn("min-w-0", className)}>
      <MagicCard className="h-full min-h-108 p-7 sm:p-8">
        <div className="flex items-center justify-between gap-4 text-primary">
          <span className="font-mono text-[11px] tracking-wider">{index}</span>
          {icon}
        </div>
        <div className="mt-6 mb-7">
          <h3 className="max-w-lg text-[clamp(1.55rem,2.6vw,2.1rem)] leading-tight font-medium tracking-[-0.045em]">
            {title}
          </h3>
          <p className="mt-3.5 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
            {children}
          </p>
          {link}
        </div>
        <div aria-hidden="true" className="mt-auto min-w-0 border border-border bg-background-deep">
          {preview}
        </div>
      </MagicCard>
    </BlurFade>
  );
}

function CardLink({
  children,
  ...props
}: {
  children: ReactNode;
  to: "/store" | "/chat" | "/dashboard";
}) {
  return (
    <Link
      {...props}
      className="group/link mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline hover:underline-offset-4"
    >
      {children}
      <ArrowUpRight
        size={16}
        aria-hidden="true"
        className="transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
      />
    </Link>
  );
}

function Marketplace() {
  return (
    <section id="marketplace" className="border-b border-border bg-background py-24 lg:py-32">
      <div className="container-page">
        <SectionHeading eyebrow="What works today" title="A store, a thread list, and a studio.">
          Browsing, saving apps and publishing them in Studio all work now on testnet. Paid
          execution is the part still being finished.
        </SectionHeading>

        <div className="mt-12 grid gap-4 lg:grid-cols-12">
          <FeatureCard
            className="lg:col-span-7"
            index="01 / EXPLORE"
            icon={<Search size={22} strokeWidth={1.5} aria-hidden="true" />}
            title="Search the store"
            link={<CardLink to="/store">Explore the store</CardLink>}
            preview={
              <>
                <div className="flex items-center gap-2.5 border-b border-border px-4 py-3 text-[13px] text-muted-foreground">
                  <Search size={16} /> Find an app or command
                  <kbd className="ml-auto font-mono text-[10px] text-faint">⌘ K</kbd>
                </div>
                {catalogCategories.map((category, index) => (
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
            }
          >
            Search by name, read what each command takes as input, and see the price before you open
            a thread.
          </FeatureCard>

          <FeatureCard
            className="lg:col-span-5"
            delay={0.08}
            index="02 / SAVE"
            icon={<FolderOpen size={22} strokeWidth={1.5} aria-hidden="true" />}
            title="Star the apps you use"
            link={<CardLink to="/chat">Open your threads</CardLink>}
            preview={
              <div className="grid gap-2 p-3.5">
                <span className="font-mono text-[9px] tracking-wider text-faint">
                  SAVED APPS / EXAMPLE
                </span>
                {exampleSavedApps.map((app, index) => (
                  <div
                    key={app}
                    className="flex items-center gap-3 border border-border bg-card p-3.5 text-[13px]"
                  >
                    <Star size={16} className="shrink-0 text-primary" />
                    {app}
                    <small className="ml-auto font-mono text-faint">0{index + 1}</small>
                  </div>
                ))}
              </div>
            }
          >
            Saved apps and threads belong to your wallet, so they follow you to any device you sign
            in from.
          </FeatureCard>

          <FeatureCard
            className="lg:col-span-7"
            index="03 / PUBLISH"
            icon={<TerminalIcon size={22} strokeWidth={1.5} aria-hidden="true" />}
            title="Publish from Studio"
            link={<CardLink to="/dashboard">Open Studio</CardLink>}
            preview={
              <div className="p-4 font-mono">
                <div className="flex items-center justify-between text-[10px] tracking-wider text-faint">
                  <span>EXAMPLE COMMAND</span>
                  <span className="border border-border-strong px-1.5 py-1 text-primary">
                    DRAFT
                  </span>
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
            }
          >
            Create an app, write its commands and terms, and issue one API key for your worker. List
            it publicly or keep it private.
          </FeatureCard>

          <FeatureCard
            className="lg:col-span-5"
            delay={0.08}
            index="NEXT / IN DEVELOPMENT"
            icon={<Wallet size={22} strokeWidth={1.5} aria-hidden="true" />}
            title="A fixed price per request"
            preview={
              <div className="flex items-center gap-3 p-4 font-mono text-primary">
                <TokenUSDC size={22} />
                <div className="grid min-w-0 gap-1">
                  <span className="text-[9px] tracking-wider">PAY PER REQUEST</span>
                  <strong className="text-[11px] font-medium text-foreground">
                    USDC · FUJI TESTNET
                  </strong>
                </div>
                <span className="ml-auto text-[9px] tracking-wider">PLANNED</span>
              </div>
            }
          >
            Each command has its own USDC price. Payment runs through x402 and PayvokeVault on
            Avalanche Fuji. Execution and settlement are not live yet.
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

function FlowNode({
  ref,
  icon,
  label,
  detail,
}: {
  ref: React.Ref<HTMLDivElement>;
  icon: ReactNode;
  label: string;
  detail: string;
}) {
  return (
    <div className="relative z-10 flex flex-col items-center gap-2.5 text-center">
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
    </div>
  );
}

function RequestFlow() {
  const container = useRef<HTMLDivElement>(null);
  const buyer = useRef<HTMLDivElement>(null);
  const quote = useRef<HTMLDivElement>(null);
  const vault = useRef<HTMLDivElement>(null);
  const app = useRef<HTMLDivElement>(null);

  return (
    <section id="how-it-works" className="border-b border-border bg-background-deep py-24 lg:py-32">
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
          <BlurFade inView>
            <div
              ref={container}
              className="relative grid grid-cols-2 gap-x-6 gap-y-12 border border-border bg-background px-6 py-12 sm:grid-cols-4 sm:px-10"
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
              />
              <FlowNode ref={app} icon={<Boxes strokeWidth={1.5} />} label="App" detail="RUNS" />
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
                curvature={-90}
                reverse
                duration={5}
                delay={2}
              />
            </div>
          </BlurFade>

          <BlurFade inView delay={0.1} className="min-w-0">
            <Terminal title="Example thread" className="shadow-float">
              <TypingAnimation className="text-primary">/summarize q3-report.pdf</TypingAnimation>
              <AnimatedSpan className="text-muted-foreground">
                Quote 0.05 USDC · delivery within 600s
              </AnimatedSpan>
              <AnimatedSpan>✓ Signed with your session key</AnimatedSpan>
              <AnimatedSpan>✓ 0.05 USDC held in PayvokeVault</AnimatedSpan>
              <AnimatedSpan>✓ Delivered · review window 1h</AnimatedSpan>
              <AnimatedSpan className="text-faint">
                Illustrative output, not a live run.
              </AnimatedSpan>
            </Terminal>
          </BlurFade>
        </div>
      </div>
    </section>
  );
}

function Builders() {
  return (
    <section id="providers" className="bg-card py-24 lg:py-32">
      <div className="container-page grid items-center gap-14 lg:grid-cols-2 lg:gap-24">
        <BlurFade inView>
          <div className="relative overflow-hidden border border-border bg-background p-8 sm:p-10">
            <BorderBeam size={120} duration={9} />
            <p className="mb-5 eyebrow">For builders</p>
            <h2 className="text-[clamp(2rem,3.4vw,2.9rem)] leading-[1.1] font-medium tracking-[-0.045em] text-balance">
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
        </BlurFade>
        <BlurFade inView delay={0.1}>
          <Accordion>
            <AccordionItem value="publish" className="border-b border-border">
              <AccordionTrigger className="py-6 text-lg font-semibold hover:text-primary hover:no-underline">
                How do I publish?
              </AccordionTrigger>
              <AccordionContent className="text-[15px] leading-7 text-muted-foreground">
                Create an app, add slash commands, pick a default command, then choose whether it
                shows up in the store.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="terms" className="border-b border-border">
              <AccordionTrigger className="py-6 text-lg font-semibold hover:text-primary hover:no-underline">
                Can I set a price?
              </AccordionTrigger>
              <AccordionContent className="text-[15px] leading-7 text-muted-foreground">
                Yes. Each command has its own USDC price, delivery deadline and refund terms.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="next" className="border-b border-border">
              <AccordionTrigger className="py-6 text-lg font-semibold hover:text-primary hover:no-underline">
                Are paid runs live?
              </AccordionTrigger>
              <AccordionContent className="text-[15px] leading-7 text-muted-foreground">
                Not yet. Execution and USDC settlement on Fuji are still in development.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </BlurFade>
      </div>
    </section>
  );
}
