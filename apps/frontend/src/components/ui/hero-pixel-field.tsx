"use client";

import { useEffect, useRef } from "react";
import { cn } from "cn";

// The field uses the same ordered-dither approach as Omarchy's live hero canvas.
// The visualizer lives in the same lattice: every column is a spectrum band,
// mirrored so bass sits at both edges, rising from the floor as a dithered
// skyline. Bands rise instantly and fall with gravity, like cava.
// Ink comes from the --field-* tokens, so the canvas follows light and dark mode.
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28,
  52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 21,
  53, 29, 61, 19, 51, 27, 59, 23, 55, 31, 63,
];

const NOISE_SIZE = 128;
/** Tallest the skyline may reach, as a share of the space above the floor. */
const MAX_SKYLINE_SHARE = 0.55;

type Ink = Record<"background" | "dim" | "mid" | "lit" | "hover" | "crest", string>;

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeNoise() {
  const random = seededRandom(0x509475);
  let noise = Float32Array.from({ length: NOISE_SIZE * NOISE_SIZE }, random);

  for (let pass = 0; pass < 2; pass++) {
    const blurred = new Float32Array(noise.length);
    for (let y = 0; y < NOISE_SIZE; y++) {
      for (let x = 0; x < NOISE_SIZE; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum +=
              noise[
                ((y + dy + NOISE_SIZE) % NOISE_SIZE) * NOISE_SIZE +
                  ((x + dx + NOISE_SIZE) % NOISE_SIZE)
              ];
          }
        }
        blurred[y * NOISE_SIZE + x] = sum / 9;
      }
    }
    noise = blurred;
  }

  let min = Infinity;
  let max = -Infinity;
  for (const value of noise) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const span = max - min || 1;
  for (let i = 0; i < noise.length; i++) noise[i] = (noise[i] - min) / span;
  return noise;
}

function sampleNoise(noise: Float32Array, x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const a = ((xi % NOISE_SIZE) + NOISE_SIZE) % NOISE_SIZE;
  const b = ((yi % NOISE_SIZE) + NOISE_SIZE) % NOISE_SIZE;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x1 = (a + 1) % NOISE_SIZE;
  const y1 = (b + 1) % NOISE_SIZE;
  const upper = noise[b * NOISE_SIZE + a] * (1 - sx) + noise[b * NOISE_SIZE + x1] * sx;
  const lower = noise[y1 * NOISE_SIZE + a] * (1 - sx) + noise[y1 * NOISE_SIZE + x1] * sx;
  return upper * (1 - sy) + lower * sy;
}

function readInk(): Ink {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    background: token("--field-bg"),
    dim: token("--field-dim"),
    mid: token("--field-mid"),
    lit: token("--field-lit"),
    hover: token("--field-hover"),
    crest: token("--field-crest"),
  };
}

export type HeroPixelFieldProps = {
  className?: string;
  /** Live spectrum source. Without one the skyline idles as a low, slow wave. */
  getAnalyser?: () => AnalyserNode | null;
};

/**
 * Fills its positioned parent. A child marked `data-field-anchor` pins the
 * lattice; the skyline stands on the parent's bottom edge.
 */
