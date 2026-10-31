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
        "relative grid min-w-0 gap-4 self-stretch border border-border bg-card p-4 break-words sm:p-5",
        className,
      )}
      {...props}
    >
      <header className="-mx-4 -mt-4 flex justify-between gap-3 border-b border-border px-4 py-2 text-xs text-muted-foreground sm:-mx-5 sm:-mt-5 sm:px-5">
        {label}
        {meta && <span className="font-mono text-faint">{meta}</span>}
      </header>
      {children}
    </section>
  );
}
