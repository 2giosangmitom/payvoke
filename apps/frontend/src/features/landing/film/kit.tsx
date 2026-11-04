import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { cn } from "@/src/lib/utils";

// Shared pieces of the landing films. Every move is driven by the frame, so
// the Player, the Studio and a render show the same thing.

// The app's badge is tiny tracked mono capitals; the film sets it in the text face.
export const quietBadge = "h-6 font-sans text-[13px] tracking-normal normal-case";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const out = Easing.bezier(0.16, 1, 0.3, 1);

/** Characters of `text` typed by `frame`, starting at `from`, `perFrame` at a time. */
export const typed = (text: string, frame: number, from: number, perFrame = 0.6) =>
  text.slice(0, Math.max(0, Math.floor((frame - from) * perFrame)));

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" className="size-[1.1em]">
        <g transform="rotate(-8 14 14)" fill="#509475">
          <path d="M3 3h6v6H3zM19 3h6v6h-6zM3 19h6v6H3zM19 19h6v6h-6z" />
          <path d="M11 3h6v6h-6zM3 11h6v6H3zM19 11h6v6h-6zM11 19h6v6h-6z" opacity=".18" />
          <path d="M11 11h6v6h-6z" fill="#bcd6cb" />
        </g>
      </svg>
      <span className="font-bold tracking-[-0.05em]">payvoke.</span>
    </span>
  );
}

/** A line that rises from behind its own baseline, `delay` frames into its scene. */
export function Rise({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  return (
    <span className={cn("block overflow-hidden pb-[0.08em]", className)}>
      <span
        className="block"
        style={{
          translate: interpolate(frame, [delay, delay + 22], ["0% 105%", "0% 0%"], {
            ...clamp,
            easing: out,
          }),
        }}
      >
        {children}
      </span>
    </span>
  );
}

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
 * Inside a feature row the page already carries the caption, so scenes reused
 * there drop theirs and show the product alone.
 */
export const BareScenes = createContext(false);

/** One chapter: a caption on the left, the product on the right, faded at both ends. */
export function Scene({
  title,
  line,
  scale = 1.12,
  children,
}: {
  title: string;
  line: string;
  scale?: number;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const bare = useContext(BareScenes);
  if (bare) {
    return (
      <Showcase width={500} scale={1.2}>
        {children}
      </Showcase>
    );
  }
  return (
    <AbsoluteFill
      className="grid grid-cols-[300px_1fr] items-center gap-10 px-14"
      style={{
        opacity: interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], clamp),
      }}
    >
      <div className="grid gap-4">
        <h3 className="text-[40px] leading-[1.02] font-semibold tracking-[-0.045em]">
          <Rise>{title}</Rise>
        </h3>
        <Enter delay={8}>
          <p className="text-[17px] leading-[1.45] text-muted-foreground">{line}</p>
        </Enter>
      </div>
      <Enter delay={4} className="origin-left" style={{ scale }}>
        <div inert className="w-[456px] text-[14px]">
          {children}
        </div>
      </Enter>
    </AbsoluteFill>
  );
}

/** The product alone, centred and enlarged, for films that sit beside their own copy. */
export function Showcase({
  width = 520,
  scale = 1.3,
  children,
}: {
  width?: number;
  scale?: number;
  children: ReactNode;
}) {
  return (
    <AbsoluteFill className="grid place-items-center">
      <Enter delay={2} style={{ scale }}>
        <div inert className="text-[14px]" style={{ width }}>
          {children}
        </div>
      </Enter>
    </AbsoluteFill>
  );
}
