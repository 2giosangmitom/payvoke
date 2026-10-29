import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void navigator.clipboard.writeText(value).then(() => setCopied(true))}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : label}
    </Button>
  );
}

// One settings row: what the section is for on the left, its controls on the
// right. On a phone the label stacks above the panel.
export function SettingsRow({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 border-b border-border py-8 last:border-b-0 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-12"
    >
      <div className="grid content-start gap-1.5 lg:pt-1">
        <h2 id={id} className="text-base font-medium">
          {title}
        </h2>
        <div className="text-sm leading-6 text-muted-foreground">{description}</div>
      </div>
      <div className="min-w-0 border border-border bg-card p-4 sm:p-5">{children}</div>
    </section>
  );
}

// Code or a secret under a bar with its title and a copy button.
export function CodeBlock({
  code,
  title,
  label = "Copy",
  className,
}: {
  code: string;
  title?: ReactNode;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn("min-w-0 border border-border bg-background-deep", className)}>
      <div className="flex min-h-9 items-center justify-between gap-3 border-b border-border pl-3">
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{title}</span>
        <Button
          variant="ghost"
          size="xs"
          aria-label={copied ? "Copied" : label}
          onClick={() => void navigator.clipboard.writeText(code).then(() => setCopied(true))}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
