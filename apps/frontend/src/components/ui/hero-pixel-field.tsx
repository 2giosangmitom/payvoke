"use client";

import { useEffect, useRef } from "react";

// The field uses the same ordered-dither approach as Omarchy's live hero canvas.
// Colors and grid placement are adapted to Payvoke's Osaka Jade theme and wordmark.
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28,
  52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 21,
  53, 29, 61, 19, 51, 27, 59, 23, 55, 31, 63,
];

const NOISE_SIZE = 128;

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

export function HeroPixelField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = canvas?.closest<HTMLElement>(".hero");
    const context = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !hero || !context) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const noise = makeNoise();
    const random = seededRandom(0x1e372c);
    const jitter = Float32Array.from({ length: 64 * 64 }, random);
    // The hero keeps its dark jade palette even when the rest of the site is in light mode.
    const palette = getComputedStyle(hero);
    const token = (name: string, fallback: string) =>
      palette.getPropertyValue(name).trim() || fallback;
    const ink = {
      background: token("--t-field-bg", "#090f0d"),
      dim: token("--t-field-dim", "#1e372c"),
      mid: token("--t-field-mid", "#35614d"),
      lit: token("--t-field-lit", "#509475"),
      hover: token("--t-field-hover", "#84b49e"),
      crest: token("--t-field-crest", "#bcd6cb"),
    };

    let width = 0;
    let height = 0;
    let dpr = 1;
    let cell = 10;
    let anchorX = 0;
    let anchorY = 0;
    let firstCol = 0;
    let firstRow = 0;
    let columns = 0;
    let rows = 0;
    let ramp = new Float32Array(0);
    let frame = 0;
    let lastPaint = -Infinity;
    let inView = true;
    const measure = () => {
      const bounds = hero.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.round(bounds.width * dpr);
      height = Math.round(bounds.height * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      // Keep the field's lattice attached to the centered PAYVOKE wordmark.
      const wordmark = hero.querySelector<HTMLElement>(".particle-wordmark");
      const slot = wordmark?.getBoundingClientRect();
      cell = Math.max(7, Math.min(13, (slot?.width ?? bounds.width * 0.72) / 81)) * dpr;
      anchorX = slot ? (slot.left - bounds.left) * dpr : width / 2;
      anchorY = slot ? (slot.top - bounds.top) * dpr : height / 2;
      firstCol = Math.floor(-anchorX / cell) - 1;
      firstRow = Math.floor(-anchorY / cell) - 1;
      columns = Math.ceil(width / cell) - firstCol + 2;
      rows = Math.ceil(height / cell) - firstRow + 2;
      ramp = new Float32Array(columns * rows);

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

    const draw = (now: number) => {
      if (!width || !height) return;
      const time = motionQuery.matches ? 0 : now / 1000;
      context.fillStyle = ink.background;
      context.fillRect(0, 0, width, height);

      // A slow wandering light keeps the field alive without pointer input.
      const spriteX = width * (0.5 + 0.43 * Math.sin(time * 0.62));
      const spriteY = height * (0.49 + 0.36 * Math.sin(time * 0.39 + 1.4));
      const reach = 12 * cell;

      for (let r = 0; r < rows; r++) {
        const row = firstRow + r;
        const top = anchorY + row * cell;
        const y = Math.round(top);
        const h = Math.round(top + cell) - y;
        const cy = top + cell / 2;
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

          const spriteDistance = Math.hypot(cx - spriteX, cy - spriteY);
          const spriteGlow =
            motionQuery.matches || spriteDistance > reach
              ? 0
              : Math.pow(1 - spriteDistance / reach, 2) * 0.65;
          const heat = spriteGlow;
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
                : heat > 0.17
                  ? ink.lit
                  : heat > 0.07
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
      if (now - lastPaint >= 32) {
        lastPaint = now;
        draw(now);
      }
      frame = requestAnimationFrame(animate);
    };

    const schedule = () => {
      if (!frame && inView && !document.hidden && !motionQuery.matches) {
        frame = requestAnimationFrame(animate);
      }
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
      draw(motionQuery.matches ? 0 : performance.now());
      schedule();
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
      if (motionQuery.matches) draw(0);
      else schedule();
    };

    resize.observe(hero);
    const wordmark = hero.querySelector(".particle-wordmark");
    if (wordmark) resize.observe(wordmark);
    visibility.observe(hero);
    document.addEventListener("visibilitychange", onPageVisibility);
    motionQuery.addEventListener("change", onMotionChange);
    measure();
    draw(0);
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", onPageVisibility);
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="hero-pixel-canvas" aria-hidden="true" />;
}
