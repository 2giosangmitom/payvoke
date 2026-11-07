import FilmPlayer from "@/src/features/landing/film/film-player";
import { featureFilms } from "@/src/features/landing/film/features";
import { chapters, filmDuration } from "@/src/features/landing/film/mock";
import { PayvokeFilm } from "@/src/features/landing/film/payvoke-film";

export type FilmId = "overview" | (typeof featureFilms)[number]["id"];

/** Every landing film by id, loaded as one chunk after the page is ready. */
export default function FilmById({ id, label }: { id: FilmId; label: string }) {
  if (id === "overview") {
    return (
      <FilmPlayer
        component={PayvokeFilm}
        durationInFrames={filmDuration}
        chapters={chapters}
        poster={60}
        label={label}
      />
    );
  }
  const feature = featureFilms.find((entry) => entry.id === id)!;
  return (
    <FilmPlayer
      component={feature.component}
      durationInFrames={feature.durationInFrames}
      poster={feature.durationInFrames - 20}
      label={label}
    />
  );
}
