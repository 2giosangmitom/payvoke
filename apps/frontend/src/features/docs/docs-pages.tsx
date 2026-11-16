import { Link, getRouteApi } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { usePageMeta } from "@/src/app/head";
import { Eyebrow } from "@/src/components/layout/page-kit";
import { machineDocs } from "./docs-layout";
import { DocMarkdown } from "./markdown";
import { MethodPath, OperationView } from "./operation";
import { info, sections } from "./spec";

function Title({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="grid gap-3 pb-8">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="text-[clamp(2rem,4vw,3rem)] leading-[1.05] font-medium tracking-[-0.05em] text-balance">
        {title}
      </h1>
    </header>
  );
}

export function DocsOverview() {
  return (
    <main className="grid max-w-3xl gap-12">
      <div>
        <Title eyebrow="Builder docs" title={info.title} />
        <DocMarkdown>{info.description}</DocMarkdown>
      </div>
      <section aria-labelledby="docs-reference" className="grid gap-4">
        <h2 id="docs-reference" className="text-xl font-semibold tracking-[-0.02em]">
          Reference
        </h2>
        <ul className="divide-y divide-border border-y border-border">
          {sections.map((section) => (
            <li key={section.slug}>
              <Link
                to="/docs/$section"
                params={{ section: section.slug }}
                className="group grid gap-1 py-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-baseline sm:gap-6"
              >
                <span className="font-medium group-hover:text-primary">{section.name}</span>
                <span className="text-sm text-muted-foreground">
                  {section.summary ??
                    section.operations.map((operation) => operation.summary).join(", ")}
                </span>
                <ArrowRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="docs-agents" className="grid gap-4">
        <h2 id="docs-agents" className="text-xl font-semibold tracking-[-0.02em]">
          For AI assistants
        </h2>
        <p className="text-[15px] leading-7 text-muted-foreground">
          The same reference as plain files. Point your AI assistant at{" "}
          <code className="font-mono text-sm text-foreground">llms.txt</code> and it can build the
          integration for you.
        </p>
        <ul className="divide-y divide-border border-y border-border">
          {machineDocs.map((doc) => (
            <li key={doc.href}>
              <a
                href={doc.href}
                className="group flex flex-wrap items-baseline justify-between gap-2 py-3"
              >
                <span className="font-mono text-sm text-foreground group-hover:text-primary">
                  {doc.href}
                </span>
                <span className="text-sm text-muted-foreground">{doc.note}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

const route = getRouteApi("/_market/docs/$section");

export function DocsSection() {
  const { section: slug } = route.useParams();
  const section = sections.find((entry) => entry.slug === slug)!;
  usePageMeta({
    title: `${section.name} · Builder API`,
    description: section.description.split("\n")[0],
  });
  return (
    <main className="min-w-0">
      <div className="grid max-w-3xl gap-8 pb-12">
        <div>
          <Title
            eyebrow={section.operations.length ? "Builder API" : "Guide"}
            title={section.name}
          />
          <DocMarkdown>{section.description}</DocMarkdown>
        </div>
        {section.operations.length > 0 && (
          <nav aria-label={`${section.name} endpoints`}>
            <ul className="divide-y divide-border border-y border-border">
              {section.operations.map((operation) => (
                <li key={operation.operationId}>
                  <a
                    href={`#${operation.operationId}`}
                    className="group grid gap-1 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-6"
                  >
                    <span className="text-sm font-medium group-hover:text-primary">
                      {operation.summary}
                    </span>
                    <MethodPath
                      method={operation.method}
                      path={operation.path}
                      className="text-xs"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
      {section.operations.map((operation) => (
        <OperationView key={operation.operationId} operation={operation} />
      ))}
    </main>
  );
}
