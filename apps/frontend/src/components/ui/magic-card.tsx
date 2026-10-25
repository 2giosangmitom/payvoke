"use client";

import { useCallback, type PointerEvent, type ReactNode } from "react";
import { motion, useMotionTemplate, useMotionValue } from "motion/react";
import { cn } from "@/src/lib/utils";

// Magic UI's MagicCard, trimmed to the spotlight mode and themed with tokens:
// the border lights up under the pointer and a soft glow follows it inside.
interface MagicCardProps {
  children?: ReactNode;
  className?: string;
  gradientSize?: number;
  gradientColor?: string;
  gradientFrom?: string;
  gradientTo?: string;
}

export function MagicCard({
  children,
  className,
  gradientSize = 260,
  gradientColor = "color-mix(in oklab, var(--color-primary) 12%, transparent)",
  gradientFrom = "var(--color-primary)",
  gradientTo = "var(--color-field-lit)",
}: MagicCardProps) {
  const mouseX = useMotionValue(-gradientSize);
  const mouseY = useMotionValue(-gradientSize);

  const reset = useCallback(() => {
    mouseX.set(-gradientSize);
    mouseY.set(-gradientSize);
  }, [gradientSize, mouseX, mouseY]);

  const move = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      mouseX.set(event.clientX - rect.left);
      mouseY.set(event.clientY - rect.top);
    },
    [mouseX, mouseY],
  );

  return (
    <motion.div
      className={cn("group relative isolate overflow-hidden border border-transparent", className)}
      onPointerMove={move}
      onPointerLeave={reset}
      style={{
        background: useMotionTemplate`
          linear-gradient(var(--color-card) 0 0) padding-box,
          radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px,
            ${gradientFrom}, ${gradientTo}, var(--color-border) 100%
          ) border-box
        `,
      }}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-px z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px, ${gradientColor}, transparent 100%)
          `,
        }}
      />
      <div className="relative z-10 flex h-full flex-col">{children}</div>
    </motion.div>
  );
}
