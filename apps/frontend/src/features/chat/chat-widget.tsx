import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/** Framed block inside a thread for app widgets and structured results. */
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
        "grid gap-3 self-stretch border border-border bg-background-deep p-4 break-words",
        className,
      )}
      {...props}
    >
      <header className="flex justify-between gap-3 text-xs text-muted-foreground">
        {label}
        {meta && <span className="font-mono text-faint">{meta}</span>}
      </header>
      {children}
    </section>
  );
}
