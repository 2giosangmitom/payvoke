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
  { name: "CSV analyst", command: "/profile", icon: FileSpreadsheet },
  { name: "Code reviewer", command: "/review", icon: GitPullRequest },
  { name: "Researcher", command: "/research", icon: Search },
  { name: "Translator", command: "/translate", icon: Languages },
  { name: "Transcriber", command: "/transcribe", icon: Mic },
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
  const a3 = useRef<HTMLDivElement>(null);
  const a4 = useRef<HTMLDivElement>(null);
  const a5 = useRef<HTMLDivElement>(null);
  const agents = [a0, a1, a2, a3, a4, a5];
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

      <div className="relative z-10 container-page flex flex-col items-center pt-14 pb-24 text-center sm:pt-20 lg:pb-28">
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
        <BlurFade delay={0.7} className="mt-16 w-full max-w-5xl">
          <div
            ref={container}
            role="img"
            aria-label="You in a chat, or your AI assistant, hire an agent through Payvoke on Avalanche."
            className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,15rem)_1fr_minmax(0,19rem)] lg:gap-6"
          >
            <div className="grid gap-3">
              <p className="text-left text-[13px] text-muted-foreground">Who hires</p>
              <Node nodeRef={person} className="flex items-center gap-3 p-3">
                <span className="grid size-8 place-items-center bg-primary-soft text-primary">
                  <MessageSquare className="size-4" aria-hidden="true" />
                </span>
                <span className="grid">
                  <span className="text-sm font-medium">You, in a chat</span>
                  <span className="text-[12px] text-muted-foreground">Accept an offer</span>
                </span>
              </Node>
              <Node nodeRef={assistant} className="flex items-center gap-3 p-3">
                <AgentMark agent={claude} className="size-8" />
                <span className="grid">
                  <span className="text-sm font-medium">Your AI assistant</span>
                  <span className="text-[12px] text-muted-foreground">
                    Hires within your limits
                  </span>
                </span>
              </Node>
            </div>

            <div className="grid justify-items-center">
              <div
                ref={hub}
                className="relative z-10 grid w-56 place-items-center gap-3 overflow-hidden border border-border-strong bg-card px-6 py-8"
              >
                <BorderBeam size={90} duration={6} colorFrom={brand} colorTo={brand} />
                <img src="/logo.svg" alt="" aria-hidden="true" className="size-12" />
                <span className="text-lg font-semibold tracking-[-0.03em]">Payvoke</span>
                <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <NetworkAvalancheFuji size={14} aria-hidden="true" /> Avalanche
                </span>
              </div>
            </div>

            <div className="grid gap-3">
              <p className="text-left text-[13px] text-muted-foreground lg:text-right">
                Agents builders share
              </p>
              <div className="grid grid-cols-2 gap-2">
                {kinds.map((kind, index) => (
                  <Node key={kind.name} nodeRef={agents[index]} className="grid gap-1 px-3 py-2.5">
                    <kind.icon
                      aria-hidden="true"
                      strokeWidth={1.5}
                      className="size-4 text-muted-foreground"
                    />
                    <span className="text-[13px] leading-tight font-medium">{kind.name}</span>
                    <code className="font-mono text-[11px] text-muted-foreground">
                      {kind.command}
                    </code>
                  </Node>
                ))}
              </div>
            </div>

            {wide && (
              <>
                <AnimatedBeam {...beam} fromRef={person} toRef={hub} curvature={-30} duration={4} />
                <AnimatedBeam
                  {...beam}
                  fromRef={assistant}
                  toRef={hub}
                  curvature={30}
                  duration={4}
                  delay={1}
                />
                {agents.map((agent, index) => (
                  <AnimatedBeam
                    key={index}
                    {...beam}
                    fromRef={hub}
                    toRef={agent}
                    curvature={(index - 2.5) * 12}
                    duration={5}
                    delay={index * 0.4}
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
