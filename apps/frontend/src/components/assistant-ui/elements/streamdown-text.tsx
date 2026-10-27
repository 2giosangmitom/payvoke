"use client";

import {
  StreamdownTextPrimitive,
  type LinkSafetyModalProps,
  type SecurityConfig,
} from "@assistant-ui/react-streamdown";
import { createCodePlugin } from "@streamdown/code";
import { ExternalLink } from "lucide-react";
import { Button } from "@/src/components/ui/button";
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
      controls={{ code: true, table: true }}
      containerClassName="aui-sd min-w-0 text-sm leading-relaxed"
    />
  );
}
