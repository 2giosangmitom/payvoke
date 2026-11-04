import { useEffect, useId, useState } from "react";
import { Activity, Blocks, House, MessagesSquare, type LucideIcon } from "lucide-react";
import { cn } from "@/src/lib/utils";

// Screenshots of the console (public/images/console), taken from the real
// screens with sample data, one per theme. A tab per page sits above the
// window; the pages play on a timer, a click picks one and hovering holds it.

const pages: Array<{ id: string; label: string; icon: LucideIcon; alt: string }> = [
  {
    id: "home",
    label: "Home",
    icon: House,
    alt: "Console home: jobs that need you, your money and spending",
  },
  {
    id: "chat",
    label: "Chat",
    icon: MessagesSquare,
    alt: "A chat with CSV Analyst: a delivered paid job and its dashboard",
  },
  {
    id: "activity",
    label: "Activity",
    icon: Activity,
    alt: "Activity: every paid job with its hold state and deadline",
  },
  {
    id: "studio",
    label: "Studio",
    icon: Blocks,
    alt: "Studio: what a builder's shared agents earned in 30 days",
  },
];

const INTERVAL = 5000;

export function AppPreview() {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const base = useId();

  useEffect(() => {
    if (held || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => setIndex((index + 1) % pages.length), INTERVAL);
    return () => window.clearTimeout(timer);
  }, [index, held]);

  return (
    <div
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      className="border border-border-strong/60 bg-background-deep p-2 shadow-float"
    >
      <div
        role="tablist"
        aria-label="Console pages"
        className="grid grid-cols-2 gap-1 sm:grid-cols-4"
      >
        {pages.map((page, i) => {
          const active = i === index;
          return (
            <button
              key={page.id}
              id={`${base}-${page.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${base}-panel`}
              onClick={() => setIndex(i)}
              className={cn(
                "relative flex items-center gap-3 overflow-hidden border px-3 py-2.5 text-left text-[15px] transition-colors",
                active
                  ? "border-border-strong/70 bg-card font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center border transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background",
                )}
              >
                <page.icon size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              {page.label}
              {/* The timer: a jade line that fills along the active tab's bottom edge. */}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/20"
                >
                  <span
                    key={`${index}-${held}`}
                    className={cn(
                      "block h-full origin-left bg-primary",
                      !held && "motion-safe:animate-[preview-progress_5s_linear_both]",
                    )}
                  />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        id={`${base}-panel`}
        role="tabpanel"
        aria-labelledby={`${base}-${pages[index].id}`}
        className="relative mt-2 aspect-[16/10] overflow-hidden border border-border bg-background"
      >
        {pages.map((page, i) =>
          (["light", "dark"] as const).map((mode) => (
            <img
              key={`${page.id}-${mode}`}
              src={`/images/console/${page.id}-${mode}.webp`}
              alt={i === index ? page.alt : ""}
              aria-hidden={i === index ? undefined : true}
              width={2880}
              height={1800}
              decoding="async"
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : undefined}
              className={cn(
                "absolute inset-0 size-full object-cover object-top transition-opacity duration-700 ease-out",
                mode === "light" ? "dark:hidden" : "hidden dark:block",
                i === index ? "opacity-100" : "opacity-0",
              )}
            />
          )),
        )}
      </div>
    </div>
  );
}
