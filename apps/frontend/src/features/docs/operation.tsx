import type { ReactNode } from "react";
import { Link } from "lucide-react";
import { CodeBlock } from "@/src/features/keys/settings-row";
import { cn } from "@/src/lib/utils";
import { DocMarkdown } from "./markdown";
import { SchemaView } from "./schema-view";
import { curl, errorCodes, jsonSchemaOf, type Operation, type Parameter, serverUrl } from "./spec";

const METHOD_TONE: Record<string, string> = {
  GET: "text-primary",
  POST: "text-foreground",
  PUT: "text-foreground",
  PATCH: "text-foreground",
  DELETE: "text-destructive",
};

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="bg-muted px-1.5 py-0.5 font-mono text-xs break-all text-foreground">
      {children}
    </code>
  );
}

export function MethodPath({
  method,
  path,
  className,
}: {
  method: string;
  path: string;
  className?: string;
}) {
  return (
    <p className={cn("flex min-w-0 gap-2 font-mono text-[13px] leading-6", className)}>
      <span className={cn("shrink-0 font-semibold", METHOD_TONE[method])}>{method}</span>
      <span className="min-w-0 break-all text-foreground">
        {path.split(/(\{\w+\})/).map((part, index) =>
          part.startsWith("{") ? (
            <span key={index} className="text-muted-foreground">
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </span>
    </p>
  );
}

function Block({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-border pt-5">
      <h3 className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium">
        {title}
        {aside && (
          <span className="font-mono text-xs font-normal text-muted-foreground">{aside}</span>
        )}
      </h3>
      {children}
    </section>
  );
}

function Parameters({ parameters }: { parameters: Parameter[] }) {
  return (
    <ul className="divide-y divide-border">
      {parameters.map((parameter) => (
        <li key={`${parameter.in}-${parameter.name}`} className="grid gap-1 py-2.5 first:pt-0">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <code className="font-mono text-sm font-medium text-foreground">{parameter.name}</code>
            <span className="font-mono text-xs text-muted-foreground">
              {parameter.schema?.type ?? "string"}
            </span>
            {parameter.required && <span className="text-xs text-primary">required</span>}
          </div>
          {parameter.description && (
            <DocMarkdown className="text-sm leading-6">{parameter.description}</DocMarkdown>
          )}
        </li>
      ))}
    </ul>
  );
}

// One endpoint: what it does, what it takes, what it answers, and a curl call.
export function OperationView({ operation }: { operation: Operation }) {
  const path = operation.parameters.filter((p) => p.in === "path");
  const query = operation.parameters.filter((p) => p.in === "query");
  const request = operation.requestBody?.content ?? {};
  const requestType = Object.keys(request)[0];
  const statuses = Object.keys(operation.responses);
  const success = statuses.filter((status) => status.startsWith("2"));
  const failures = statuses.filter((status) => !status.startsWith("2"));
  const description = operation.description.replace(/\n\nRequires an app key with .*$/s, "");
  return (
    <article
      id={operation.operationId}
      aria-labelledby={`${operation.operationId}-title`}
      className="grid scroll-mt-24 gap-8 border-t border-border py-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:gap-12"
    >
      <div className="grid min-w-0 content-start gap-6">
        <header className="grid gap-3">
          <h2
            id={`${operation.operationId}-title`}
            className="group flex items-center gap-2 text-2xl font-semibold tracking-[-0.025em]"
          >
            {operation.summary}
            <a
              href={`#${operation.operationId}`}
              aria-label={`Link to ${operation.summary}`}
              className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Link className="size-4" />
            </a>
          </h2>
          <MethodPath method={operation.method} path={operation.path} />
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Scope <Code>{operation.scope}</Code>
          </div>
        </header>
        <DocMarkdown>{description}</DocMarkdown>

        {path.length > 0 && (
          <Block title="Path parameters">
            <Parameters parameters={path} />
          </Block>
        )}
        {query.length > 0 && (
          <Block title="Query parameters">
            <Parameters parameters={query} />
          </Block>
        )}
        {requestType && (
          <Block title="Request body" aside={requestType}>
            <SchemaView schema={request[requestType].schema ?? {}} />
          </Block>
        )}
        {success.map((status) => {
          const response = operation.responses[status];
          const schema = jsonSchemaOf(response.content);
          return (
            <Block
              key={status}
              title={`Response ${status}`}
              aside={Object.keys(response.content ?? {}).join(", ")}
            >
              <p className="text-sm text-muted-foreground">{response.description}</p>
              {schema && <SchemaView schema={schema} />}
            </Block>
          );
        })}
        <Block title="Errors" aside="{ error: CODE }">
          <ul className="divide-y divide-border">
            {failures.map((status) => {
              const { label, codes } = errorCodes(operation.responses[status].description);
              return (
                <li
                  key={status}
                  className="grid gap-1.5 py-2.5 first:pt-0 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-3"
                >
                  <span className="font-mono text-sm text-foreground tabular-nums">{status}</span>
                  <div className="grid min-w-0 gap-1.5">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {codes.map((code) => (
                        <Code key={code}>{code}</Code>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Block>
      </div>
      <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
        <CodeBlock code={curl(operation, serverUrl)} title="curl" />
      </aside>
    </article>
  );
}
