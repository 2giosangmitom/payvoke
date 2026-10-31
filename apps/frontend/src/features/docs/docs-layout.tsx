import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { sections } from "./spec";

// Plain files for agents and tools, generated with the spec.
export const machineDocs = [
  { href: "/llms.txt", label: "llms.txt", note: "Index for agents" },
  { href: "/llms-full.txt", label: "llms-full.txt", note: "Full reference in Markdown" },
  { href: "/openapi.json", label: "openapi.json", note: "OpenAPI 3.1" },
] as const;

// A wrapped row on phones; a rail with the 1px jade selection line on desktop.
const item =
  "relative block py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-primary lg:pl-3 lg:aria-[current=page]:text-foreground lg:aria-[current=page]:before:absolute lg:aria-[current=page]:before:inset-y-1.5 lg:aria-[current=page]:before:left-0 lg:aria-[current=page]:before:w-px lg:aria-[current=page]:before:bg-primary";

function Nav() {
  return (
    <nav aria-label="Docs" className="grid gap-6">
      <div className="flex flex-wrap gap-x-5 border-b border-border pb-3 lg:grid lg:border-b-0 lg:border-l lg:pb-0">
        <Link to="/docs" activeOptions={{ exact: true }} className={item}>
          Overview
        </Link>
        {sections.map((section) => (
          <Link
            key={section.slug}
            to="/docs/$section"
            params={{ section: section.slug }}
            className={item}
          >
            {section.name}
          </Link>
        ))}
      </div>
      <div className="hidden gap-2 lg:grid">
        <p className="text-xs text-muted-foreground">For agents</p>
        {machineDocs.map((doc) => (
          <a
            key={doc.href}
            href={doc.href}
            className="font-mono text-xs text-foreground hover:text-primary"
          >
            {doc.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

// The docs shell: a section rail beside the page, stacked above it on phones.
export function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container-page grid gap-8 pt-8 pb-24 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-12 lg:pt-12">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <Nav />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