export function HeroPixelField({ className, getAnalyser }: HeroPixelFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef(getAnalyser);
  analyserRef.current = getAnalyser;

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = canvas?.parentElement;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !hero || !context) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const noise = makeNoise();
    const random = seededRandom(0x1e372c);
    const jitter = Float32Array.from({ length: 64 * 64 }, random);
    let ink = readInk();

    let width = 0;
    let height = 0;
    let cell = 10;
    let anchorX = 0;
    let anchorY = 0;
    let firstCol = 0;
    let firstRow = 0;
    let columns = 0;
    let rows = 0;
    let floorRow = 0;
    let ramp = new Float32Array(0);
    let levels = new Float32Array(0);
    let fall = new Float32Array(0);
    let targets = new Float32Array(0);
    let spectrum = new Uint8Array(0);
    let frame = 0;
    let lastPaint = -Infinity;
    let inView = true;

    const measure = () => {
      const bounds = hero.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.round(bounds.width * dpr);
      height = Math.round(bounds.height * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      // Keep the lattice attached to the centered wordmark.
      const slot = hero.querySelector<HTMLElement>("[data-field-anchor]")?.getBoundingClientRect();
      cell = Math.max(7, Math.min(13, (slot?.width ?? bounds.width * 0.72) / 81)) * dpr;
      anchorX = slot ? (slot.left - bounds.left) * dpr : width / 2;
      anchorY = slot ? (slot.top - bounds.top) * dpr : height / 2;
      firstCol = Math.floor(-anchorX / cell) - 1;
      firstRow = Math.floor(-anchorY / cell) - 1;
      columns = Math.ceil(width / cell) - firstCol + 2;
      rows = Math.ceil(height / cell) - firstRow + 2;
      floorRow = Math.floor((height - anchorY) / cell) - 1;
      ramp = new Float32Array(columns * rows);
      if (levels.length !== columns) {
        levels = new Float32Array(columns);
        fall = new Float32Array(columns);
        targets = new Float32Array(columns);
      }

      for (let r = 0; r < rows; r++) {
        const y = anchorY + (firstRow + r + 0.5) * cell;
        const ny = (y / height - 0.5) * 2;
        const topClear = Math.min(1, Math.max(0.24, (y / dpr - 24) / 125));
        for (let c = 0; c < columns; c++) {
          const x = anchorX + (firstCol + c + 0.5) * cell;
          const nx = (x / width - 0.5) * 2;
          const distance = Math.sqrt(nx * nx + ny * ny * 0.82);
          const edge = Math.min(1, Math.max(0, (distance - 0.26) / 0.89));
          ramp[r * columns + c] = (0.12 + 0.88 * edge * edge) * topClear;
        }
      }
    };

    // One band per column: centre = treble, edges = bass, log-spaced 40 Hz-12 kHz.
    const updateLevels = (time: number, analyser: AnalyserNode | null) => {
      if (!columns) return;
      if (analyser) {
        if (spectrum.length !== analyser.frequencyBinCount)
          spectrum = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(spectrum);
      }
      const nyquist = (analyser?.context.sampleRate ?? 48000) / 2;
      const low = Math.log(40);
      const high = Math.log(12000);
      const centre = (columns - 1) / 2;
      for (let c = 0; c < columns; c++) {
        const edge = Math.abs(c - centre) / centre; // 0 centre, 1 edges
        let target: number;
        if (analyser) {
          const band = 1 - edge;
          const step = 1 / centre;
          const from = Math.exp(low + (high - low) * band);
          const to = Math.exp(low + (high - low) * Math.min(1, band + step));
          const start = Math.floor((from / nyquist) * spectrum.length);
          const end = Math.max(start + 1, Math.ceil((to / nyquist) * spectrum.length));
          let sum = 0;
          for (let i = start; i < end; i++) sum += spectrum[i] ?? 0;
          // Lift the treble a little; raw FFT energy drops off with frequency.
          const tilt = 0.75 + 0.5 * band;
          // Edges stand taller, like Omarchy's skyline framing the copy.
          const frame = 0.7 + 0.55 * edge * edge;
          target = Math.min(1, Math.pow((sum / (end - start) / 255) * tilt, 1.9) * frame);
        } else {
          const wave = sampleNoise(noise, c * 0.13 + time * 0.3, time * 0.1);
          target = (0.06 + 0.22 * edge * edge) * (0.55 + 0.45 * wave);
        }
        targets[c] = target;
      }
      // A light blur across neighbours turns single-bin spikes into towers.
      for (let c = 0; c < columns; c++) {
        const target =
          0.15 * (targets[c - 1] ?? targets[c]) +
          0.7 * targets[c] +
          0.15 * (targets[c + 1] ?? targets[c]);
        if (target >= levels[c]) {
          levels[c] = target;
          fall[c] = 0;
        } else {
          fall[c] += 0.0016;
          levels[c] = Math.max(target, levels[c] - fall[c]);
        }
      }
    };

    const draw = (now: number) => {
      if (!width || !height) return;
      const still = motionQuery.matches;
      const time = still ? 0 : now / 1000;
      context.fillStyle = ink.background;
      context.fillRect(0, 0, width, height);

      // A slow wandering light keeps the field alive without pointer input.
      const spriteX = width * (0.5 + 0.43 * Math.sin(time * 0.62));
      const spriteY = height * (0.49 + 0.36 * Math.sin(time * 0.39 + 1.4));
      const reach = 12 * cell;
      const skylineRows = Math.max(4, (floorRow - firstRow) * MAX_SKYLINE_SHARE);

      for (let r = 0; r < rows; r++) {
        const row = firstRow + r;
        const top = anchorY + row * cell;
        const y = Math.round(top);
        const h = Math.round(top + cell) - y;
        const cy = top + cell / 2;
        const fromFloor = floorRow - row;
        for (let c = 0; c < columns; c++) {
          const col = firstCol + c;
          const left = anchorX + col * cell;
          const cx = left + cell / 2;
          const shade = ramp[r * columns + c];

          let lum = 0;
          if (shade > 0.002) {
            const u = col / 9;
            const v = row / 9;
            const drift =
              0.6 * sampleNoise(noise, u + time * 0.14, v - time * 0.055) +
              0.4 * sampleNoise(noise, u * 0.55 - time * 0.08, v * 0.55 + time * 0.06);
            const flicker =
              0.5 + 0.5 * Math.sin(time * 1.1 + jitter[(row & 63) * 64 + (col & 63)] * 6.283);
            lum = shade * (0.3 + 0.52 * drift * drift + 0.18 * flicker) * 0.67;
          }

          // Skyline: solid near the floor, thinning into a checker toward its top.
          let tower = 0;
          const towerRows = levels[c] * skylineRows;
          if (fromFloor >= 0 && fromFloor < towerRows) {
            const t = fromFloor / towerRows;
            tower = 1.05 * Math.pow(1 - t, 1.3);
            lum = Math.max(lum, tower);
          }

          const spriteDistance = Math.hypot(cx - spriteX, cy - spriteY);
          const heat =
            still || spriteDistance > reach ? 0 : Math.pow(1 - spriteDistance / reach, 2) * 0.65;
          lum += 0.94 * heat;

          const threshold =
            0.78 * ((BAYER[(row & 7) * 8 + (col & 7)] + 0.5) / 64) +
            0.22 * jitter[(row & 63) * 64 + (col & 63)];
          if (lum <= threshold) continue;
          context.fillStyle =
            heat > 0.58
              ? ink.crest
              : heat > 0.34
                ? ink.hover
                : heat > 0.17 || tower > 0.85
                  ? ink.lit
                  : heat > 0.07 || tower > 0.25
                    ? ink.mid
                    : ink.dim;
          const x = Math.round(left);
          context.fillRect(x, y, Math.round(left + cell) - x, h);
        }
      }
    };

    const animate = (now: number) => {
      frame = 0;
      if (!inView || document.hidden || motionQuery.matches) return;
      const analyser = analyserRef.current?.() ?? null;
      // Live audio paints every frame; the idle field is throttled to ~30 fps.
      if (analyser || now - lastPaint >= 32) {
        lastPaint = now;
        updateLevels(now / 1000, analyser);
        draw(now);
      }
      frame = requestAnimationFrame(animate);
    };

    const schedule = () => {
      if (!frame && inView && !document.hidden && !motionQuery.matches) {
        frame = requestAnimationFrame(animate);
      }
    };
    const paintStill = () => {
      updateLevels(0, null);
      draw(0);
    };
    const visibility = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (inView) schedule();
        else {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      },
      { rootMargin: "80px" },
    );
    const resize = new ResizeObserver(() => {
      measure();
      if (motionQuery.matches) paintStill();
      else draw(performance.now());
      schedule();
    });
    const theme = new MutationObserver(() => {
      ink = readInk();
      if (motionQuery.matches) paintStill();
      else draw(performance.now());
    });
    const onPageVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else schedule();
    };
    const onMotionChange = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (motionQuery.matches) paintStill();
      else schedule();
    };

    resize.observe(hero);
    const anchor = hero.querySelector("[data-field-anchor]");
    if (anchor) resize.observe(anchor);
    visibility.observe(hero);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
    document.addEventListener("visibilitychange", onPageVisibility);
    motionQuery.addEventListener("change", onMotionChange);
    measure();
    paintStill();
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      visibility.disconnect();
      theme.disconnect();
      document.removeEventListener("visibilitychange", onPageVisibility);
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={cn("pointer-events-none absolute inset-0 block size-full", className)}
      aria-hidden="true"
    />
  );
}
