import narration from "./narration.json";
import script from "./script.json";

// The launch video's clock. Each beat is one short spoken line with its
// caption: as long as the line (narration.json, written by
// scripts/launch-voice.py) plus a little lead-in and its `hold`. Beats of
// the same scene share one picture, so a scene runs from its first beat to
// its last.

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export type SceneId = "title" | "thread" | "settle" | "assistant" | "risk" | "builder" | "end";

export type Beat = {
  id: string;
  scene: SceneId;
  kicker: string;
  text: string;
  /** Seconds from the start of the video. */
  start: number;
  /** Seconds of speech. */
  seconds: number;
  /** When the next beat (or the scene) takes over. */
  end: number;
};
export type Scene = { id: SceneId; start: number; end: number; beats: Beat[] };

const LEAD = 0.35;
const spoken = narration.lines as Record<string, { seconds: number }>;

function build() {
  const beats: Beat[] = [];
  const scenes: Scene[] = [];
  let clock = 0;
  for (const raw of script.beats) {
    const scene = raw.scene as SceneId;
    const seconds = spoken[raw.id]?.seconds ?? 3;
    const begin = clock;
    const start = begin + LEAD;
    clock = start + seconds + raw.hold;
    const beat: Beat = { id: raw.id, scene, kicker: raw.kicker, text: raw.text, start, seconds, end: clock };
    beats.push(beat);
    const last = scenes.at(-1);
    if (last?.id === scene) {
      last.end = clock;
      last.beats.push(beat);
    } else {
      scenes.push({ id: scene, start: begin, end: clock, beats: [beat] });
    }
  }
  return { beats, scenes, total: clock };
}

export const { beats, scenes, total } = build();
export const DURATION = Math.ceil(total * FPS);

export const beatOf = (id: string) => beats.find((beat) => beat.id === id)!;
export const sceneOf = (id: SceneId) => scenes.find((scene) => scene.id === id)!;

/** Frame of a beat's spoken start, counted from the start of its scene. */
export const cue = (id: string, offsetSeconds = 0) => {
  const beat = beatOf(id);
  return Math.round((beat.start - sceneOf(beat.scene).start + offsetSeconds) * FPS);
};
/** Frame where a beat's speech ends, counted from the start of its scene. */
export const cueEnd = (id: string, offsetSeconds = 0) => {
  const beat = beatOf(id);
  return Math.round((beat.start + beat.seconds - sceneOf(beat.scene).start + offsetSeconds) * FPS);
};
/** Frame where a beat hands over, counted from the start of its scene. */
export const cueOut = (id: string) => {
  const beat = beatOf(id);
  return Math.round((beat.end - sceneOf(beat.scene).start) * FPS);
};
export const sceneFrames = (id: SceneId) => {
  const scene = sceneOf(id);
  return Math.round((scene.end - scene.start) * FPS);
};
