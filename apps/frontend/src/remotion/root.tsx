import { Composition } from "remotion";
import { HeroDemo } from "@/src/features/landing/film/hero-demo";
import { film, filmDuration } from "@/src/features/landing/film/mock";
import "./studio.css";

// On the page the film follows the site's theme; the Studio and renders
// show it in dark mode.
function DarkHeroDemo() {
  return (
    <div data-mode="dark" className="contents">
      <HeroDemo />
    </div>
  );
}

export function RemotionRoot() {
  return (
    <Composition
      id="HeroDemo"
      component={DarkHeroDemo}
      durationInFrames={filmDuration}
      fps={film.fps}
      width={film.width}
      height={film.height}
    />
  );
}
