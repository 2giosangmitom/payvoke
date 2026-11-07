import track from "../../../frontend/src/features/landing/track.json";

// The same analysis the landing page uses (apps/frontend/scripts/analyse-track.mjs):
// 16 log-spaced bands at 15 fps packed to bytes, plus [time, strength] beats.
const bytes = Uint8Array.from(atob(track.spectrum), (c) => c.charCodeAt(0));
const frames = Math.floor(bytes.length / track.bands);
const beats = track.beats as [number, number][];

export const TRACK_SECONDS = track.duration;

/** Band value 0..1 at a time, linearly interpolated between analysis frames. */
export function band(seconds: number, index: number) {
  const position = Math.max(0, Math.min(frames - 1.001, seconds * track.fps));
  const from = Math.floor(position);
  const mix = position - from;
  const a = bytes[from * track.bands + index] ?? 0;
  const b = bytes[(from + 1) * track.bands + index] ?? 0;
  return (a + (b - a) * mix) / 255;
}

/** Average of a band range: 0-3 is the kick and bass, 10-15 the hats. */
export function level(seconds: number, from = 0, to = 4) {
  let total = 0;
  for (let i = from; i < to; i++) total += band(seconds, i);
  return total / (to - from);
}

/** All bands at a time, for spectrum bars. */
export function spectrum(seconds: number) {
  return Array.from({ length: track.bands }, (_, i) => band(seconds, i));
}

/** A pulse that jumps on each detected beat and decays over `decay` seconds. */
export function beatPulse(seconds: number, decay = 0.35, minStrength = 0.15) {
  let lo = 0;
  let hi = beats.length - 1;
  // Last beat at or before `seconds`.
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid][0] <= seconds) lo = mid + 1;
    else hi = mid - 1;
  }
  for (let i = hi; i >= 0 && seconds - beats[i][0] < decay; i--) {
    if (beats[i][1] >= minStrength) {
      const age = seconds - beats[i][0];
      return Math.min(1, beats[i][1] * 1.6) * (1 - age / decay) ** 2;
    }
  }
  return 0;
}

/** Number of beats so far, for things that step on the beat. */
export function beatCount(seconds: number, minStrength = 0.15) {
  let count = 0;
  for (const [at, strength] of beats) {
    if (at > seconds) break;
    if (strength >= minStrength) count++;
  }
  return count;
}

/** The song's steady grid, fitted to the detected beats: 104 BPM. */
export const BEAT = 0.5765;
const BEAT_OFFSET = 0.45;

/** Beat number and 0..1 phase within it, for choreography. */
export function beatGrid(seconds: number) {
  const x = (seconds - BEAT_OFFSET) / BEAT;
  const n = Math.floor(x);
  return { n, p: x - n };
}
