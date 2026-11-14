import FilmPlayer from "@/src/features/landing/film/film-player";
import { HeroDemo } from "@/src/features/landing/film/hero-demo";
import { chapters, filmDuration } from "@/src/features/landing/film/mock";

/** The hero film, loaded as its own chunk after the page is ready. */
export default function HeroFilm() {
  return (
    <FilmPlayer
      component={HeroDemo}
      durationInFrames={filmDuration}
      chapters={chapters}
      // The delivered job and its dashboard: the still shown under reduced motion.
      poster={filmDuration - 60}
      label="the demo of one job"
    />
  );
}
