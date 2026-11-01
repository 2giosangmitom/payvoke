import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CircleAlert, Clock } from "lucide-react";
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
import { Skeleton } from "@/src/components/ui/skeleton";
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

// Loading placeholders keep the shape of what is coming, so nothing jumps
// when it arrives. The label is for screen readers only.
function Loading({
  label,
  className,
  children,
}: {
  label: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/**
 * Rows of a list or table: a mark, a title and a line under it. `inset` is
 * for a list inside a bordered card: no outer rules, rows padded like the
 * card's own rows.
 */
export function LoadingState({
  children,
  rows = 4,
  inset = false,
  mark = true,
  className,
}: {
  children: ReactNode;
  rows?: number;
  inset?: boolean;
  mark?: boolean;
  className?: string;
}) {
  return (
    <Loading
      label={children}
      className={cn("grid", !inset && "border-y border-border py-1", className)}
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className={cn(
            "flex items-center gap-3 border-b border-border py-3 last:border-b-0",
            inset && "px-4 sm:px-5",
          )}
        >
          {mark && <Skeleton className="size-8 shrink-0" />}
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-3.5" style={{ width: `${56 - index * 7}%` }} />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-3.5 w-16 max-sm:hidden" />
        </div>
      ))}
    </Loading>
  );
}

/** Settings rows (label on the left, a panel on the right), as SettingsRow lays them out. */
export function SettingsSkeleton({
  rows = 3,
  label = "Loading settings",
  className,
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  return (
    <Loading label={label} className={cn("grid", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="grid gap-4 border-b border-border py-8 last:border-b-0 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-12"
        >
          <div className="grid content-start gap-2.5 lg:pt-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
          <div className="grid gap-3 border border-border bg-card p-4 sm:p-5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full" />
            {index === 0 && <Skeleton className="h-20 w-full" />}
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
      ))}
    </Loading>
  );
}

/** A grid of store cards. */
export function CardGridSkeleton({
  count = 6,
  label = "Loading agents",
  className,
}: {
  count?: number;
  label?: string;
  className?: string;
}) {
  return (
    <Loading label={label} className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex min-h-64 flex-col border border-border bg-card">
          <div className="flex items-center gap-3 px-5 pt-5">
            <Skeleton className="size-10" />
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="grid flex-1 content-start gap-2.5 px-5 pt-5">
            <Skeleton className="h-6 w-3/5" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
          <div className="flex justify-between border-t border-border px-5 py-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </Loading>
  );
}

/** A row of figures, as on the console home and the profile. */
export function FiguresSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <Loading
      label="Loading figures"
      className={cn(
        "grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4",
        className,
      )}
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="grid gap-2.5 bg-card px-4 py-4">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-7 w-24" />
        </div>
      ))}
    </Loading>
  );
}

/** A detail page: its header, then a few blocks. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <Loading label={label} className="grid gap-10 pt-10">
      <div className="flex items-center gap-5">
        <Skeleton className="size-16 shrink-0" />
        <div className="grid flex-1 gap-3">
          <Skeleton className="h-9 w-2/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </div>
      <FiguresSkeleton />
      <div className="grid gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </Loading>
  );
}

/**
 * The one line that explains why money figures can trail the chain: the
 * payment workers confirm deposits, holds and releases a little after the
 * transaction lands.
 */
export function SettlementNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Clock aria-hidden="true" className="size-3.5 shrink-0" />
      Payments can take a minute or two to show up here while they&apos;re confirmed.
    </p>
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
