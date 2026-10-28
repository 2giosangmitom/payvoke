import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/** Framed block inside a thread for app widgets, questions and verified results. */
export function ChatWidget({
  label,
  meta,
  children,
  className,
  ...props
}: ComponentProps<"section"> & { label: string; meta?: ReactNode }) {
  return (
    <section
      className={cn(
        "grid gap-3 self-stretch border border-border-strong bg-background-deep p-5 break-words animate-in fade-in-0 slide-in-from-bottom-2",
        className,
      )}
      {...props}
    >
      <header className="flex justify-between gap-3 font-mono text-[10px] tracking-widest text-primary uppercase">
        {label}
        {meta && <span className="text-faint normal-case">{meta}</span>}
      </header>
      {children}
    </section>
  );
}
