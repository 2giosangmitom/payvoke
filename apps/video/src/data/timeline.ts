import lyrics from "./lyrics.json";

type Word = { text: string; start: number; end: number };
export type LyricLine = { text: string; start: number; end: number; words: Word[] };

// Song structure from scripts/align-lyrics.mjs, named for the scenes. The
// sheet's "Outro" is really a loud instrumental finale followed by a short
// fade, so it is split where the energy drops.

export type SectionName =
  | "intro"
  | "verse1"
  | "pre1"
  | "chorus1"
  | "drop1"
  | "verse2"
  | "pre2"
  | "chorus2"
  | "bridge"
  | "drop2"
  | "final"
  | "finale"
  | "outro";

const ORDER: SectionName[] = [
  "intro",
  "verse1",
  "pre1",
  "chorus1",
  "drop1",
  "verse2",
  "pre2",
  "chorus2",
  "bridge",
  "drop2",
  "final",
  "outro",
];

export const OUTRO_FADE_START = 256;

const raw = lyrics.sections.map((s, i) => ({
  id: ORDER[i],
  name: s.name,
  style: s.style,
  start: s.start,
  end: s.end,
}));
const outro = raw.at(-1)!;

export const SECTIONS: {
  id: SectionName;
  name: string;
  style: string;
  start: number;
  end: number;
}[] = [
  ...raw.slice(0, -1),
  { ...outro, id: "finale", name: "Finale", end: OUTRO_FADE_START },
  { ...outro, start: OUTRO_FADE_START },
];

export const LINES: (LyricLine & { section: SectionName })[] = lyrics.lines.map((l) => ({
  ...l,
  section: ORDER[l.section],
}));

export const section = (id: SectionName) => SECTIONS.find((s) => s.id === id)!;
export const linesOf = (id: SectionName) => LINES.filter((l) => l.section === id);
export const DURATION = SECTIONS.at(-1)!.end;
