"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  originX: number;
  originY: number;
  radius: number;
  color: string;
};

export interface ParticleTextEffectProps {
  text?: string;
  colors?: string[];
  className?: string;
  animationForce?: number;
  particleDensity?: number;
}

const jadeRamp = ["509475", "84b49e", "bcd6cb", "f7e8b2", "35614d"];

/** A container-sized canvas: safe during server render and quiet when reduced motion is requested. */
export function ParticleTextEffect({
  text = "PAYVOKE",
  colors = jadeRamp,
  className = "",
  animationForce = 80,
  particleDensity = 4,
}: ParticleTextEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !container) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = { x: 0, y: 0, active: false };
    let particles: Particle[] = [];
    let frame: number | null = null;
    let width = 0;
    let height = 0;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      for (const particle of particles) {
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function tick() {
      frame = null;
      let moving = false;
      const radius = Math.min(130, Math.max(65, height * 0.42));

      for (const particle of particles) {
        if (pointer.active) {
          const dx = particle.x - pointer.x;
          const dy = particle.y - pointer.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 0 && distance < radius) {
            const push = Math.min(animationForce / 12, ((radius - distance) / radius) * 7);
            particle.x += (dx / distance) * push;
            particle.y += (dy / distance) * push;
            moving = true;
          }
        }

        const dx = particle.originX - particle.x;
        const dy = particle.originY - particle.y;
        if (Math.hypot(dx, dy) > 0.35) {
          particle.x += dx * 0.12;
          particle.y += dy * 0.12;
          moving = true;
        } else {
          particle.x = particle.originX;
          particle.y = particle.originY;
        }
      }

      draw();
      if (moving && !reducedMotion.matches) frame = requestAnimationFrame(tick);
    }

    function requestDraw() {
      if (frame === null && !reducedMotion.matches) frame = requestAnimationFrame(tick);
    }

    function rebuild() {
      if (!canvas || !container || !ctx) return;
      const rect = container.getBoundingClientRect();
      width = Math.floor(rect.width);
      height = Math.floor(rect.height);
      if (!width || !height) return;

      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const sample = document.createElement("canvas");
      sample.width = width;
      sample.height = height;
      const sampler = sample.getContext("2d", { willReadFrequently: true });
      if (!sampler) return;

      let fontSize = Math.min(height * 0.76, 225);
      sampler.font = `800 ${fontSize}px "Geist Variable", sans-serif`;
      fontSize *= Math.min(1, (width * 0.9) / Math.max(1, sampler.measureText(text).width));
      sampler.font = `800 ${fontSize}px "Geist Variable", sans-serif`;
      sampler.textAlign = "center";
      sampler.textBaseline = "middle";

      const gradient = sampler.createLinearGradient(0, 0, width, height);
      colors.forEach((value, index) => {
        gradient.addColorStop(
          index / Math.max(1, colors.length - 1),
          `#${value.replace(/^#/, "")}`,
        );
      });
      sampler.fillStyle = gradient;
      sampler.fillText(text, width / 2, height / 2);

      const data = sampler.getImageData(0, 0, width, height).data;
      const stride = Math.max(3, Math.round(particleDensity));
      const next: Particle[] = [];
      for (let y = 0; y < height; y += stride) {
        for (let x = 0; x < width; x += stride) {
          const i = (y * width + x) * 4;
          if (data[i + 3] < 128) continue;
          next.push({
            x,
            y,
            originX: x,
            originY: y,
            radius: Math.max(0.8, stride * 0.32),
            color: `rgb(${data[i]}, ${data[i + 1]}, ${data[i + 2]})`,
          });
        }
      }
      particles = next;
      draw();
    }

    function move(event: PointerEvent) {
      if (!canvas || reducedMotion.matches) return;
      const bounds = canvas.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
      pointer.active = true;
      requestDraw();
    }

    function leave() {
      pointer.active = false;
      requestDraw();
    }

    function motionChanged() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      pointer.active = false;
      for (const particle of particles) {
        particle.x = particle.originX;
        particle.y = particle.originY;
      }
      draw();
    }

    const observer = new ResizeObserver(rebuild);
    observer.observe(container);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    reducedMotion.addEventListener("change", motionChanged);
    document.fonts.ready.then(() => {
      if (canvas.isConnected) rebuild();
    });
    rebuild();

    return () => {
      observer.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      reducedMotion.removeEventListener("change", motionChanged);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [animationForce, colors, particleDensity, text]);

  return <canvas aria-hidden="true" ref={canvasRef} className={className} />;
}
