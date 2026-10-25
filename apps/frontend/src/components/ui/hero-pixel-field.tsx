"use client";

import { useEffect, useRef } from "react";
import { cn } from "cn";

// The hero field follows Omarchy's pixel lattice: one grid anchored on the
// hero wordmark slot, every cell dithered through an ordered Bayer matrix,
// and a spectrum mirrored around the centre so the bass frames the copy and
// the treble sits in the middle. The particle wordmark is drawn above it by
// its own canvas, on the same slot.
//
// Before the sound is touched the picture runs from the pre-analysed track
// timeline; once it is on, the live analyser feeds the same picture, so what
// is drawn is exactly what is playing. Beats lift the glow around the pointer
// and the drifting sprite, and a press leaves a short ring in the field.

const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28,
  52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 21,
  53, 29, 61, 19, 51, 27, 59, 23, 55, 31, 63,
];

const NOISE_SIZE = 128;
/** Grid cells per unit of noise: how big the drifting blobs read. */
const CELLS_PER_NOISE = 9;
/** Cursor reach, in grid cells. */
const CURSOR_CELLS = 12;
/** Distance from readable copy at which the pointer glow is fully muted. */
const HUSH_REACH = 96;

/** How much of the field's height the loudest band may climb. */
const SPECTRUM_REACH = 0.92;
/** How dense a column gets, and how much of it wears the main ink. */
const SPECTRUM_DENSITY = 0.7;
const SPECTRUM_HEAT = 0.5;
/** Below this a band is resting and its column shows nothing extra. */
const SPECTRUM_FLOOR = 0.08;
/** How much of a band's height a beat adds, and how fast that fades. */
const BEAT_REACH = 0.8;
const BEAT_DECAY = 0.84;
/** How bright the drifting sprite's glow is, against the pointer's. */
const SPRITE_STRENGTH = 0.7;
/** The wordmark slot is divided into this many field columns. */
const LATTICE_COLUMNS = 81;

type Ink = Record<"background" | "dim" | "mid" | "lit" | "hover" | "crest", string>;

const FALLBACK_INK: Ink = {
  background: "#090f0d",
  dim: "#1e372c",
  mid: "#35614d",
  lit: "#509475",
  hover: "#84b49e",
  crest: "#bcd6cb",
};

function readInk(): Ink {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: token("--field-bg", FALLBACK_INK.background),
    dim: token("--field-dim", FALLBACK_INK.dim),
    mid: token("--field-mid", FALLBACK_INK.mid),
    lit: token("--field-lit", FALLBACK_INK.lit),
    hover: token("--field-hover", FALLBACK_INK.hover),
    crest: token("--field-crest", FALLBACK_INK.crest),
  };
}

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

  // A couple of box passes turn white noise into soft blobs.
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

export type FieldSample = { bands: Float32Array; beat: number };

export type HeroPixelFieldProps = {
  className?: string;
  /** Live or pre-analysed bands. Without one the field only drifts. */
  sample?: (now: number) => FieldSample;
};

/**
 * Fills its positioned parent. A child marked `data-field-anchor` pins the
 * lattice to the hero wordmark slot.
 */
