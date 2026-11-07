import { Suspense, lazy, useRef } from "react";
import { useInView } from "motion/react";
import { film } from "@/src/features/landing/film/mock";

// Remotion and the film stay out of the first bundle, and the Player only
// mounts in the browser. Until then the frame holds its size on the film's
// own ground.
const HeroFilm = lazy(() => import("@/src/features/landing/film/film-entry"));

function Frame() {
  return (
    <div
      aria-hidden="true"
      className="w-full bg-background"
      style={{ aspectRatio: `${film.width} / ${film.height}` }}
    />
  );
}

/** Mounts the film once it comes near the screen; server and first paint get the frame. */
export function LazyFilm() {
  const slot = useRef<HTMLDivElement>(null);
  const near = useInView(slot, { once: true, margin: "600px 0px" });
  return (
    <div ref={slot}>
      {near ? (
        <Suspense fallback={<Frame />}>
          <HeroFilm />
        </Suspense>
      ) : (
        <Frame />
      )}
    </div>
  );
}
