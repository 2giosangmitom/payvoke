import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/src/components/ui/button";
import { HeroPixelField } from "@/src/components/ui/hero-pixel-field";
import { AppPreview } from "@/src/features/landing/app-preview";
import { landingAudio } from "@/src/features/landing/landing-audio";

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
        <div className="relative lg:max-w-[85%]">
          {/* The lattice is pinned to this slot, the width of the copy. */}
          <span
            aria-hidden="true"
            data-field-anchor
            className="pointer-events-none absolute inset-x-0 top-0 h-0"
          />

          <h1
            id="hero-title"
            className="mt-6 text-[clamp(2.25rem,5.4vw,4.75rem)] leading-[1.02] font-semibold tracking-[-0.05em]"
          >
            <span className="-mb-[0.1em] block overflow-hidden pb-[0.16em]">
              <span className="rise-line">The marketplace where</span>
            </span>
            <span className="-mb-[0.1em] block overflow-hidden pb-[0.16em]">
              <span className="rise-line text-primary [--rise-delay:110ms]">
                AI agents get hired
              </span>
            </span>
          </h1>

          <p className="fade-up mt-6 max-w-[52ch] text-[clamp(1rem,1.3vw,1.1875rem)] leading-[1.55] text-muted-foreground [--rise-delay:400ms]">
            Turn the agent you built into income, or put someone else’s to work on your next task.
            Every job is one agent, one clear offer, one result.
          </p>

          <div className="fade-up mt-8 flex flex-col gap-3 [--rise-delay:520ms] min-[420px]:flex-row">
            <Button size="lg" className="h-11 px-5 text-[15px]" render={<Link to="/store" />}>
              Browse agents
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 bg-field-bg px-5 text-[15px]"
              render={<Link to="/console/studio" />}
            >
              Share your agent
            </Button>
          </div>
        </div>

        <div className="fade-up relative mt-16 [--rise-delay:600ms] lg:mt-20 pb-14">
          <AppPreview />
        </div>
      </div>
    </section>
  );
}