export function HeroPixelField({ className, sample }: HeroPixelFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sampleRef = useRef(sample);
  sampleRef.current = sample;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !host || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const noise = makeNoise();
    const random = seededRandom(0x1e372c);
    const jitter = Float32Array.from({ length: 64 * 64 }, random);
    let ink = readInk();

    const anchor = host.querySelector<HTMLElement>("[data-field-anchor]");
    const quietElements = Array.from(
      host.querySelectorAll<HTMLElement>("h1, p, a, button, [data-field-anchor]"),
    );

    // Device-pixel geometry, recomputed on resize. Everything is drawn on whole
    // device pixels so cell edges stay razor sharp at any DPR.
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let cell = 10;
    let anchorX = 0;
    let anchorY = 0;
    let anchorW = 0;
    let firstCol = 0;
    let firstRow = 0;
    let columns = 0;
    let rows = 0;
    let bottomRow = 0;
    let ramp = new Float32Array(0);
    // Copy, buttons and the wordmark, in CSS px relative to the hero. Cached
    // here so the per-frame glow never forces a layout.
    let quiet: Array<{ l: number; t: number; r: number; b: number }> = [];

    const bandsNow = new Float32Array(32);
    let beatPulse = 0;

    const pointer = { x: -1e4, y: -1e4 };
    let pointerStrength = 0;
    let targetStrength = 0;
    const sprite = { x: -1e4, y: -1e4, strength: 0 };
    let ripples: Array<{ x: number; y: number; born: number }> = [];

    let frame = 0;
    let lastPaint = -Infinity;
    let inView = true;

    const measure = () => {
      const bounds = host.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      pixelRatio = dpr;
      width = Math.round(bounds.width * dpr);
      height = Math.round(bounds.height * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      quiet = [];
      for (const el of quietElements) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        quiet.push({
          l: rect.left - bounds.left,
          t: rect.top - bounds.top,
          r: rect.right - bounds.left,
          b: rect.bottom - bounds.top,
        });
      }

      const slot = anchor?.getBoundingClientRect();
      anchorW = (slot?.width ?? bounds.width * 0.88) * dpr;
      anchorX = slot ? (slot.left - bounds.left) * dpr : (width - anchorW) / 2;
      anchorY = slot ? (slot.top - bounds.top) * dpr : height * 0.16;

      // One lattice for the field: the wordmark slot is divided into
      // LATTICE_COLUMNS columns, and every field cell is one of those columns.
      // Anchoring the grid to the particle canvas keeps the texture at the same
      // scale on a phone as on a wide screen.
      cell = Math.max(3 * dpr, Math.min(13 * dpr, anchorW / LATTICE_COLUMNS));
      firstCol = Math.floor(-anchorX / cell) - 1;
      firstRow = Math.floor(-anchorY / cell) - 1;
      columns = Math.ceil(width / cell) - firstCol + 2;
      rows = Math.ceil(height / cell) - firstRow + 2;
      bottomRow = Math.floor((height - anchorY) / cell) - 1;

      // The field thins out around the middle of the hero, which is where the
      // wordmark and the copy sit. The pointer's glow is hushed separately, so
      // the resting field keeps its texture right up to the controls.
      ramp = new Float32Array(columns * rows);
      for (let r = 0; r < rows; r++) {
        const y = anchorY + (firstRow + r + 0.5) * cell;
        const ny = (y / height) * 2 - 1;
        const topClear = Math.min(1, Math.max(0.16, (y / dpr - 24) / 130));
        for (let c = 0; c < columns; c++) {
          const x = anchorX + (firstCol + c + 0.5) * cell;
          const nx = (x / width) * 2 - 1;
          const distance = Math.sqrt(nx * nx + ny * ny * 0.82);
          const eased = Math.min(1, Math.max(0, (distance - 0.42) / 0.85));
          ramp[r * columns + c] = eased * eased * topClear;
        }
      }
      return true;
    };

    /** How much glow is allowed at a point (CSS px, relative to the hero). */
    const strengthAt = (x: number, y: number) => {
      let nearest = Infinity;
      for (const rect of quiet) {
        const dx = Math.max(rect.l - x, 0, x - rect.r);
        const dy = Math.max(rect.t - y, 0, y - rect.b);
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < nearest) nearest = distance;
      }
      return nearest >= HUSH_REACH ? 1 : (nearest / HUSH_REACH) ** 3;
    };

    const draw = (now: number) => {
      if (!width || !height) return;
      const still = reducedMotion.matches;
      const time = still ? 0 : now;
      const seconds = time / 1000;

      context.fillStyle = ink.background;
      context.fillRect(0, 0, width, height);

      // A slow wandering light keeps the field alive without pointer input.
      if (still) {
        sprite.x = width * 0.62;
        sprite.y = height * 0.4;
      } else {
        sprite.x = width * (0.5 + 0.43 * Math.sin(seconds * 0.62));
        sprite.y = height * (0.49 + 0.36 * Math.sin(seconds * 0.39 + 1.4));
      }
      const spriteGoal = still
        ? 0
        : strengthAt(sprite.x / pixelRatio, sprite.y / pixelRatio) * SPRITE_STRENGTH;
      sprite.strength += (spriteGoal - sprite.strength) * 0.08;
      pointerStrength += (targetStrength - pointerStrength) * 0.3;

      let beatNow = 0;
      let listening = false;
      const reader = sampleRef.current;
      if (reader) {
        const heard = reader(time);
        for (let i = 0; i < bandsNow.length; i++) {
          const target = heard.bands[i] ?? 0;
          const rise = target > bandsNow[i];
          bandsNow[i] += (target - bandsNow[i]) * (rise ? 0.7 : 0.14);
          if (bandsNow[i] > 0.01) listening = true;
        }
        beatNow = heard.beat;
        beatPulse = Math.max(beatPulse * BEAT_DECAY, beatNow);
        if (beatPulse < 0.005) beatPulse = 0;
      }

      const reachOf = (level: number) =>
        CURSOR_CELLS * cell * (0.45 + 0.55 * level) * (1 + BEAT_REACH * beatPulse);
      const glows: Array<{ x: number; y: number; strength: number; reach: number }> = [];
      if (pointerStrength > 0.01)
        glows.push({
          x: pointer.x,
          y: pointer.y,
          strength: pointerStrength,
          reach: reachOf(pointerStrength),
        });
      if (sprite.strength > 0.01)
        glows.push({
          x: sprite.x,
          y: sprite.y,
          strength: sprite.strength,
          reach: reachOf(sprite.strength),
        });

      const lived = ripples.filter((ripple) => now - ripple.born < 720);
      ripples = lived;

      for (let r = 0; r < rows; r++) {
        const row = firstRow + r;
        const top = anchorY + row * cell;
        const y = Math.round(top);
        const h = Math.round(top + cell) - y;
        const cy = top + cell / 2;
        const fromFloor = bottomRow - row;

        for (let c = 0; c < columns; c++) {
          const col = firstCol + c;
          const left = anchorX + col * cell;
          const x = Math.round(left);
          const w = Math.round(left + cell) - x;
          const cx = left + cell / 2;

          let glowAmount = 0;
          for (const glow of glows) {
            const dx = cx - glow.x;
            const dy = cy - glow.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < glow.reach) {
              const falloff = 1 - distance / glow.reach;
              const amount = falloff * falloff * glow.strength;
              if (amount > glowAmount) glowAmount = amount;
            }
          }

          const shade = ramp[r * columns + c];
          let lum = 0;
          if (shade > 0.002) {
            const u = col / CELLS_PER_NOISE;
            const v = row / CELLS_PER_NOISE;
            const base =
              0.6 * sampleNoise(noise, u + seconds * 0.14, v - seconds * 0.055) +
              0.4 * sampleNoise(noise, u * 0.55 - seconds * 0.08, v * 0.55 + seconds * 0.06);
            const twinkle =
              0.5 + 0.5 * Math.sin(seconds * 1.1 + jitter[(row & 63) * 64 + (col & 63)] * 6.283);
            lum = shade * (0.3 + 0.52 * base * base + 0.18 * twinkle) * 0.62;
          }

          lum += glowAmount * 0.6;

          let waveAmount = 0;
          for (const ripple of lived) {
            const age = (now - ripple.born) / 720;
            const radius = age * cell * 14;
            const dx = cx - ripple.x;
            const dy = cy - ripple.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const ring = Math.max(0, 1 - Math.abs(distance - radius) / (cell * 2.5));
            const amount = ring * (1 - age) ** 1.6;
            if (amount > waveAmount) waveAmount = amount;
          }
          if (waveAmount > 0) lum += waveAmount * 1.15;

          let specAmount = 0;
          if (listening && shade > 0.002 && fromFloor >= 0) {
            const across = (c + 0.5) / columns;
            const side = Math.abs(across - 0.5) * 2;
            const bandPos = (1 - side) * bandsNow.length - 0.5;
            const b0 = Math.max(0, Math.min(bandsNow.length - 1, Math.floor(bandPos)));
            const b1 = Math.min(bandsNow.length - 1, b0 + 1);
            const mixB = Math.max(0, Math.min(1, bandPos - b0));
            const raw = bandsNow[b0] * (1 - mixB) + bandsNow[b1] * mixB;
            const level = Math.max(0, (raw - SPECTRUM_FLOOR) / (1 - SPECTRUM_FLOOR));
            const tall = level * rows * SPECTRUM_REACH;
            if (level > 0 && fromFloor < tall) {
              specAmount = level * (1 - fromFloor / tall) ** 0.85;
              lum += specAmount * SPECTRUM_DENSITY * Math.min(1, shade * 3);
            }
          }

          // Pure Bayer would light the same low-index cells everywhere; a fixed
          // per-cell offset scatters the resting field while the ordered
          // structure still shows up where luminance is pushed high.
          const threshold =
            0.78 * ((BAYER[(row & 7) * 8 + (col & 7)] + 0.5) / 64) +
            0.22 * jitter[(row & 63) * 64 + (col & 63)];
          if (lum <= threshold) continue;

          const heat = Math.max(glowAmount, waveAmount, specAmount * SPECTRUM_HEAT);
          context.fillStyle = heat > 0.34 ? ink.lit : heat > 0.1 ? ink.mid : ink.dim;
          context.fillRect(x, y, w, h);
        }
      }
    };

    const animate = (now: number) => {
      frame = 0;
      if (!inView || document.hidden || reducedMotion.matches) return;
      if (now - lastPaint >= 25) {
        lastPaint = now;
        draw(now);
      }
      frame = requestAnimationFrame(animate);
    };

    const schedule = () => {
      if (!frame && inView && !document.hidden && !reducedMotion.matches) {
        frame = requestAnimationFrame(animate);
      }
    };
    const paintStill = () => draw(0);

    const locate = (event: PointerEvent) => {
      const bounds = host.getBoundingClientRect();
      return {
        inside:
          event.clientX >= bounds.left &&
          event.clientX <= bounds.right &&
          event.clientY >= bounds.top &&
          event.clientY <= bounds.bottom,
        x: (event.clientX - bounds.left) * (width / Math.max(1, bounds.width)),
        y: (event.clientY - bounds.top) * (height / Math.max(1, bounds.height)),
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const { inside, x, y } = locate(event);
      const bounds = host.getBoundingClientRect();
      targetStrength = inside
        ? strengthAt(event.clientX - bounds.left, event.clientY - bounds.top)
        : 0;
      if (inside) {
        pointer.x = x;
        pointer.y = y;
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (reducedMotion.matches) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('a, button, input, select, textarea, label, [role="button"]')
      )
        return;
      const { inside, x, y } = locate(event);
      if (!inside) return;
      ripples = [...ripples.slice(-2), { x, y, born: performance.now() }];
    };

    const onPointerLeave = () => {
      targetStrength = 0;
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
      if (reducedMotion.matches) paintStill();
      else {
        draw(performance.now());
        schedule();
      }
    });
    const theme = new MutationObserver(() => {
      ink = readInk();
      if (reducedMotion.matches) paintStill();
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
      if (reducedMotion.matches) paintStill();
      else schedule();
    };

    resize.observe(host);
    if (anchor) resize.observe(anchor);
    visibility.observe(host);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
    if (finePointer.matches)
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    document.addEventListener("visibilitychange", onPageVisibility);
    reducedMotion.addEventListener("change", onMotionChange);
    measure();
    if (reducedMotion.matches) paintStill();
    else schedule();

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      visibility.disconnect();
      theme.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onPageVisibility);
      reducedMotion.removeEventListener("change", onMotionChange);
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
