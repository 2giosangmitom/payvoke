"use client";

import type { ReactNode } from "react";
import { motion, type Variants } from "motion/react";
import { cn } from "@/src/lib/utils";

// Scroll-in reveals built on motion's IntersectionObserver (`whileInView`).
// Reduced motion is honoured by the app-wide MotionConfig: elements still fade,
// but do not move.

export const easeOut = [0.22, 1, 0.36, 1] as const;

const elements = {
  div: motion.div,
  section: motion.section,
  li: motion.li,
  ul: motion.ul,
  ol: motion.ol,
  p: motion.p,
  span: motion.span,
} as const;

type RevealElement = keyof typeof elements;

type RevealProps = {
  children?: ReactNode;
  className?: string;
  as?: RevealElement;
  /** Seconds before the element starts once it is in view. */
  delay?: number;
  /** Travel in px; negative comes from above. */
  y?: number;
  x?: number;
  blur?: boolean;
  /** Share of the element that must be visible before it plays. */
  amount?: number;
};

const item = (y: number, x: number, blur: boolean, delay = 0): Variants => ({
  hidden: { opacity: 0, y, x, filter: blur ? "blur(8px)" : "blur(0px)" },
  shown: {
    opacity: 1,
    y: 0,
    x: 0,
    filter: "blur(0px)",
    transition: { duration: 0.75, ease: easeOut, delay },
  },
});

/** A single element that fades and rises into place the first time it is seen. */
export function Reveal({
  children,
  className,
  as = "div",
  delay = 0,
  y = 28,
  x = 0,
  blur = true,
  amount = 0.3,
}: RevealProps) {
  const Element = elements[as];
  return (
    <Element
      className={className}
      variants={item(y, x, blur, delay)}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount }}
    >
      {children}
    </Element>
  );
}

/** A parent that reveals its `RevealItem` children one after another. */
export function RevealGroup({
  children,
  className,
  as = "div",
  stagger = 0.09,
  delay = 0,
  amount = 0.25,
}: {
  children?: ReactNode;
  className?: string;
  as?: RevealElement;
  stagger?: number;
  delay?: number;
  amount?: number;
}) {
  const Element = elements[as];
  return (
    <Element
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount }}
      variants={{
        hidden: {},
        shown: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
    >
      {children}
    </Element>
  );
}

export function RevealItem({
  children,
  className,
  as = "div",
  y = 24,
  x = 0,
  blur = true,
}: Omit<RevealProps, "delay" | "amount">) {
  const Element = elements[as];
  return (
    <Element className={cn(className)} variants={item(y, x, blur)}>
      {children}
    </Element>
  );
}
