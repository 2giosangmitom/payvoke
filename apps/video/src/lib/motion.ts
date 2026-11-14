import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

/** Local time inside the current Sequence. */
export function useLocal() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  return { frame, fps, t: frame / fps, dur: durationInFrames / fps };
}

const out = Easing.bezier(0.16, 1, 0.3, 1);

/** 0→1 between two times in seconds, eased out. */
export function ramp(t: number, from: number, to: number, easing = out) {
  return interpolate(t, [from, to], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
}

/** A springy 0→1 starting at `from` seconds. */
export function pop(frame: number, fps: number, from: number, damping = 12) {
  return spring({ frame: frame - from * fps, fps, config: { damping, stiffness: 170, mass: 0.8 } });
}

/** Fade in at the start and out at the end of a scene. */
export function inOut(t: number, dur: number, fadeIn = 0.35, fadeOut = 0.35) {
  return Math.min(ramp(t, 0, fadeIn), 1 - ramp(t, dur - fadeOut, dur));
}

/** Characters of `text` typed so far at `cps` chars per second from `from`. */
export function typed(text: string, t: number, from: number, cps = 28) {
  return text.slice(0, Math.max(0, Math.floor((t - from) * cps)));
}
