"use client";

import {
  StreamdownTextPrimitive,
  type LinkSafetyModalProps,
  type SecurityConfig,
} from "@assistant-ui/react-streamdown";
import { createCodePlugin } from "@streamdown/code";
import { ExternalLink } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";

const code = createCodePlugin({ themes: ["vitesse-light", "vitesse-dark"] });

// App output comes from a third party. Raw HTML is dropped; links may only
// be http(s) or mailto (rehype-harden's wildcard) and open behind
// streamdown's confirmation dialog; no image loads at all, since a remote
// image would let a provider track the buyer. An empty image allowlist blocks
// everything, while a specific prefix would also require a defaultOrigin.
const security: SecurityConfig = {
  allowedLinkPrefixes: ["*"],
  allowedImagePrefixes: [],
  allowDataImages: false,
  blockedLinkClass: "text-muted-foreground line-through",
  blockedImageClass: "hidden",
};

// Every output link is confirmed first. The project dialog keeps focus
// trapping, Escape and the theme that streamdown's default modal lacks.
function LinkConfirm({ isOpen, onClose, onConfirm, url }: LinkSafetyModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a link from this app?</DialogTitle>
          <DialogDescription>
            The app put this link in its output. Payvoke has not checked where it leads.
          </DialogDescription>
        </DialogHeader>
        <p className="border border-border bg-background-deep px-3 py-2 font-mono text-xs break-all">
          {url}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>
            <ExternalLink /> Open link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const linkSafety = { enabled: true, renderModal: LinkConfirm };

// The console's table language for markdown, as utilities on the container:
// hairlines, small type, no rounded or padded wrapper, no height cap. Tables
// scroll sideways inside their own box.
const markdown = cn(
  "aui-sd min-w-0 text-sm leading-relaxed wrap-anywhere *:[&+*]:mt-3",
  "[&_:is(h1,h2,h3)]:mt-5 [&_:is(h1,h2,h3)]:font-semibold [&_:is(h1,h2,h3)]:tracking-[-0.01em] [&_h1]:text-xl [&_h2]:text-[1.0625rem] [&_h3]:text-[0.9375rem]",
  "[&_[data-streamdown=table-wrapper]]:my-3 [&_[data-streamdown=table-wrapper]]:gap-0 [&_[data-streamdown=table-wrapper]]:border-border [&_[data-streamdown=table-wrapper]]:bg-card [&_[data-streamdown=table-wrapper]]:p-0 [&_[data-streamdown=table-wrapper]]:wrap-normal",
  "[&_[data-streamdown=table-wrapper]>div:first-child]:border-b [&_[data-streamdown=table-wrapper]>div:first-child]:border-border [&_[data-streamdown=table-wrapper]>div:first-child]:px-1.5 [&_[data-streamdown=table-wrapper]>div:first-child]:py-1",
  "[&_[data-streamdown=table-wrapper]>div:has(table)]:max-h-none [&_[data-streamdown=table-wrapper]>div:has(table)]:border-0 [&_[data-streamdown=table-wrapper]>div:has(table)]:bg-transparent",
  "[&_[data-streamdown=table]]:w-full [&_[data-streamdown=table-header]]:bg-muted/60",
  "[&_:is([data-streamdown=table-header-cell],[data-streamdown=table-cell])]:px-3 [&_:is([data-streamdown=table-header-cell],[data-streamdown=table-cell])]:py-2 [&_:is([data-streamdown=table-header-cell],[data-streamdown=table-cell])]:text-xs",
  "[&_[data-streamdown=table-header-cell]]:font-medium [&_[data-streamdown=table-header-cell]]:whitespace-nowrap [&_[data-streamdown=table-header-cell]]:text-muted-foreground",
  "[&_[data-streamdown=table-cell]]:max-w-72 [&_[data-streamdown=table-cell]]:min-w-16 [&_[data-streamdown=table-cell]]:align-top",
  "[&_[data-streamdown=table-row]]:border-b [&_[data-streamdown=table-row]]:border-border [&_[data-streamdown=table-body]_[data-streamdown=table-row]:last-child]:border-b-0",
  "[&_[data-streamdown=inline-code]]:rounded-none [&_[data-streamdown=inline-code]]:px-1.25 [&_[data-streamdown=inline-code]]:py-px [&_[data-streamdown=inline-code]]:text-[0.8125em]",
  "[&_[data-streamdown=blockquote]]:border-l [&_[data-streamdown=blockquote]]:border-primary [&_[data-streamdown=blockquote]]:text-muted-foreground [&_[data-streamdown=blockquote]]:not-italic",
);

// Streaming markdown: remend closes half-written syntax (bold, fences,
// tables) while chunks arrive, and a block caret marks the live edge.
export function StreamdownText() {
  return (
    <StreamdownTextPrimitive
      plugins={{ code }}
      shikiTheme={["vitesse-light", "vitesse-dark"]}
      security={security}
      skipHtml
      linkSafety={linkSafety}
      caret="block"
      // Real deltas arrive in bursts; reveal them at an even pace.
      smooth
      controls={{ code: true, table: true }}
      containerClassName={markdown}
    />
  );
}
