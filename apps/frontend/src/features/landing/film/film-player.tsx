"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { Pause, Play } from "lucide-react";
import { Player, type PlayerRef } from "@remotion/player";
import { useInView, useReducedMotion } from "motion/react";
import { Button } from "@/src/components/ui/button";
import { film, type Chapter } from "@/src/features/landing/film/mock";
import { cn } from "@/src/lib/utils";

export type FilmPlayerProps = {
  component: ComponentType;
  durationInFrames: number;
  /** Names the film for the play button. */
  label: string;
  /** Optional chapter buttons that jump the film to each part. */
  chapters?: Chapter[];
  /** The frame shown when motion is reduced and the film waits for a press. */
  poster?: number;
  className?: string;
};

/**
 * A landing film in a Remotion Player: muted, looping, with a play button and
 * optional chapter buttons. With reduced motion it waits on `poster`.
 */
export default function FilmPlayer({
  component,
  durationInFrames,
  label,
  chapters,
  poster = 0,
  className,
}: FilmPlayerProps) {
  const player = useRef<PlayerRef>(null);
  const frame = useRef<HTMLElement>(null);
  const still = useReducedMotion();
  // Plays while on screen and pauses off it, so several films never run at once
  // out of sight.
  const visible = useInView(frame, { amount: 0.4 });
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(chapters?.[0]?.id);

  useEffect(() => {
    const ref = player.current;
    if (!ref) return;
    const onFrame = ({ detail }: { detail: { frame: number } }) => {
      const at = chapters?.findLast((entry) => detail.frame >= entry.from);
      if (at) setCurrent(at.id);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    ref.addEventListener("frameupdate", onFrame);
    ref.addEventListener("play", onPlay);
    ref.addEventListener("pause", onPause);
    return () => {
      ref.removeEventListener("frameupdate", onFrame);
      ref.removeEventListener("play", onPlay);
      ref.removeEventListener("pause", onPause);
    };
  }, [chapters]);

  useEffect(() => {
    const ref = player.current;
    if (!ref || still) return;
    if (visible) ref.play();
    else ref.pause();
  }, [visible, still]);

  return (
    <figure ref={frame} className={cn("grid gap-3", className)}>
      <div data-ui className="bg-background-deep">
        <Player
          ref={player}
          component={component}
          durationInFrames={durationInFrames}
          compositionWidth={film.width}
          compositionHeight={film.height}
          fps={film.fps}
          loop
          initiallyMuted
          // The films are silent: no shared audio elements to create or sync.
          numberOfSharedAudioTags={0}
          initialFrame={still ? poster : 0}
          clickToPlay={false}
          doubleClickToFullscreen={false}
          spaceKeyToPlayOrPause={false}
          style={{ width: "100%", aspectRatio: `${film.width} / ${film.height}` }}
        />
      </div>
      <figcaption className="flex flex-wrap items-center gap-1.5">
        <Button
          size="icon"
          onClick={() => player.current?.toggle()}
          aria-label={playing ? `Pause ${label}` : `Play ${label}`}
        >
          {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </Button>
        {chapters?.map((entry) => (
          <Button
            key={entry.id}
            variant={entry.id === current ? "default" : "secondary"}
            aria-current={entry.id === current ? "step" : undefined}
            onClick={() => {
              player.current?.seekTo(entry.from);
              player.current?.play();
            }}
          >
            {entry.label}
          </Button>
        ))}
      </figcaption>
    </figure>
  );
}
