import { beatGrid } from "../lib/audio";
import { STAND, type Pose } from "./person";

// Choreography on the song's beat grid (104 BPM). Each move is a pose as a
// function of the beat number n and the phase p within the beat.

const bend = (k: number): Partial<Pose> => ({
  hipY: 0.55 - k * 0.13,
  lHip: -0.55 * k,
  rHip: -0.55 * k,
  lKnee: 1.1 * k,
  rKnee: 1.1 * k,
});
const hit = (p: number) => Math.max(0, 1 - p * 3); // sharp on the beat, then relax

export type Move = "bounce" | "wave" | "point" | "clap" | "jump" | "robot" | "step" | "idea";
export const ROUTINE: Move[] = ["bounce", "point", "clap", "wave", "robot", "step", "jump", "idea"];

export function dance(move: Move, n: number, p: number): Pose {
  const s = n % 2 ? 1 : -1;
  switch (move) {
    case "bounce":
      return {
        ...STAND,
        ...bend(hit(p)),
        lSh: [-0.9 + hit(p) * (s > 0 ? 0.6 : 0), 0.3],
        rSh: [-0.9 + hit(p) * (s < 0 ? 0.6 : 0), 0.3],
        lEl: -1.3,
        rEl: -1.3,
        headX: hit(p) * 0.25,
      };
    case "wave":
      return {
        ...STAND,
        ...bend(0.25),
        lSh: [-0.2, 2.6 + Math.sin((n + p) * Math.PI) * 0.4],
        rSh: [-0.2, 2.6 - Math.sin((n + p) * Math.PI) * 0.4],
        lEl: -0.2,
        rEl: -0.2,
        headZ: Math.sin((n + p) * Math.PI) * 0.2,
        twist: Math.sin((n + p) * Math.PI) * 0.25,
      };
    case "point":
      return s > 0
        ? {
            ...STAND,
            ...bend(0.2),
            rSh: [-0.4, 2.4],
            rEl: 0,
            lSh: [0, 0.3],
            lEl: -1.4,
            headX: -0.3,
            headZ: -0.2,
            twist: -0.2,
          }
        : {
            ...STAND,
            ...bend(0.35),
            rSh: [-0.6, 0.7],
            rEl: 0,
            lSh: [0, 0.3],
            lEl: -1.4,
            headX: 0.25,
            headZ: 0.15,
            twist: 0.25,
          };
    case "clap":
      return {
        ...STAND,
        ...bend(hit(p) * 0.5),
        lSh: [-0.3, 2.9 - hit(p) * 0.5],
        rSh: [-0.3, 2.9 - hit(p) * 0.5],
        lEl: -0.6 - hit(p) * 0.5,
        rEl: -0.6 - hit(p) * 0.5,
        headX: -0.2,
      };
    case "jump": {
      const air = Math.sin(Math.min(1, p * 1.4) * Math.PI);
      return {
        ...STAND,
        hipY: 0.55 + air * 0.35,
        lSh: [-0.2, 2.7],
        rSh: [-0.2, 2.7],
        lEl: -0.2,
        rEl: -0.2,
        lKnee: air * 0.9,
        rKnee: air * 0.9,
        lHip: -air * 0.4,
        rHip: -air * 0.4,
        headX: -0.25,
      };
    }
    case "robot":
      return {
        ...STAND,
        lSh: [s > 0 ? -1.57 : 0, 0.1],
        rSh: [s > 0 ? 0 : -1.57, 0.1],
        lEl: s > 0 ? 0 : -1.57,
        rEl: s > 0 ? -1.57 : 0,
        headY: s * 0.45,
        twist: s * 0.2,
      };
    case "step":
      return {
        ...STAND,
        ...bend(0.2),
        twist: s * 0.45,
        lHip: s > 0 ? -0.5 : 0.1,
        rHip: s > 0 ? 0.1 : -0.5,
        lSh: [s * 0.6, 0.2],
        rSh: [-s * 0.6, 0.2],
        lEl: -0.6,
        rEl: -0.6,
        headY: -s * 0.2,
      };
    case "idea":
      // hands make a little cube over the head
      return {
        ...STAND,
        ...bend(hit(p) * 0.3),
        lSh: [-0.6, 2.2],
        rSh: [-0.6, 2.2],
        lEl: -1.6,
        rEl: -1.6,
        headX: -0.15,
      };
  }
}

/** The crew's move at time `now`: a new move every eight beats. */
export function routine(now: number, offset = 0) {
  const { n, p } = beatGrid(now);
  const move = ROUTINE[(Math.floor(n / 8) + offset + ROUTINE.length * 100) % ROUTINE.length];
  return { move, n, p, pose: dance(move, n, p) };
}
