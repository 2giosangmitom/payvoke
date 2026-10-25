"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import { Slider } from "@/src/components/ui/slider";
import { landingAudio } from "@/src/lib/landing-audio";
import { cn } from "@/src/lib/utils";

const EQ_BARS = 4;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/** Four-bar level meter fed by the same analyser as the hero; flat while paused. */
function LevelMeter({ playing }: { playing: boolean }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (!playing || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let data = new Uint8Array(0);
    const tick = () => {
      const analyser = landingAudio.analyser();
      if (analyser) {
        if (data.length !== analyser.frequencyBinCount)
          data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        // Four rough bands: bass, low-mid, high-mid, treble.
        const edges = [2, 12, 48, 160, 420];
        for (let i = 0; i < EQ_BARS; i++) {
          let sum = 0;
          for (let k = edges[i]; k < edges[i + 1]; k++) sum += data[k] ?? 0;
          const level = sum / (edges[i + 1] - edges[i]) / 255;
          const bar = bars.current[i];
          // Tailwind sets `scale`, so write the same property rather than `transform`.
          if (bar) bar.style.scale = `1 ${Math.max(0.2, Math.min(1, level * 1.4))}`;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      for (const bar of bars.current) if (bar) bar.style.scale = "";
    };
  }, [playing]);

  return (
    <span aria-hidden="true" className="flex h-3.5 shrink-0 items-end gap-0.5">
      {Array.from({ length: EQ_BARS }, (_, i) => (
        <span
          key={i}
          ref={(node) => {
            bars.current[i] = node;
          }}
          className={cn(
            "block h-full w-[3px] origin-bottom scale-y-[0.35] bg-primary transition-[scale] duration-75",
            !playing && "opacity-60",
          )}
        />
      ))}
    </span>
  );
}

/** Compact player in the bottom-left corner. It also feeds the hero visualizer. */
export function LandingMusic() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { playing, currentTime, duration, error } = useSyncExternalStore(
    landingAudio.subscribe,
    landingAudio.getSnapshot,
    landingAudio.getSnapshot,
  );
  // While dragging, the bar follows the pointer instead of timeupdate.
  const [scrub, setScrub] = useState<number | null>(null);
  const position = scrub ?? currentTime;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    landingAudio.attach(audio);
    return () => landingAudio.detach(audio);
  }, []);

  return (
    <section
      aria-label="Theme song: A Little Idea"
      className="fixed bottom-3 left-3 z-30 w-[min(calc(100vw-1.5rem),16.5rem)] border border-border bg-background-deep/95 text-foreground shadow-float backdrop-blur-sm"
    >
      <audio ref={audioRef} src="/audio/a-litte-idea.opus" preload="metadata" loop />

      <div className="flex items-center gap-3 px-2.5 pt-2.5 pb-1">
        <div className="group relative size-11 shrink-0 overflow-hidden bg-field-bg">
          <img
            src="/audio/a-litte-idea.svg"
            alt="Cover art for A Little Idea: a spark joined to a few connected nodes"
            // The SVG frames its artwork (y 132-442) with captions; zooming crops them away.
            className="block size-full origin-[50%_47%] scale-[1.8] object-cover"
          />
          <button
            type="button"
            onClick={() => void landingAudio.toggle()}
            aria-label={playing ? "Pause A Little Idea" : "Play A Little Idea"}
            aria-pressed={playing}
            className={cn(
              "absolute inset-0 grid place-items-center bg-overlay/50 text-foreground transition-opacity focus-visible:opacity-100 focus-visible:-outline-offset-2",
              playing ? "opacity-0 group-hover:opacity-100" : "opacity-100 hover:bg-overlay/70",
            )}
          >
            {playing ? (
              <Pause className="size-4" fill="currentColor" strokeWidth={0} />
            ) : (
              <Play className="size-4 translate-x-px" fill="currentColor" strokeWidth={0} />
            )}
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <strong className="block truncate text-[13px] leading-tight font-semibold">
            A Little Idea
          </strong>
          <span className="block truncate font-mono text-[11px] text-muted-foreground tabular-nums">
            {error ? "Unavailable" : `Payvoke · ${formatTime(position)} / ${formatTime(duration)}`}
          </span>
        </div>
        <LevelMeter playing={playing} />
      </div>

      <Slider
        size="line"
        className="px-2.5"
        value={[Math.min(position, duration || position)]}
        min={0}
        max={duration || 1}
        step={0.1}
        disabled={!duration}
        thumbLabel="Seek A Little Idea"
        getAriaValueText={() => `${formatTime(position)} of ${formatTime(duration)}`}
        onValueChange={(value) => setScrub(Array.isArray(value) ? value[0] : value)}
        onValueCommitted={(value) => {
          landingAudio.seek(Array.isArray(value) ? value[0] : value);
          setScrub(null);
        }}
      />
    </section>
  );
}
