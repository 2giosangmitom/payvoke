import type { ReactNode } from "react";
import { Zap } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { formatUsdc } from "@/src/features/apps/format";
import type { CommandRevision } from "@/src/features/chat/api";

/** One slash command with its terms and arguments; used in the store and in Studio. */
export function CommandCard({
  name,
  description,
  isDefault,
  revision,
  terms,
  actions,
  children,
}: {
  name: string;
  description: string;
  isDefault: boolean;
  revision: CommandRevision | null;
  terms?: ReactNode[] | null;
  actions?: ReactNode;
  // Below the arguments, inside the card (the store's x402 block).
  children?: ReactNode;
}) {
  return (
    <article className="border border-border bg-card p-5 transition-colors hover:border-border-strong sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <code className="font-mono text-lg text-primary break-all">/{name}</code>
            {isDefault && <Badge>Default</Badge>}
            {revision?.instantGrossAmount && (
              <Badge variant="outline" className="border-primary/50 text-primary normal-case">
                <Zap aria-hidden /> x402 · Instant {formatUsdc(revision.instantGrossAmount)}
              </Badge>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {revision ? (
        <>
          {terms && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {terms.map((term, index) => (
                <Badge key={index} variant="secondary" className="normal-case">
                  {term}
                </Badge>
              ))}
            </div>
          )}
          {revision.options.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              {revision.options.map((option) => (
                <code
                  key={option.name}
                  className="inline-flex items-baseline gap-2 border border-border px-2.5 py-1.5 font-mono text-xs"
                >
                  {option.name}
                  <small className="text-[10px] text-faint">
                    {option.type.toLowerCase()}
                    {option.required ? " · required" : ""}
                  </small>
                </code>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="mt-4 font-mono text-xs text-faint">No active revision.</p>
      )}
      {children}
    </article>
  );
}
