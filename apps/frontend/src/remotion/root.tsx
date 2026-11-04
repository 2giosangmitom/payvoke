import { Composition } from "remotion";
import { featureFilms } from "@/src/features/landing/film/features";
import { film, filmDuration } from "@/src/features/landing/film/mock";
import { PayvokeFilm } from "@/src/features/landing/film/payvoke-film";
import "./studio.css";

const name = (id: string) => `Feature-${id}`;

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="PayvokeFilm"
        component={PayvokeFilm}
        durationInFrames={filmDuration}
        fps={film.fps}
        width={film.width}
        height={film.height}
      />
      {featureFilms.map((feature) => (
        <Composition
          key={feature.id}
          id={name(feature.id)}
          component={feature.component}
          durationInFrames={feature.durationInFrames}
          fps={film.fps}
          width={film.width}
          height={film.height}
        />
      ))}
    </>
  );
}
