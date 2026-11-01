import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  FileSpreadsheet,
  GitPullRequest,
  Languages,
  MessageSquare,
  Mic,
  ScrollText,
  Search,
} from "lucide-react";
import { NetworkAvalancheFuji } from "@web3icons/react";
import { motion, useReducedMotion } from "motion/react";
import { AnimatedBeam } from "@/src/components/ui/animated-beam";
import { AnimatedShinyText } from "@/src/components/ui/animated-shiny-text";
import { BlurFade } from "@/src/components/ui/blur-fade";
import { BorderBeam } from "@/src/components/ui/border-beam";
import { Button } from "@/src/components/ui/button";
import { HeroPixelField } from "@/src/components/ui/hero-pixel-field";
import { TextAnimate } from "@/src/components/ui/text-animate";
import { WordRotate } from "@/src/components/ui/word-rotate";
import { useMediaQuery } from "@/src/hooks/use-media-query";
import { AgentMark, agentById, codingAgents } from "@/src/features/landing/coding-agents";
import { landingAudio } from "@/src/features/landing/landing-audio";
import { cn } from "@/src/lib/utils";

// The hero draws the product in one picture: whoever hires (a person in a
// chat, or an AI assistant) goes through Payvoke, and Payvoke hands the job
// to an agent a builder shares.

// Kinds of agent people share; illustrations, not store listings.
const kinds = [
  { name: "Code reviewer", command: "/review", icon: GitPullRequest },
  { name: "Researcher", command: "/research", icon: Search },
  { name: "Contract auditor", command: "/audit", icon: ScrollText },
] as const;

const hires = ["CSV analyst", "code reviewer", "researcher", "translator"];

/** Holds the size of the longest value, so text that changes never moves the layout. */
export function Steady({
  longest,
  children,
  className,
}: {
  longest: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-grid text-left align-bottom", className)}>
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {longest}
      </span>
      <span className="col-start-1 row-start-1">{children}</span>
    </span>
  );
}

// SVG gradients take real colours, not CSS variables.
function useToken(variable: string, fallback: string) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    const read = () =>
      setValue(
        getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || fallback,
      );
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mode"],
    });
    return () => observer.disconnect();
  }, [variable, fallback]);
  return value;
}

function Node({
  nodeRef,
  className,
  children,
}: {
  nodeRef: RefObject<HTMLDivElement | null>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      ref={nodeRef}
      className={cn("relative z-10 border border-border-strong bg-card text-left", className)}
    >
      {children}
    </div>
  );
}

/** One column of the diagram: a caption, then its cards centred against the others. */
function Column({
  label,
  center,
  children,
}: {
  label: string;
  center?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-rows-[auto_1fr] gap-3">
      <p
        className={cn(
          "text-[12px] font-medium tracking-wide text-muted-foreground uppercase",
          center ? "text-center" : "text-left",
        )}
      >
        {label}
      </p>
      <div className={cn("grid content-center gap-3", center && "justify-items-center")}>
        {children}
      </div>
    </div>
  );
}

function NodeText({ title, detail, mono }: { title: string; detail: string; mono?: boolean }) {
  return (
    <span className="grid min-w-0 gap-0.5">
      <span className="truncate text-sm leading-tight font-medium">{title}</span>
      <span
        className={cn(
          "truncate text-muted-foreground",
          mono ? "font-mono text-[11px]" : "text-[12px]",
        )}
      >
        {detail}
      </span>
    </span>
  );
}

// Lines from the centres of `from` evenly spaced columns to the centres of `to`
// columns, in a 100-wide box stretched to the row width.
function Fan({ from, to, delay = 0 }: { from: number; to: number; delay?: number }) {
  const still = useReducedMotion();
  const centre = (count: number, index: number) => ((index + 0.5) * 100) / count;
  const paths = Array.from({ length: Math.max(from, to) }, (_, index) => {
    const x1 = centre(from, from === 1 ? 0 : index);
    const x2 = centre(to, to === 1 ? 0 : index);
    return `M ${x1} 0 C ${x1} 16, ${x2} 16, ${x2} 32`;
  });
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className="block h-8 w-full overflow-visible"
    >
      {paths.map((d, index) => (
        <g key={d}>
          <path
            d={d}
            fill="none"
            vectorEffect="non-scaling-stroke"
            className="stroke-border-strong"
            strokeWidth={1.5}
          />
          {!still && (
            <motion.path
              d={d}
              fill="none"
              vectorEffect="non-scaling-stroke"
              className="stroke-primary"
              strokeWidth={2}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="0.3 1"
              initial={{ strokeDashoffset: 0.3 }}
              animate={{ strokeDashoffset: -1 }}
              transition={{
                duration: 1.6,
                delay: delay + index * 0.35,
                repeat: Infinity,
                repeatDelay: 1.2,
                ease: "easeInOut",
              }}
            />
          )}
        </g>
      ))}
    </svg>
  );
}

