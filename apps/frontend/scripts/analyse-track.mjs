#!/usr/bin/env node
// Precompute what the landing track looks like, so the hero field can move
// in time with it before anyone presses play (browsers only allow live
// audio analysis after a gesture). Writes 16 log-spaced bands at 15 fps,
// packed to bytes, plus beat times with their strength.
//
//   node scripts/analyse-track.mjs public/audio/a-litte-idea.opus
//
// Output: src/data/track.json. Requires ffmpeg on PATH.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

const input = process.argv[2];
if (!input) {
  console.error("usage: node scripts/analyse-track.mjs <audio file>");
  process.exit(1);
}

const SAMPLE_RATE = 22050;
const FPS = 15;
const WINDOW = 2048;
const BANDS = 16;
const MIN_HZ = 50;
const MAX_HZ = 10000;

// Mono float PCM straight from ffmpeg's stdout.
const raw = execFileSync(
  "ffmpeg",
  ["-v", "error", "-i", input, "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "-"],
  { maxBuffer: 1 << 30 },
);
const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
const duration = pcm.length / SAMPLE_RATE;
const hop = Math.round(SAMPLE_RATE / FPS);

// Iterative radix-2 FFT over a Hann-windowed frame.
const real = new Float64Array(WINDOW);
const imag = new Float64Array(WINDOW);
const hann = Float64Array.from(
  { length: WINDOW },
  (_, i) => 0.5 * (1 - Math.cos((2 * Math.PI * i) / (WINDOW - 1))),
);
const levels = Math.log2(WINDOW);
const reversed = Uint32Array.from({ length: WINDOW }, (_, i) => {
  let out = 0;
  for (let bit = 0; bit < levels; bit++) out = (out << 1) | ((i >> bit) & 1);
  return out;
});

function transform() {
  for (let i = 0; i < WINDOW; i++) {
    const j = reversed[i];
    if (j <= i) continue;
    [real[i], real[j]] = [real[j], real[i]];
    [imag[i], imag[j]] = [imag[j], imag[i]];
  }
  for (let span = 2; span <= WINDOW; span <<= 1) {
    const angle = (-2 * Math.PI) / span;
    for (let block = 0; block < WINDOW; block += span) {
      for (let k = 0; k < span / 2; k++) {
        const cos = Math.cos(angle * k);
        const sin = Math.sin(angle * k);
        const even = block + k;
        const odd = even + span / 2;
        const oddReal = real[odd] * cos - imag[odd] * sin;
        const oddImag = real[odd] * sin + imag[odd] * cos;
        real[odd] = real[even] - oddReal;
        imag[odd] = imag[even] - oddImag;
        real[even] += oddReal;
        imag[even] += oddImag;
      }
    }
  }
}

// Bin ranges for bands spaced evenly in pitch.
const binWidth = SAMPLE_RATE / WINDOW;
const bandBins = Array.from({ length: BANDS }, (_, b) => {
  const low = MIN_HZ * (MAX_HZ / MIN_HZ) ** (b / BANDS);
  const high = MIN_HZ * (MAX_HZ / MIN_HZ) ** ((b + 1) / BANDS);
  const from = Math.max(1, Math.round(low / binWidth));
  return [from, Math.max(from + 1, Math.round(high / binWidth))];
});

const frameCount = Math.floor((pcm.length - WINDOW) / hop);
const energy = new Float32Array(frameCount * BANDS);
const onset = new Float32Array(frameCount);
for (let frame = 0; frame < frameCount; frame++) {
  const start = frame * hop;
  for (let i = 0; i < WINDOW; i++) {
    real[i] = pcm[start + i] * hann[i];
    imag[i] = 0;
  }
  transform();
  for (let b = 0; b < BANDS; b++) {
    const [from, to] = bandBins[b];
    let power = 0;
    for (let k = from; k < to; k++) power += real[k] ** 2 + imag[k] ** 2;
    // log1p keeps quiet passages visible without loud ones saturating.
    energy[frame * BANDS + b] = Math.log1p((power / (to - from)) * 40);
  }
  // Onset strength: positive change in the six lowest bands.
  if (frame > 0) {
    let rise = 0;
    for (let b = 0; b < 6; b++)
      rise += Math.max(0, energy[frame * BANDS + b] - energy[(frame - 1) * BANDS + b]);
    onset[frame] = rise;
  }
}

// Scale every band between its own 10th and 98.5th percentile, so the
// quieter treble still moves, and pack to one byte per value.
const packed = new Uint8Array(frameCount * BANDS);
for (let b = 0; b < BANDS; b++) {
  const sorted = Array.from({ length: frameCount }, (_, f) => energy[f * BANDS + b]).sort(
    (a, c) => a - c,
  );
  const low = sorted[Math.floor(frameCount * 0.1)];
  const high = sorted[Math.floor(frameCount * 0.985)];
  for (let f = 0; f < frameCount; f++) {
    const value = (energy[f * BANDS + b] - low) / (high - low || 1);
    packed[f * BANDS + b] = Math.round(Math.min(1, Math.max(0, value)) * 255);
  }
}

// A beat is a local onset peak well above the surrounding second.
const beats = [];
const strongest = onset.reduce((max, value) => Math.max(max, value), 0) || 1;
let lastBeat = -Infinity;
for (let f = 1; f < frameCount - 1; f++) {
  let total = 0;
  const from = Math.max(0, f - FPS);
  const to = Math.min(frameCount, f + FPS);
  for (let k = from; k < to; k++) total += onset[k];
  const average = total / (to - from);
  const at = (f * hop + WINDOW / 2) / SAMPLE_RATE;
  const isPeak = onset[f] >= onset[f - 1] && onset[f] > onset[f + 1];
  if (isPeak && onset[f] > average * 1.6 && onset[f] > strongest * 0.12 && at - lastBeat >= 0.25) {
    beats.push([+at.toFixed(2), +(onset[f] / strongest).toFixed(2)]);
    lastBeat = at;
  }
}

const target = path.resolve("src/data/track.json");
const json = JSON.stringify({
  duration: +duration.toFixed(2),
  fps: FPS,
  bands: BANDS,
  spectrum: Buffer.from(packed).toString("base64"),
  beats,
});
writeFileSync(target, json);
console.log(
  `${duration.toFixed(1)}s · ${frameCount} frames · ${beats.length} beats · ${Math.round(json.length / 1024)} KB → ${path.relative(process.cwd(), target)}`,
);
