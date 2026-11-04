import { Suspense, lazy, useRef } from "react";
import { useInView } from "motion/react";
import type { FilmId } from "@/src/features/landing/film/film-entry";
import { film } from "@/src/features/landing/film/mock";

// Remotion and the films stay out of the first bundle, and the Player only
// mounts in the browser. Until then the frame holds its size on the film's
// own ground.
const FilmById = lazy(() => import("@/src/features/landing/film/film-entry"));

function Frame() {
  return (
    <div
      data-mode="dark"
      aria-hidden="true"
      className="w-full bg-background-deep"
      style={{ aspectRatio: `${film.width} / ${film.height}` }}
    />
  );
}

/** Mounts the film once it comes near the screen; server and first paint get the frame. */
export function LazyFilm({ id, label }: { id: FilmId; label: string }) {
  const slot = useRef<HTMLDivElement>(null);
  const near = useInView(slot, { once: true, margin: "400px 0px" });
  return (
    <div ref={slot}>
      {near ? (
        <Suspense fallback={<Frame />}>
          <FilmById id={id} label={label} />
        </Suspense>
      ) : (
        <Frame />
      )}
    </div>
  );
}