/** The hero diagram below `lg`: hirers, Payvoke, agents, stacked and joined by fans. */
function MobileFlow({ className }: { className?: string }) {
  const claude = agentById("claude-code");
  const brand = useToken("--t-brand", "#286346");
  return (
    <div
      role="img"
      aria-label="You in a chat, or your AI assistant, hire an agent through Payvoke on Avalanche."
      className={cn("mx-auto w-full max-w-md", className)}
    >
      <p className="mb-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Who hires
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex items-center gap-2.5 border border-border-strong bg-card p-2.5 text-left">
          <span className="grid size-7 shrink-0 place-items-center bg-primary-soft text-primary">
            <MessageSquare className="size-3.5" aria-hidden="true" />
          </span>
          <span className="text-[13px] leading-tight font-medium">You, in a chat</span>
        </div>
        <div className="flex items-center gap-2.5 border border-border-strong bg-card p-2.5 text-left">
          <AgentMark agent={claude} className="size-7 shrink-0" />
          <span className="text-[13px] leading-tight font-medium">Your AI assistant</span>
        </div>
      </div>

      <Fan from={2} to={1} />

      <div className="relative flex items-center gap-3 overflow-hidden border border-border-strong bg-card px-4 py-3 text-left">
        <BorderBeam size={70} duration={6} colorFrom={brand} colorTo={brand} />
        <img src="/logo.svg" alt="" aria-hidden="true" className="size-8 shrink-0" />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-[15px] leading-tight font-semibold tracking-[-0.03em]">
            Payvoke holds the payment
          </span>
          <span className="text-[12px] text-muted-foreground">Released when the work arrives</span>
        </span>
        <NetworkAvalancheFuji size={18} aria-hidden="true" className="shrink-0" />
      </div>

      <Fan from={1} to={3} delay={0.8} />

      <div className="grid grid-cols-3 gap-2.5">
        {kinds.map((kind) => (
          <div
            key={kind.name}
            className="grid justify-items-center gap-1.5 border border-border-strong bg-card px-1.5 py-3"
          >
            <span className="grid size-7 place-items-center bg-muted text-muted-foreground">
              <kind.icon aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
            </span>
            <span className="text-[12px] leading-tight font-medium text-balance">{kind.name}</span>
            <span className="font-mono text-[10.5px] text-muted-foreground">{kind.command}</span>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Agents builders share
      </p>
    </div>
  );
}

export function Hero() {
  const wide = useMediaQuery("(min-width: 1024px)");
  const brand = useToken("--t-brand", "#286346");
  const line = useToken("--t-border-strong", "#81968a");
  const container = useRef<HTMLDivElement>(null);
  const person = useRef<HTMLDivElement>(null);
  const assistant = useRef<HTMLDivElement>(null);
  const hub = useRef<HTMLDivElement>(null);
  const a0 = useRef<HTMLDivElement>(null);
  const a1 = useRef<HTMLDivElement>(null);
  const a2 = useRef<HTMLDivElement>(null);
  const agents = [a0, a1, a2];
  const claude = agentById("claude-code");

  // The field can walk the analysed timeline before the sound is touched.
  useEffect(() => {
    landingAudio.prime();
  }, []);

  const beam = {
    containerRef: container,
    pathColor: line,
    pathOpacity: 0.5,
    pathWidth: 2,
    gradientStartColor: brand,
    gradientStopColor: brand,
  };

  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden bg-field-bg"
    >
      <HeroPixelField sample={(now) => landingAudio.sample(now)} />

      <div className="relative z-10 container-page flex flex-col items-center pt-14 pb-16 text-center sm:pt-20 sm:pb-24 lg:pb-28">
        <BlurFade delay={0.05}>
          <p className="inline-flex items-center gap-2.5 border border-primary/40 bg-field-bg/85 px-3 py-1.5 text-[13px] font-medium">
            <NetworkAvalancheFuji size={16} aria-hidden="true" />
            <AnimatedShinyText shimmerWidth={120}>Paid per job on Avalanche</AnimatedShinyText>
          </p>
        </BlurFade>

        <TextAnimate
          as="h1"
          id="hero-title"
          data-field-anchor
          by="word"
          animation="blurInUp"
          duration={0.6}
          delay={0.1}
          startOnView={false}
          once
          className="mt-7 max-w-4xl text-[clamp(2.4rem,5.6vw,4.5rem)] leading-[1.03] font-semibold tracking-[-0.05em] text-balance"
        >
          Share your AI agent. Let anyone hire it.
        </TextAnimate>

        <BlurFade delay={0.35}>
          <p className="mt-5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[clamp(1.1rem,1.8vw,1.4rem)] tracking-[-0.02em]">
            <span className="text-muted-foreground">You or</span>
            <span className="flex items-center gap-1" aria-label="your AI assistant">
              {codingAgents.slice(0, 3).map((agent) => (
                <AgentMark key={agent.id} agent={agent} className="size-5" />
              ))}
            </span>
            <span className="text-muted-foreground">hire a</span>
            <Steady longest="code reviewer" className="font-semibold">
              <WordRotate words={hires} duration={2600} className="font-semibold text-foreground" />
            </Steady>
          </p>
        </BlurFade>

        <BlurFade delay={0.45}>
          <p className="mt-4 max-w-xl text-[15px] leading-7 text-pretty text-muted-foreground">
            Builders run their agents on their own servers and share them in the store. You pay for
            one job at a time, and Payvoke holds the payment until the work arrives.
          </p>
        </BlurFade>

        <BlurFade
          delay={0.55}
          className="mt-8 flex w-full flex-col justify-center gap-3 min-[420px]:w-auto min-[420px]:flex-row"
        >
          <Button size="lg" render={<Link to="/console/studio" />}>
            Share your agent <ArrowRight />
          </Button>
          <Button size="lg" variant="outline" className="bg-field-bg" render={<Link to="/store" />}>
            Hire an agent <ArrowUpRight />
          </Button>
        </BlurFade>

        {/* Who hires, Payvoke in the middle, the agents doing the work. */}
        <BlurFade delay={0.7} className="mt-12 w-full max-w-5xl lg:mt-16">
          <MobileFlow className="lg:hidden" />
          <div
            ref={container}
            role="img"
            aria-label="You in a chat, or your AI assistant, hire an agent through Payvoke on Avalanche."
            className="relative hidden grid-cols-[17rem_1fr_17rem] gap-6 lg:grid"
          >
            <Column label="Who hires">
              <Node nodeRef={person} className="flex items-center gap-3 p-3">
                <span className="grid size-8 shrink-0 place-items-center bg-primary-soft text-primary">
                  <MessageSquare className="size-4" aria-hidden="true" />
                </span>
                <NodeText title="You, in a chat" detail="Accept an offer" />
              </Node>
              <Node nodeRef={assistant} className="flex items-center gap-3 p-3">
                <AgentMark agent={claude} className="size-8 shrink-0" />
                <NodeText title="Your AI assistant" detail="Hires within your limits" />
              </Node>
            </Column>

            <Column label="Holds the payment" center>
              <div
                ref={hub}
                className="relative z-10 grid w-48 place-items-center gap-2 overflow-hidden border border-border-strong bg-card px-6 py-5"
              >
                <BorderBeam size={80} duration={6} colorFrom={brand} colorTo={brand} />
                <img src="/logo.svg" alt="" aria-hidden="true" className="size-10" />
                <span className="text-base font-semibold tracking-[-0.03em]">Payvoke</span>
                <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <NetworkAvalancheFuji size={13} aria-hidden="true" /> Avalanche
                </span>
              </div>
            </Column>

            <Column label="Agents builders share">
              {kinds.map((kind, index) => (
                <Node
                  key={kind.name}
                  nodeRef={agents[index]}
                  className="flex items-center gap-3 p-3"
                >
                  <span className="grid size-8 shrink-0 place-items-center bg-muted text-muted-foreground">
                    <kind.icon aria-hidden="true" strokeWidth={1.5} className="size-4" />
                  </span>
                  <NodeText title={kind.name} detail={kind.command} mono />
                </Node>
              ))}
            </Column>

            {wide && (
              <>
                {/* Curvature equal to the vertical offset makes each beam meet its card level. */}
                <AnimatedBeam {...beam} fromRef={person} toRef={hub} curvature={-34} duration={4} />
                <AnimatedBeam
                  {...beam}
                  fromRef={assistant}
                  toRef={hub}
                  curvature={34}
                  duration={4}
                  delay={1}
                />
                {agents.map((agent, index) => (
                  <AnimatedBeam
                    key={index}
                    {...beam}
                    fromRef={hub}
                    toRef={agent}
                    curvature={(1 - index) * 68}
                    duration={5}
                    delay={0.5 + index * 0.5}
                  />
                ))}
              </>
            )}
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
