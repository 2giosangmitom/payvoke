import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { BlurFade } from "@/src/components/ui/blur-fade";
import { Button } from "@/src/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/src/components/ui/empty";
import { Spinner } from "@/src/components/ui/spinner";
import { cn } from "@/src/lib/utils";

// Small building blocks shared by store, chat and Studio pages, so every page
// gets the same header rhythm, status badge and loading/empty/error states.

export function errorMessage(cause: unknown, fallback = "Request failed.") {
  return cause instanceof Error ? cause.message : fallback;
}

export function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-sm font-medium text-primary", className)}>{children}</p>;
}

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("container-page pb-24", className)}>{children}</main>;
}

/**
 * A page's title block. `compact` is the console's work-screen header: a
 * plain noun title at 28px, with the section named by the breadcrumb instead
 * of an eyebrow.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  compact = false,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const header = (
    <header
      className={cn(
        "grid items-end gap-6 border-b border-border lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-12",
        compact ? "pt-6 pb-5" : "pt-16 pb-10 lg:pt-20",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && !compact && <Eyebrow className="mb-4">{eyebrow}</Eyebrow>}
        <h1
          className={cn(
            "text-balance break-words",
            compact
              ? "text-2xl leading-tight font-semibold tracking-[-0.025em]"
              : "text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] font-medium tracking-[-0.055em]",
          )}
        >
          {title}
        </h1>
        {description && (
          <p
            className={cn(
              "max-w-2xl text-muted-foreground",
              compact ? "mt-2 text-[15px] leading-6" : "mt-5 text-base leading-7",
            )}
          >
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-3 lg:justify-end">{actions}</div>}
    </header>
  );
  // Work screens do not perform an entrance; marketing headers fade in.
  return compact ? header : <BlurFade>{header}</BlurFade>;
}

export function SectionHeader({
  eyebrow,
  title,
  aside,
  id,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  aside?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
        <h2 id={id} className="text-xl font-semibold tracking-[-0.02em]">
          {title}
        </h2>
      </div>
      {aside && <div className="text-sm text-faint">{aside}</div>}
    </div>
  );
}

export function BackLink({
  to,
  children,
}: {
  to: "/store" | "/console" | "/console/studio" | "/console/activity";
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="mt-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
    >
      <ArrowLeft size={14} /> {children}
    </Link>
  );
}

const availabilityLabels: Record<string, string> = {
  AVAILABLE: "Online",
  UNAVAILABLE: "Offline",
  SUSPENDED: "Suspended",
};

export function AppStatus({
  availability,
  className,
}: {
  availability: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-border-strong/60 text-muted-foreground",
        availability === "AVAILABLE" && "border-primary/50 text-primary",
        availability === "SUSPENDED" && "border-destructive/50 text-destructive",
        className,
      )}
    >
      <StatusDot availability={availability} />
      {availabilityLabels[availability] ?? availability.toLowerCase()}
    </Badge>
  );
}

export function StatusDot({ availability }: { availability: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1.5 shrink-0 bg-faint",
        availability === "AVAILABLE" && "bg-primary",
        availability === "SUSPENDED" && "bg-destructive",
      )}
    />
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("text-muted-foreground", className)}>
      {children}
    </Badge>
  );
}

export function LoadingState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("flex items-center gap-3 py-10 text-sm text-muted-foreground", className)}
      aria-live="polite"
    >
      <Spinner className="text-primary" /> {children}
    </div>
  );
}

export function ErrorNotice({
  children,
  onRetry,
  className,
}: {
  children: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Alert variant="destructive" className={cn("my-4", className)}>
      <CircleAlert />
      <AlertDescription className="break-words">{children}</AlertDescription>
      {onRetry && (
        <AlertAction>
          <Button size="xs" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}

export function EmptyState({
  eyebrow,
  title,
  children,
  action,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("border border-dashed border-border-strong/60 bg-card py-16", className)}>
      <EmptyHeader>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <EmptyTitle className="text-2xl tracking-[-0.03em]">{title}</EmptyTitle>
        {children && <EmptyDescription>{children}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/** Label + control stacked, with the label style used across forms. */
export function FormField({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-2", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-faint">{hint}</p>}
    </div>
  );
}
