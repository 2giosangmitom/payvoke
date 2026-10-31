import type { ComponentProps } from "react";
import { createCodePlugin } from "@streamdown/code";
import { Streamdown } from "streamdown";
import { cn } from "@/src/lib/utils";
import { docsHref } from "./spec";

const code = createCodePlugin({ themes: ["vitesse-light", "vitesse-dark"] });

// Guide links are our own, so they skip the chat's link confirmation; links
// to an operation (`#operation/<id>`) go to its section page.
function DocLink({
  href = "",
  children,
  node: _node,
  ...props
}: ComponentProps<"a"> & { node?: unknown }) {
  const target = docsHref(href);
  const external = /^https?:/.test(target);
  return (
    <a
      {...props}
      href={target}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="text-primary underline-offset-4 hover:underline"
    >
      {children}
    </a>
  );
}

// Markdown from the generated spec: the guide and operation descriptions.
export function DocMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <Streamdown
      mode="static"
      plugins={{ code }}
      shikiTheme={["vitesse-light", "vitesse-dark"]}
      controls={{ code: true, table: false }}
      linkSafety={{ enabled: false }}
      components={{ a: DocLink }}
      className={cn("docs-prose min-w-0 text-[15px] leading-7 text-muted-foreground", className)}
    >
      {children}
    </Streamdown>
  );
}
