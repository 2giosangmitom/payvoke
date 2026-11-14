import type { CSSProperties, ReactNode } from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { cn } from "@/src/lib/utils";

// Shared pieces of the landing film. Every move is driven by the frame, so
// the Player, the Studio and a render show the same thing.

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const out = Easing.bezier(0.16, 1, 0.3, 1);
// Camera and cursor moves start and land softly, like a hand on a trackpad.
const glide = Easing.bezier(0.65, 0, 0.35, 1);

/** Characters of `text` typed by `frame`, starting at `from`, `perFrame` at a time. */
export const typed = (text: string, frame: number, from: number, perFrame = 0.6) =>
  text.slice(0, Math.max(0, Math.floor((frame - from) * perFrame)));

/** Fades and lifts its children in at `delay`. */
export function Enter({
  delay = 0,
  className,
  style,
  children,
}: {
  delay?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  return (
    <div
      className={className}
      style={{
        ...style,
        opacity: interpolate(frame, [delay, delay + 14], [0, 1], clamp),
        translate: interpolate(frame, [delay, delay + 20], ["0px 18px", "0px 0px"], {
          ...clamp,
          easing: out,
        }),
      }}
    >
      {children}
    </div>
  );
}

/**
 * Opens from no height to its own at `at`, so whatever sits above it slides
 * up smoothly, the way a chat anchored to its latest message scrolls. The
 * grid-row trick animates to the natural height without measuring it.
 */
export function Grow({
  at,
  className,
  children,
}: {
  at: number;
  className?: string;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const t = interpolate(frame, [at, at + 14], [0, 1], { ...clamp, easing: out });
  return (
    <div className="grid shrink-0" style={{ gridTemplateRows: `${t}fr` }}>
      <div className={cn("min-h-0 overflow-hidden", className)} style={{ opacity: t }}>
        {children}
      </div>
    </div>
  );
}

/** Where the camera looks at a frame: a point on the screen and how close. */
export type Shot = { at: number; x: number; y: number; scale: number };

const track = (frame: number, shots: Shot[], key: "x" | "y" | "scale") =>
  interpolate(
    frame,
    shots.map((shot) => shot.at),
    shots.map((shot) => shot[key]),
    { ...clamp, easing: glide },
  );

/**
 * Pans and zooms over a screen as big as the composition. Between shots the
 * camera glides; it never shows past the screen's edges. Transform only, so a
 * move costs one composite, not a repaint.
 */
export function Camera({ shots, children }: { shots: Shot[]; children: ReactNode }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const scale = track(frame, shots, "scale");
  const pan = (focus: number, size: number) =>
    Math.min(0, Math.max(size - size * scale, size / 2 - focus * scale));
  const x = pan(track(frame, shots, "x"), width);
  const y = pan(track(frame, shots, "y"), height);
  return (
    <div
      className="absolute top-0 left-0 origin-top-left"
      style={{ width, height, transform: `translate(${x}px, ${y}px) scale(${scale})` }}
    >
      {children}
    </div>
  );
}

/** A point the pointer moves to, reached at `at`. */
export type Stop = { at: number; x: number; y: number };

/**
 * A pointer that glides between stops and presses at each frame in
 * `clicks`: it dips, and a ring spreads from its tip.
 */
export function Cursor({ stops, clicks }: { stops: Stop[]; clicks: number[] }) {
  const frame = useCurrentFrame();
  const at = stops.map((stop) => stop.at);
  const x = interpolate(
    frame,
    at,
    stops.map((stop) => stop.x),
    { ...clamp, easing: glide },
  );
  const y = interpolate(
    frame,
    at,
    stops.map((stop) => stop.y),
    { ...clamp, easing: glide },
  );
  const opacity = interpolate(
    frame,
    [at[0] - 8, at[0], at.at(-1)!, at.at(-1)! + 8],
    [0, 1, 1, 0],
    clamp,
  );
  const click = clicks.findLast((start) => frame >= start && frame < start + 18);
  const since = click === undefined ? 99 : frame - click;
  const press = interpolate(since, [0, 3, 8], [1, 0.82, 1], clamp);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-50"
      style={{ translate: `${x}px ${y}px`, opacity }}
    >
      {since < 18 && (
        <span
          className="absolute -top-5 -left-5 size-10 rounded-full border-2 border-primary"
          style={{
            scale: interpolate(since, [0, 18], [0.3, 1.4], clamp),
            opacity: interpolate(since, [0, 18], [0.9, 0], clamp),
          }}
        />
      )}
      <svg
        viewBox="0 0 24 24"
        className="size-7 origin-top-left drop-shadow-[0_2px_4px_rgb(0_0_0/0.35)]"
        style={{ scale: press }}
      >
        <path
          d="M4 2.5 19.5 13l-6.6 1.4 3.7 6.9-2.9 1.5-3.7-6.9L5 20.6Z"
          fill="var(--color-foreground)"
          stroke="var(--color-background)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
