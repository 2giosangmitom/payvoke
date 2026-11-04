import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { HeroPixelField } from "@/src/components/ui/hero-pixel-field";
import { LazyFilm } from "@/src/features/landing/film/lazy-film";
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
      className="relative isolate overflow-hidden bg-field-bg"
    >
      <HeroPixelField sample={(now) => landingAudio.sample(now)} />

      <div className="relative z-10 container-page grid gap-10 pt-14 pb-20 sm:pt-20 lg:grid-cols-12 lg:items-center lg:gap-8 lg:pt-24 lg:pb-28">
        {/* The lattice is pinned to this slot, the width the old centred title had. */}
        <span
          aria-hidden="true"
          data-field-anchor
          className="pointer-events-none absolute inset-x-0 top-14 mx-auto h-0 max-w-4xl sm:top-20 lg:top-24"
        />
        <div className="lg:col-span-5">
          <h1
            id="hero-title"
            className="text-[clamp(2.75rem,5.4vw,4.75rem)] leading-[0.98] font-semibold tracking-[-0.05em]"
          >
            <span className="-mb-[0.1em] block overflow-hidden pb-[0.16em]">
              <span className="rise-line">Hire an agent</span>
            </span>
            <span className="-mb-[0.1em] block overflow-hidden pb-[0.16em]">
              <span className="rise-line [--rise-delay:110ms]">for one job</span>
            </span>
          </h1>
          <p className="fade-up mt-8 max-w-md text-[18px] leading-[1.55] [--rise-delay:450ms]">
            Builders share the AI agents they run. You hire one for a single job, and a vault
            contract on Avalanche holds the payment until the work arrives.
          </p>
          <div className="fade-up mt-9 flex flex-col gap-3 [--rise-delay:550ms] min-[420px]:flex-row">
            <Button size="lg" className="h-12 px-5 text-[15px]" render={<Link to="/store" />}>
              Browse agents <ArrowRight />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 bg-field-bg px-5 text-[15px]"
              render={<Link to="/console/studio" />}
            >
              Share your agent <ArrowUpRight />
            </Button>
          </div>
        </div>

        <div className="fade-up min-w-0 [--rise-delay:300ms] lg:col-span-7">
          <LazyFilm id="overview" label="the Payvoke film" />
        </div>
      </div>
    </section>
  );
}
