"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import { TRACK, landingAudio } from "@/src/lib/landing-audio";
import { cn } from "@/src/lib/utils";

/** Bars in the little meter, and the pixel steps each can climb. */
const METER_BARS = 4;
const METER_STEPS = 5;

const clock = (seconds: number) => {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/**
 * The landing's docked player. It also feeds the hero field, so the picture
 * and the sound are the same performance. The track itself is a plain audio
 * element; a Web Audio analyser is only wired after the first press, because
 * browsers keep an AudioContext suspended until there has been a gesture.
 *
 * Progress, the readout and the meter are written straight to the DOM each
 * frame, outside React, so the card never re-renders while the track plays.
 */
export function LandingMusic() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const range = useRef<HTMLInputElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const bars = useRef<Array<HTMLSpanElement | null>>([]);
  const scrubbing = useRef(false);
  // Past the hero, the card would sit on top of content on a phone, so it
  // collapses to its play button there.
  const [pastHero, setPastHero] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("top");
    if (!hero) return;
    const observer = new IntersectionObserver(([entry]) => setPastHero(!entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);
  const { on, started, error } = useSyncExternalStore(
    landingAudio.subscribe,
    landingAudio.getSnapshot,
    landingAudio.getSnapshot,
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    landingAudio.attach(audio);
    return () => landingAudio.detach(audio);
  }, []);

  // The painted line, the time readout and the meter are driven straight from
  // the track each frame. While a hand is on the range, the range leads and
  // the track follows; otherwise the track leads.
  useEffect(() => {
    const levels = new Float32Array(METER_BARS);
    const smoothed = new Float32Array(METER_BARS);
    let frame = 0;
    let lastPaint = -Infinity;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - lastPaint < 32) return;
      lastPaint = now;

      const duration = landingAudio.duration;
      // Before the sound has been touched the card shows a clean zero; the
      // field may already be walking the timeline, but the track has not
      // started and the player should not pretend it has.
      const at = started ? landingAudio.time : 0;
      const ratio = duration ? Math.max(0, Math.min(1, at / duration)) : 0;
      const rangeEl = range.current;
      // While a hand is on the range, the range leads. Otherwise the track
      // leads, including right after a keyboard seek.
      if (!scrubbing.current) {
        if (line.current) line.current.style.transform = `scaleX(${ratio})`;
        if (rangeEl) rangeEl.value = String(Math.round(ratio * 1000));
        if (readout.current) readout.current.textContent = `${clock(at)} / ${clock(duration)}`;
      }

      landingAudio.meter(levels);
      for (let i = 0; i < METER_BARS; i++) {
        const rise = levels[i] > smoothed[i];
        smoothed[i] += (levels[i] - smoothed[i]) * (rise ? 0.7 : 0.2);
        const bar = bars.current[i];
        if (bar) bar.style.height = `${Math.max(1, Math.round(smoothed[i] * METER_STEPS)) * 2}px`;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [started]);

  useEffect(() => {
    if (on) return;
    for (const bar of bars.current) if (bar) bar.style.height = "2px";
  }, [on]);

  return (
    <section
      aria-label={`Theme song: ${TRACK.title}`}
      data-compact={pastHero}
      // On a short phone the full card would reach the hero CTAs, so only the
      // play button stays.
      className="group/card fixed bottom-4 left-4 z-30 flex h-[46px] w-[min(calc(100vw-2rem),17rem)] [@media(max-width:480px)_and_(max-height:740px)]:w-[46px] max-sm:data-[compact=true]:w-[46px] transition-[width] duration-300 items-stretch border border-border-strong bg-background-deep/90 shadow-float supports-backdrop-filter:backdrop-blur-sm"
    >
      <audio ref={audioRef} src={TRACK.src} preload="metadata" loop />

      <button
        type="button"
        onClick={() => void landingAudio.toggle()}
        aria-pressed={on}
        aria-label={on ? `Pause ${TRACK.title}` : `Play ${TRACK.title}`}
        title={on ? "Pause" : "Play"}
        className="relative size-[44px] shrink-0 self-center border-r border-border-strong bg-field-bg text-white touch-manipulation focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span className="absolute inset-0 overflow-hidden">
          <img
            src={TRACK.art}
            alt=""
            aria-hidden="true"
            // The SVG frames its artwork (y 132-442) with captions; zooming crops them away.
            className="absolute inset-0 size-full origin-[50%_47%] scale-[1.8] object-cover"
          />
        </span>
        {!started && !error ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-px animate-music-ring border border-primary motion-reduce:animate-none"
          />
        ) : null}
        <span
          className={cn(
            "absolute inset-0 grid place-items-center bg-overlay/55 transition-opacity duration-150 ease-out group-hover/card:opacity-100 group-has-[:focus-visible]/card:opacity-100 max-sm:opacity-100",
            on ? "opacity-0" : "opacity-100",
          )}
        >
          {on ? (
            <Pause
              className="size-[15px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
              fill="currentColor"
              strokeWidth={0}
            />
          ) : (
            <Play
              className="size-[16px] translate-x-px drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
              fill="currentColor"
              strokeWidth={0}
            />
          )}
        </span>
      </button>

      <span className="flex min-w-0 flex-1 flex-col justify-center pr-2 pl-3 leading-tight [@media(max-width:480px)_and_(max-height:740px)]:hidden max-sm:group-data-[compact=true]/card:hidden">
        <span className="truncate text-[12px] font-medium text-foreground">{TRACK.title}</span>
        <span className="relative mt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
          <span className="block truncate transition-opacity duration-150 ease-out group-has-[input:hover]/card:opacity-0 group-has-[input:focus-visible]/card:opacity-0 group-has-[input:active]/card:opacity-0">
            {error ? "Unavailable" : TRACK.artist}
          </span>
          <span
            ref={readout}
            aria-hidden="true"
            className="absolute inset-0 truncate opacity-0 transition-opacity duration-150 ease-out group-has-[input:hover]/card:opacity-100 group-has-[input:focus-visible]/card:opacity-100 group-has-[input:active]/card:opacity-100"
          />
        </span>
      </span>

      <span
        aria-hidden="true"
        className={cn(
          "mr-2.5 flex w-[18px] items-end gap-[2px] self-center transition-opacity duration-200 ease-out [@media(max-width:480px)_and_(max-height:740px)]:hidden max-sm:group-data-[compact=true]/card:hidden",
          on ? "opacity-100" : "opacity-0",
        )}
        style={{ height: METER_STEPS * 2 + 2 }}
      >
        {Array.from({ length: METER_BARS }, (_, index) => (
          <span
            key={index}
            ref={(node) => {
              bars.current[index] = node;
            }}
            className="block w-[3px] shrink-0 bg-primary"
            style={{ height: 2 }}
          />
        ))}
      </span>

      {/* Progress and seeking along the foot of the card. The painted line is
          the span; the range on top of it is the control, with a hit area a
          good deal taller than the line it draws and no handle of its own:
          the end of the line is the handle. */}
      <span
        ref={line}
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-primary transition-[height] duration-150 ease-out group-hover/card:h-1 group-has-[:focus-visible]/card:h-1 [@media(max-width:480px)_and_(max-height:740px)]:hidden max-sm:group-data-[compact=true]/card:hidden"
        style={{ transform: "scaleX(0)" }}
      />
      <input
        ref={range}
        type="range"
        min={0}
        max={1000}
        step={5}
        defaultValue={0}
        aria-label={`Position in ${TRACK.title}`}
        onPointerDown={() => {
          scrubbing.current = true;
        }}
        onPointerUp={() => {
          scrubbing.current = false;
        }}
        onPointerCancel={() => {
          scrubbing.current = false;
        }}
        onInput={(event) => {
          const ratio = Number(event.currentTarget.value) / 1000;
          const duration = landingAudio.duration;
          if (line.current) line.current.style.transform = `scaleX(${ratio})`;
          if (readout.current)
            readout.current.textContent = `${clock(ratio * duration)} / ${clock(duration)}`;
          landingAudio.seek(ratio * duration);
        }}
        className="absolute inset-x-0 -bottom-1.5 h-3.5 w-full cursor-pointer touch-none appearance-none bg-transparent focus-visible:outline-none [&::-moz-range-thumb]:size-0 [&::-moz-range-thumb]:border-0 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:size-0 [&::-webkit-slider-thumb]:appearance-none [@media(max-width:480px)_and_(max-height:740px)]:hidden max-sm:group-data-[compact=true]/card:hidden"
      />
    </section>
  );
}
