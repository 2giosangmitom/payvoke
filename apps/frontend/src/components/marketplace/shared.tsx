import { InfoIcon, PenToolIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { Select } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

const statuses: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Submitted", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  paused: { label: "Paused", tone: "neutral" },
  published: { label: "Published", tone: "success" },
  catalog: { label: "Catalog only", tone: "warning" },
};
export function StatusBadge({ status }: { status: string }) {
  const value = statuses[status] ?? { label: status, tone: "neutral" };
  return <span className={`market-badge market-badge--${value.tone}`}>{value.label}</span>;
}
export function AgentMark() {
  return (
    <span className="market-agent-mark" aria-hidden="true">
      <PenToolIcon />
    </span>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="market-notice">
      <InfoIcon aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="market-loading market-card" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="market-skeleton" />
      <div className="market-skeleton" />
      <div className="market-skeleton" />
    </div>
  );
}
export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="market-state market-card" role="alert">
      <h2>Couldn’t load this view.</h2>
      <p className="text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}
export function SignInState({
  title,
  description,
  error,
}: {
  title: string;
  description: string;
  error?: string;
}) {
  return (
    <section className="market-sign-in market-card">
      <h1>{title}</h1>
      <p className="text-muted-foreground">{description}</p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <p className="market-caption">Use the sign-in control in the navigation to continue.</p>
    </section>
  );
}
export function Pagination({
  offset,
  hasMore,
  onChange,
  label,
}: {
  offset: number;
  hasMore: boolean;
  onChange: (offset: number) => void;
  label: string;
}) {
  if (!offset && !hasMore) return null;
  return (
    <nav className="market-pagination" aria-label={label}>
      <Button
        variant="outline"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - 50))}
      >
        Previous
      </Button>
      <span className="market-caption">Page {Math.floor(offset / 50) + 1}</span>
      <Button
        variant="outline"
        disabled={!hasMore || offset >= 10000}
        onClick={() => onChange(offset + 50)}
      >
        Next
      </Button>
    </nav>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select.Root
      disabled={disabled}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
      items={options}
    >
      <Select.Trigger className="market-choice" aria-label={label}>
        <Select.Value />
        <Select.Icon>
          <ChevronDownIcon size={16} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-50">
          <Select.Popup className="market-choice-popup">
            <Select.List>
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value} className="market-choice-item">
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <CheckIcon size={14} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
