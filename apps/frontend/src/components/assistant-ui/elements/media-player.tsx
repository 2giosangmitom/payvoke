"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { Loader2Icon, PauseIcon, PlayIcon } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { field, inkButton, mono, paper } from "./surfaces";

export interface VideoPlayerProps extends Omit<ComponentProps<"div">, "children"> {
  src: string;
  poster?: string | undefined;
  title?: string | undefined;
  ratio?: "16:9" | "4:3" | "1:1" | "9:16" | "auto" | undefined;
  durationMs?: number | undefined;
}

function formatDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function useMediaDuration(
  mediaRef: RefObject<HTMLMediaElement | null>,
  src: string,
  durationMs?: number | undefined,
) {
  const [metadata, setMetadata] = useState<{ src: string; duration?: number }>({
    src,
  });

  // A server-rendered media element can load metadata before hydration attaches onLoadedMetadata.
  useEffect(() => {
    const media = mediaRef.current;
    if (!media || media.readyState < HTMLMediaElement.HAVE_METADATA) return;
    if (Number.isFinite(media.duration) && media.duration >= 0) {
      setMetadata({ src, duration: media.duration });
    }
  }, [mediaRef, src]);
  const fallbackDuration =
    durationMs !== undefined && Number.isFinite(durationMs)
      ? Math.max(0, durationMs / 1000)
      : undefined;

  return {
    duration: metadata.src === src ? (metadata.duration ?? fallbackDuration) : fallbackDuration,
    setDurationFromMetadata: (duration: number) => {
      if (Number.isFinite(duration) && duration >= 0) {
        setMetadata({ src, duration });
      }
    },
  };
}

export interface AudioPlayerProps extends Omit<ComponentProps<"div">, "children"> {
  /** A ready URL, or `loadSrc` to fetch a short-lived one on the first play. */
  src?: string | undefined;
  loadSrc?: (() => Promise<string>) | undefined;
  title?: string | undefined;
  /** Shown before the media loads its own metadata. */
  durationMs?: number | undefined;
  /** Normalized 0..1 loudness per slice; without them the track is a line. */
  peaks?: readonly number[] | null | undefined;
  /** Extra controls at the end of the card (a download button). */
  actions?: ReactNode;
}

const RATES = [1, 1.5, 2, 0.75] as const;

// At most `count` bars, each the loudest of the peaks it covers, so a long
// waveform stays legible instead of reading as a barcode.
function resample(peaks: readonly number[], count: number) {
  if (peaks.length <= count) return peaks;
  const step = peaks.length / count;
  return Array.from({ length: count }, (_, index) =>
    Math.max(...peaks.slice(Math.floor(index * step), Math.floor((index + 1) * step))),
  );
}

/**
 * Inline player for an audio file in the thread. The waveform is the seek
 * control: the played part fills in the accent, the pointer previews a
 * position, and arrow keys step five seconds. Progress is written straight to
 * the DOM each frame, so the card does not re-render while it plays.
 */
