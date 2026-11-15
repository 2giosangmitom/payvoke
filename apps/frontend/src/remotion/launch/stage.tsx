import { createContext, useContext, type ReactNode, type Ref } from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { HEIGHT, WIDTH } from "@/src/remotion/launch/timeline";

// The stage: a plain light field, a caption column on the left and, on the
// right, a still copy of a real Payvoke page with no browser around it. The
// page never moves or zooms; the pointer and the page itself do the acting.

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const out = Easing.bezier(0.16, 1, 0.3, 1);
export const glide = Easing.bezier(0.65, 0, 0.35, 1);
export const VIET = '"Be Vietnam Pro", "Geist", sans-serif';

/** 0 → 1 over `length` frames from `from`, eased out. */
export const rise = (frame: number, from: number, length = 18, easing = out) =>
  interpolate(frame, [from, from + length], [0, 1], { ...clamp, easing });

/** Characters of `text` typed by `frame`, starting at `from`. */
export const typed = (text: string, frame: number, from: number, perFrame = 0.9) =>
  text.slice(0, Math.max(0, Math.floor((frame - from) * perFrame)));

/** Keys sorted by time and strictly increasing, as interpolate needs. */
export function ordered<T extends { at: number }>(keys: T[]): T[] {
  const sorted = [...keys].sort((a, b) => a.at - b.at);
  return sorted.map((key, i) => ({ ...key, at: key.at + i * 1e-3 }));
}

/* The right-hand region */

/** Where the caption column ends and the picture begins. */
export const SPLIT = 900;
export const REGION = { w: WIDTH - SPLIT, h: HEIGHT } as const;

const Size = createContext<{ w: number; h: number }>({ w: WIDTH, h: HEIGHT });
export const useStage = () => useContext(Size);

/** The picture's half of the frame, fading into the field at every edge. */
export function Region({ children }: { children: ReactNode }) {
  return (
    <Size.Provider value={REGION}>
      <div
        className="absolute top-0 overflow-hidden"
        style={{
          left: SPLIT,
          width: REGION.w,
          height: REGION.h,
          maskImage:
            "linear-gradient(90deg, transparent 0, black 60px, black calc(100% - 40px), transparent), linear-gradient(transparent 0, black 50px, black calc(100% - 50px), transparent)",
          maskComposite: "intersect",
        }}
      >
        {children}
      </div>
    </Size.Provider>
  );
}

/* The page */

/** Narrow enough to show at full size beside the captions, with no zoom. */
export const SCREEN = { width: 920, height: 1000 } as const;

/** A Payvoke page, with `overlay` (wallet, pointer) above it. */
export function Page({ children, overlay, rootRef }: { children: ReactNode; overlay?: ReactNode; rootRef?: Ref<HTMLDivElement> }) {
  return (
    <div ref={rootRef} className="absolute top-0 left-0 bg-background" style={{ width: SCREEN.width, height: SCREEN.height }}>
      <div inert className="relative size-full overflow-hidden font-sans text-[14px] text-foreground antialiased">
        {children}
      </div>
      {overlay}
    </div>
  );
}

/** The page scaled to fit the region, centred and still. */
export function Fit({ children }: { children: ReactNode }) {
  const { w, h } = useStage();
  const scale = Math.min((w - 60) / SCREEN.width, (h - 60) / SCREEN.height);
  return (
    <div
      className="absolute top-0 left-0 origin-top-left"
      style={{
        width: SCREEN.width,
        height: SCREEN.height,
        transform: `translate(${(w - SCREEN.width * scale) / 2}px, ${(h - SCREEN.height * scale) / 2}px) scale(${scale})`,
      }}
    >
      {children}
    </div>
  );
}

/* Pointer */

export type Stop = { at: number; x: number; y: number };

/** A pointer gliding between stops (page pixels) that presses at `clicks`. */
export function Pointer({ stops: keys, clicks }: { stops: Stop[]; clicks: number[] }) {
  const frame = useCurrentFrame();
  const stops = ordered(keys);
  const at = stops.map((stop) => stop.at);
  const x = interpolate(
    frame,
    at,
    stops.map((s) => s.x),
    { ...clamp, easing: glide },
  );
  const y = interpolate(
    frame,
    at,
    stops.map((s) => s.y),
    { ...clamp, easing: glide },
  );
  const opacity = interpolate(frame, [at[0] - 8, at[0], at.at(-1)!, at.at(-1)! + 8], [0, 1, 1, 0], clamp);
  const click = clicks.findLast((start) => frame >= start && frame < start + 20);
  const since = click === undefined ? 99 : frame - click;
  const press = interpolate(since, [0, 3, 9], [1, 0.8, 1], clamp);
  return (
    <div aria-hidden className="pointer-events-none absolute top-0 left-0 z-50" style={{ translate: `${x}px ${y}px`, opacity }}>
      {since < 20 && (
        <span
          className="absolute -top-6 -left-6 size-12 rounded-full border-2 border-primary"
          style={{
            scale: interpolate(since, [0, 20], [0.3, 1.5], clamp),
            opacity: interpolate(since, [0, 20], [0.9, 0], clamp),
          }}
        />
      )}
      <svg viewBox="0 0 24 24" className="size-8 origin-top-left drop-shadow-[0_3px_6px_rgb(0_0_0/0.35)]" style={{ scale: press }}>
        <path
          d="M4 2.5 19.5 13l-6.6 1.4 3.7 6.9-2.9 1.5-3.7-6.9L5 20.6Z"
          fill="#1b2620"
          stroke="#ffffff"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
