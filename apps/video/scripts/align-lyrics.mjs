#!/usr/bin/env node
// Lay the lyric sheet over Whisper's word timestamps. Whisper mishears sung
// words, so instead of trusting its text we align the two word sequences
// (Needleman-Wunsch with fuzzy word similarity) and take only the times.
// Words Whisper missed get times interpolated from their neighbours.
//
//   node scripts/align-lyrics.mjs scripts/words.json
//
// Output: src/data/lyrics.json
import { readFileSync, writeFileSync } from "node:fs";

const [wordsPath] = process.argv.slice(2);
if (!wordsPath) {
  console.error("usage: node scripts/align-lyrics.mjs <words.json>");
  process.exit(1);
}

const norm = (w) =>
  w
    .toLowerCase()
    .replace(/[^a-z0-9']/g, "")
    .replace(/'/g, "");

// --- Lyric sheet -------------------------------------------------------
const sheet = readFileSync(new URL("../src/data/lyrics.txt", import.meta.url), "utf8").split("\n");
const sections = [];
const lines = [];
for (const raw of sheet) {
  const line = raw.trim();
  if (!line) continue;
  if (line.startsWith("[")) {
    const body = line.slice(1, -1);
    const prev = sections.at(-1);
    // A header names a section; the bracket lines right after describe it.
    if (prev && prev.lines === 0 && /^\d+s\b|,/.test(body) && !body.includes("—")) {
      prev.notes.push(body);
    } else if (/—/.test(body) || /^Fade Out$/.test(body)) {
      const [name, style = ""] = body.split(" — ");
      sections.push({ name: name.trim(), style: style.trim(), notes: [], lines: 0 });
    } else if (prev) prev.notes.push(body);
    continue;
  }
  const section = sections.length - 1;
  sections[section].lines++;
  lines.push({ section, text: line, words: line.split(/\s+/).map((text) => ({ text })) });
}

const lyricWords = lines.flatMap((l, li) => l.words.map((w, wi) => ({ li, wi, n: norm(w.text) })));

// --- Whisper words -----------------------------------------------------
const asr = JSON.parse(readFileSync(wordsPath, "utf8"))
  .flatMap((s) => s.words)
  .map((w) => ({ n: norm(w.w), s: w.s, e: w.e }))
  .filter((w) => w.n);

// Sung words Whisper reliably hears as something else.
const ALIASES = { payvoke: ["pave", "paid", "pavo", "pavoke"] };

function similarity(a, b) {
  if (a === b || ALIASES[a]?.includes(b)) return 2;
  if (!a || !b) return -1;
  // Levenshtein ratio
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  const ratio = 1 - d[a.length][b.length] / Math.max(a.length, b.length);
  return ratio >= 0.6 ? 1 : -1;
}

const GAP = -0.6;
const n = lyricWords.length;
const m = asr.length;
const score = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
const move = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 diag, 2 up, 3 left
for (let i = 1; i <= n; i++) {
  score[i][0] = i * GAP;
  move[i][0] = 2;
}
// Skipping ASR words (ad-libs, hallucinations) is free at the ends.
for (let j = 1; j <= m; j++) {
  score[0][j] = 0;
  move[0][j] = 3;
}
for (let i = 1; i <= n; i++)
  for (let j = 1; j <= m; j++) {
    const diag = score[i - 1][j - 1] + similarity(lyricWords[i - 1].n, asr[j - 1].n);
    const up = score[i - 1][j] + GAP;
    const left = score[i][j - 1] + (i === n ? 0 : GAP * 0.5);
    const best = Math.max(diag, up, left);
    score[i][j] = best;
    move[i][j] = best === diag ? 1 : best === up ? 2 : 3;
  }

const times = Array.from({ length: n }, () => null);
for (let i = n, j = m; i > 0 || j > 0;) {
  const mv = move[i][j];
  if (mv === 1) {
    if (similarity(lyricWords[i - 1].n, asr[j - 1].n) > 0)
      times[i - 1] = [asr[j - 1].s, asr[j - 1].e];
    i--;
    j--;
  } else if (mv === 2) i--;
  else j--;
}
const matched = times.filter(Boolean).length;

// Fill gaps. Missing words sit right after the last heard word of their own
// line (or right before the next one), never stretched across a long break.
const WORD = 0.32;
for (let i = 0; i < n; i++) {
  if (times[i]) continue;
  let a = i - 1;
  while (a >= 0 && !times[a]) a--;
  let b = i;
  while (b < n && !times[b]) b++;
  const run = b - a - 1;
  const from = a >= 0 ? times[a][1] : 0;
  const to = b < n ? times[b][0] : from + run * WORD;
  for (let k = a + 1; k < b; k++) {
    const sameAsNext = b < n && lyricWords[k].li === lyricWords[b].li;
    const sameAsPrev = a >= 0 && lyricWords[k].li === lyricWords[a].li;
    let s;
    if (to - from <= run * WORD * 1.6 || (sameAsNext && sameAsPrev))
      s = from + ((k - a - 1) * (to - from)) / run;
    else if (sameAsNext || !sameAsPrev) s = to - (b - k) * WORD;
    else s = from + (k - a - 1) * WORD;
    times[k] = [s, s + Math.min(WORD, (to - from) / run) * 0.9];
  }
  i = b - 1;
}

lyricWords.forEach((w, i) => {
  const word = lines[w.li].words[w.wi];
  word.start = +times[i][0].toFixed(2);
  word.end = +times[i][1].toFixed(2);
});
for (const l of lines) {
  l.start = l.words[0].start;
  l.end = l.words.at(-1).end;
}

// Section spans: sung sections run from their first line to the next
// section's start; instrumental ones fill the space between.
const duration = Number(
  JSON.parse(
    readFileSync(
      new URL("../../frontend/src/features/landing/track.json", import.meta.url),
      "utf8",
    ),
  ).duration,
);
const firstLine = sections.map((_, s) => lines.find((l) => l.section === s));
const lastLine = sections.map((_, s) => lines.findLast((l) => l.section === s));
const out = sections.map((s) => ({
  name: s.name,
  style: s.style,
  notes: s.notes,
  start: 0,
  end: 0,
}));
for (let i = 0; i < out.length; i++) {
  if (firstLine[i]) out[i].start = +Math.max(0, firstLine[i].start - 0.6).toFixed(2);
  else out[i].start = i === 0 ? 0 : +(lastLine.slice(0, i).findLast(Boolean)?.end + 0.4).toFixed(2);
}
for (let i = 0; i < out.length; i++) out[i].end = i + 1 < out.length ? out[i + 1].start : duration;
// "Fade Out" is a marker, not a section.
const fade = out.findIndex((s) => s.name === "Fade Out");
if (fade > 0) {
  out[fade - 1].end = duration;
  out.splice(fade, 1);
}

writeFileSync(
  new URL("../src/data/lyrics.json", import.meta.url),
  JSON.stringify(
    {
      sections: out,
      lines: lines.map(({ section, text, start, end, words }) => ({
        section,
        text,
        start,
        end,
        words,
      })),
    },
    null,
    1,
  ),
);
console.log(`${matched}/${n} words matched`);
for (const s of out)
  console.log(`${s.start.toFixed(1).padStart(6)} – ${s.end.toFixed(1).padStart(6)}  ${s.name}`);
for (const l of lines)
  console.log(`${l.start.toFixed(2).padStart(7)} ${l.end.toFixed(2).padStart(7)}  ${l.text}`);
