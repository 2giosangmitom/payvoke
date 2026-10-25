"use client";

import { useRef, type ComponentPropsWithoutRef, type FC, type ReactNode } from "react";
import { motion, MotionValue, useReducedMotion, useScroll, useTransform } from "motion/react";
import { cn } from "@/src/lib/utils";

// Magic UI's TextReveal: words light up one by one as the section scrolls past.
// Themed with tokens; reduced motion shows the finished sentence.
export interface TextRevealProps extends ComponentPropsWithoutRef<"div"> {
  children: string;
  /** Rendered beside the sticky sentence, e.g. a caption or eyebrow. */
  aside?: ReactNode;
}

export const TextReveal: FC<TextRevealProps> = ({ children, className, aside }) => {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const words = children.split(" ");

  return (
    <div ref={sectionRef} className={cn("relative z-0 h-[220vh]", className)}>
      <div className="sticky top-0 flex h-svh items-center">
        <div className="container-page">
          {aside}
          <p className="flex max-w-5xl flex-wrap text-[clamp(1.9rem,4.6vw,4rem)] leading-[1.12] font-medium tracking-[-0.045em] text-foreground/15">
            {words.map((word, i) => {
              const start = i / words.length;
              return (
                <Word
                  key={i}
                  progress={scrollYProgress}
                  range={[start, start + 1 / words.length]}
                  still={Boolean(reduceMotion)}
                >
                  {word}
                </Word>
              );
            })}
          </p>
        </div>
      </div>
    </div>
  );
};

interface WordProps {
  children: ReactNode;
  progress: MotionValue<number>;
  range: [number, number];
  still: boolean;
}

const Word: FC<WordProps> = ({ children, progress, range, still }) => {
  const opacity = useTransform(progress, range, [0, 1]);
  return (
    <span className="relative mr-[0.28em]">
      <span aria-hidden="true">{children}</span>
      <motion.span
        style={{ opacity: still ? 1 : opacity }}
        className="absolute inset-0 text-foreground"
      >
        {children}
      </motion.span>
    </span>
  );
};
