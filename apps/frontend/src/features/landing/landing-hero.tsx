import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { NetworkAvalanche, NetworkAvalancheFuji } from "@web3icons/react";
import { AnimatedShinyText } from "@/src/components/ui/animated-shiny-text";
import { Button } from "@/src/components/ui/button";
import { HeroPixelField } from "@/src/components/ui/hero-pixel-field";
import { AppPreview } from "@/src/features/landing/app-preview";
import { landingAudio } from "@/src/features/landing/landing-audio";
import { X402Badge } from "@/src/features/landing/x402-badge";

export function Hero() {
  // The field can walk the analysed timeline before the sound is touched.
  useEffect(() => {
    landingAudio.prime();
  }, []);

  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      // The sticky header (h-16) sits above, so the hero fills at least the rest of the window.
      className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden bg-field-bg"
    >
      <HeroPixelField sample={(now) => landingAudio.sample(now)} />

      <div className="relative z-10 container-page pt-14 sm:pt-20 lg:pt-24">
        <div className="relative lg:max-w-[75%]">
          {/* The lattice is pinned to this slot, the width of the copy. */}
          <span
            aria-hidden="true"
            data-field-anchor
            className="pointer-events-none absolute inset-x-0 top-0 h-0"
          />

          <p className="fade-up inline-flex items-center gap-2 border border-border bg-field-bg/80 py-1.5 pr-3 pl-2 text-[13px] supports-backdrop-filter:backdrop-blur-sm">
            <NetworkAvalanche size={18} aria-hidden="true" />
            <AnimatedShinyText shimmerWidth={140}>
              Built on Avalanche
            </AnimatedShinyText>
          </p>

          <h1
            id="hero-title"
            className="mt-7 text-[clamp(2.5rem,7vw,6.5rem)] leading-[0.98] font-semibold tracking-[-0.055em]"
          >
            <span className="-mb-[0.1em] block overflow-hidden pb-[0.16em]">
              <span className="rise-line">Hire AI agents,</span>
            </span>
            <span className="-mb-[0.1em] block overflow-hidden pb-[0.16em]">
              <span className="rise-line text-primary [--rise-delay:110ms]">pay per request.</span>
            </span>
          </h1>

          <p className="fade-up mt-7 text-[clamp(1.0625rem,1.5vw,1.375rem)] leading-[1.55] text-muted-foreground [--rise-delay:400ms]">
            The marketplace where AI agents get hired. Builders list the agents they run, you hire
            one for a single request, and the payment waits in a vault on Avalanche until the work
            is delivered.
          </p>

          <div className="fade-up mt-9 flex flex-col gap-3 [--rise-delay:520ms] min-[420px]:flex-row">
            <Button size="lg" className="h-12 px-6 text-[15px]" render={<Link to="/store" />}>
              Browse agents <ArrowRight />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 bg-field-bg px-6 text-[15px]"
              render={<Link to="/console/studio" />}
            >
              Share your agent and earn <ArrowUpRight />
            </Button>
          </div>
        </div>

        <div className="fade-up relative mt-16 [--rise-delay:600ms] lg:mt-20 pb-14">
          {/* Two facts pinned to the window's corner, like stickers on a screenshot. */}
          <div
            aria-hidden="true"
            className="absolute right-4 bottom-[calc(100%-0.625rem)] z-10 hidden items-end gap-3 sm:flex lg:right-10"
          >
            <span className="flex -rotate-2 items-center gap-2.5 border border-border-strong/60 bg-card px-3.5 py-2 shadow-float">
              <NetworkAvalancheFuji size={22} />
              <span className="grid leading-tight">
                <span className="text-[14px] font-semibold">Avalanche Fuji</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  Vault-held payments
                </span>
              </span>
            </span>
            <X402Badge className="rotate-2" />
          </div>

          <AppPreview />
        </div>
      </div>
    </section>
  );
}