export function AudioPlayer({
  src,
  loadSrc,
  title,
  durationMs,
  peaks,
  actions,
  className,
  ...props
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playedRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused" | "error">("idle");
  const [duration, setDuration] = useState(
    durationMs !== undefined && durationMs > 0 ? durationMs / 1000 : undefined,
  );
  const [rate, setRate] = useState<(typeof RATES)[number]>(1);
  const [hover, setHover] = useState<number | null>(null);
  const [time, setTime] = useState(0);
  const label = title ?? "Audio";
  const bars = peaks && peaks.length ? resample(peaks, 56) : null;

  const paint = (seconds: number) => {
    const total = audioRef.current?.duration || duration || 0;
    const fraction = total ? Math.min(1, seconds / total) : 0;
    if (playedRef.current)
      playedRef.current.style.clipPath = `inset(0 ${(1 - fraction) * 100}% 0 0)`;
    if (readoutRef.current) readoutRef.current.textContent = formatDuration(seconds);
  };

  useEffect(() => {
    if (state !== "playing") return;
    let frame = 0;
    const tick = () => {
      paint(audioRef.current?.currentTime ?? 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });

  const ensureSource = async () => {
    const audio = audioRef.current;
    if (!audio) return null;
    if (audio.currentSrc) return audio;
    const url = src ?? (loadSrc ? await loadSrc() : undefined);
    if (!url) return null;
    audio.src = url;
    return audio;
  };

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || state === "loading") return;
    if (state === "playing") {
      audio.pause();
      return;
    }
    setState("loading");
    try {
      const ready = await ensureSource();
      if (!ready) throw new Error("No source");
      ready.playbackRate = rate;
      await ready.play();
    } catch {
      setState(audio.error ? "error" : "paused");
    }
  };

  const seekTo = async (fraction: number) => {
    const total = duration ?? 0;
    if (!total) return;
    const seconds = Math.max(0, Math.min(total, fraction * total));
    const audio = await ensureSource().catch(() => null);
    if (audio) audio.currentTime = seconds;
    setTime(seconds);
    paint(seconds);
  };

  const fractionAt = (clientX: number) => {
    const box = waveRef.current?.getBoundingClientRect();
    return box && box.width ? Math.max(0, Math.min(1, (clientX - box.left) / box.width)) : 0;
  };

  const total = duration ?? 0;
  const durationLabel = duration === undefined ? "--:--" : formatDuration(duration);
  const waveBars = (tone: string) =>
    bars ? (
      <div aria-hidden className="flex h-full w-full min-w-0 items-center gap-[2px] sm:gap-[3px]">
        {bars.map((peak, index) => (
          <span
            key={index}
            className={cn("min-w-0 flex-1", tone)}
            style={{ height: `${Math.max(8, Math.round(peak * 100))}%` }}
          />
        ))}
      </div>
    ) : (
      <div aria-hidden className={cn("h-0.5 w-full", tone)} />
    );

  return (
    <div
      data-slot="audio-player"
      data-state={state}
      className={cn(paper, "flex w-full max-w-md items-center gap-3 p-3", className)}
      {...props}
    >
      <button
        type="button"
        aria-label={`${state === "playing" ? "Pause" : "Play"} ${label}`}
        disabled={state === "error"}
        onClick={() => void toggle()}
        className={cn(
          inkButton,
          "flex size-10 shrink-0 items-center justify-center disabled:cursor-default disabled:opacity-40",
        )}
      >
        {state === "loading" ? (
          <Loader2Icon aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        ) : state === "playing" ? (
          <PauseIcon aria-hidden className="size-4" />
        ) : (
          <PlayIcon aria-hidden className="ml-0.5 size-4" />
        )}
      </button>
      <div className="flex min-w-0 flex-1 basis-24 flex-col gap-1.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{label}</span>
          <span className={cn(mono, "shrink-0 text-muted-foreground")}>
            <span ref={readoutRef}>{formatDuration(time)}</span> / {durationLabel}
          </span>
        </div>
        <div
          ref={waveRef}
          role="slider"
          tabIndex={state === "error" ? -1 : 0}
          aria-label={`Seek ${label}`}
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${formatDuration(time)} of ${durationLabel}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            void seekTo(fractionAt(event.clientX));
          }}
          onPointerMove={(event) => {
            const fraction = fractionAt(event.clientX);
            setHover(fraction);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) void seekTo(fraction);
          }}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(event) => {
            const now = audioRef.current?.currentTime ?? time;
            const step = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[event.key];
            if (step !== undefined && total) {
              event.preventDefault();
              void seekTo((now + step) / total);
            } else if (event.key === "Home") {
              event.preventDefault();
              void seekTo(0);
            } else if (event.key === "End" && total) {
              event.preventDefault();
              void seekTo(1);
            }
          }}
          className="relative h-8 cursor-pointer touch-none outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {waveBars("bg-border-strong/70")}
          <div
            ref={playedRef}
            className="absolute inset-0"
            style={{ clipPath: "inset(0 100% 0 0)" }}
          >
            {waveBars("bg-primary")}
          </div>
          {hover !== null && total > 0 ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-px bg-foreground/60"
              style={{ left: `${hover * 100}%` }}
            />
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={`Playback speed ${rate}x`}
          onClick={() => {
            const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
            setRate(next);
            if (audioRef.current) audioRef.current.playbackRate = next;
          }}
          className={cn(
            mono,
            "h-8 min-w-10 px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {rate}×
        </button>
        {actions}
      </div>
      <audio
        ref={audioRef}
        preload="none"
        className="hidden"
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration;
          if (Number.isFinite(seconds) && seconds > 0) setDuration(seconds);
        }}
        onPlay={() => setState("playing")}
        onPause={() => {
          setState((current) => (current === "error" ? current : "paused"));
          setTime(audioRef.current?.currentTime ?? 0);
        }}
        onEnded={() => {
          setTime(0);
          paint(0);
        }}
        onError={() => setState("error")}
      />
      {state === "error" ? (
        <span role="alert" className="sr-only">
          Can&apos;t play this audio
        </span>
      ) : null}
    </div>
  );
}

export function VideoPlayer({
  src,
  poster,
  title,
  ratio = "16:9",
  durationMs,
  className,
  ...props
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { duration, setDurationFromMetadata } = useMediaDuration(videoRef, src, durationMs);
  const ratioClassName =
    ratio === "1:1"
      ? "aspect-square"
      : ratio === "4:3"
        ? "aspect-[4/3]"
        : ratio === "16:9"
          ? "aspect-video"
          : ratio === "9:16"
            ? "aspect-[9/16]"
            : undefined;

  return (
    <div
      data-slot="video-player"
      className={cn("flex w-full max-w-xl flex-col gap-2", className)}
      {...props}
    >
      <div className={cn(field, "overflow-hidden rounded-xl", ratioClassName)}>
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          controls
          playsInline
          preload="metadata"
          aria-label={title ?? "Video"}
          className={cn("block max-w-full", ratio !== "auto" && "h-full w-full object-contain")}
          onLoadedMetadata={(event) => {
            setDurationFromMetadata(event.currentTarget.duration);
          }}
        />
      </div>
      {(title || duration !== undefined) && (
        <div className="flex min-w-0 items-center gap-2 px-1">
          {title ? (
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{title}</span>
          ) : null}
          {duration !== undefined ? (
            <span className={cn(mono, "text-muted-foreground shrink-0 tabular-nums")}>
              {formatDuration(duration)}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
