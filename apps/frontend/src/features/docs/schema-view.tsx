import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { DocMarkdown } from "./markdown";
import { refName, resolve, type Schema } from "./spec";

type Shape = {
  type: string;
  nullable: boolean;
  fields: { name: string; required: boolean; schema: Schema }[];
  variants: { title: string; schema: Schema }[];
  item?: Schema;
};

const isNull = (schema: Schema) => resolve(schema).type === "null";

// Merges `allOf` parts into one object, as a reader sees them.
function merged(schema: Schema): Schema {
  const s = resolve(schema);
  if (!s.allOf) return s;
  const parts = s.allOf.map(merged);
  const variant = parts.find((part) => part.oneOf || part.anyOf);
  return {
    ...s,
    allOf: undefined,
    type: "object",
    properties: Object.assign({}, ...parts.map((part) => part.properties ?? {})),
    required: parts.flatMap((part) => part.required ?? []),
    ...(variant ? { oneOf: variant.oneOf ?? variant.anyOf } : {}),
  };
}

// A union member's title: its component name, else the value of its literal
// discriminator (`type: "progress"`), else its type.
function variantTitle(schema: Schema) {
  if (schema.$ref) return refName(schema.$ref);
  const s = merged(schema);
  const literal = Object.entries(s.properties ?? {}).find(
    ([, p]) => resolve(p).const !== undefined,
  );
  return literal
    ? `${literal[0]}: ${JSON.stringify(resolve(literal[1]).const)}`
    : typeLabel(schema);
}

function typeLabel(schema: Schema): string {
  const name = schema.$ref ? refName(schema.$ref) : null;
  const s = merged(schema);
  const options = s.anyOf ?? s.oneOf;
  if (options) {
    const real = options.filter((option) => !isNull(option));
    const label = real.length === 1 ? typeLabel(real[0]) : (name ?? "one of");
    return real.length < options.length ? `${label} | null` : label;
  }
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.type === "array") {
    const item = s.items ? typeLabel(s.items) : "any";
    return item.includes(" | ") ? `(${item})[]` : `${item}[]`;
  }
  if (name) return name;
  if (s.type === "object" && !s.properties && s.additionalProperties) return "map";
  if (Array.isArray(s.type)) return s.type.join(" | ");
  return s.type ?? "any";
}

function shape(schema: Schema): Shape {
  const s = merged(schema);
  const options = s.oneOf ?? s.anyOf ?? [];
  const real = options.filter((option) => !isNull(option));
  if (real.length === 1) return { ...shape(real[0]), nullable: true };
  const required = new Set(s.required);
  return {
    type: typeLabel(schema),
    nullable: real.length < options.length,
    fields: Object.entries(s.properties ?? {}).map(([name, child]) => ({
      name,
      required: required.has(name),
      schema: child,
    })),
    variants: real.map((option) => ({ title: variantTitle(option), schema: option })),
    item: s.type === "array" ? s.items : undefined,
  };
}

// What a value must look like beyond its type.
function constraints(schema: Schema) {
  const s = resolve(schema);
  const out: string[] = [];
  if (s.enum) out.push(s.enum.map((value) => JSON.stringify(value)).join(" | "));
  if (s.format) out.push(s.format);
  if (s.pattern) out.push(`matches ${s.pattern}`);
  if (s.minLength !== undefined || s.maxLength !== undefined)
    out.push(`${s.minLength ?? 0}–${s.maxLength ?? "∞"} chars`);
  // Zod bounds every integer to the safe range; that says nothing to a reader.
  if (s.minimum !== undefined && s.minimum > Number.MIN_SAFE_INTEGER) out.push(`≥ ${s.minimum}`);
  if (s.exclusiveMinimum !== undefined) out.push(`> ${s.exclusiveMinimum}`);
  if (s.maximum !== undefined && s.maximum < Number.MAX_SAFE_INTEGER) out.push(`≤ ${s.maximum}`);
  if (s.minItems !== undefined || s.maxItems !== undefined)
    out.push(`${s.minItems ?? 0}–${s.maxItems ?? "∞"} items`);
  if (s.default !== undefined) out.push(`default ${JSON.stringify(s.default)}`);
  return out;
}

const nested = (schema: Schema): boolean => {
  const { fields, variants, item } = shape(schema);
  if (fields.length || variants.length > 1) return true;
  return item ? nested(item) : false;
};

function Children({ schema, depth }: { schema: Schema; depth: number }) {
  const { fields, variants, item } = shape(schema);
  if (item && !fields.length) return <Children schema={item} depth={depth} />;
  return (
    <>
      {fields.length > 0 && (
        <ul className="divide-y divide-border">
          {fields.map((field) => (
            <Field key={field.name} {...field} depth={depth} />
          ))}
        </ul>
      )}
      {variants.length > 1 && (
        <div className="grid gap-2 py-3">
          <p className="text-xs text-muted-foreground">One of:</p>
          {variants.map((variant) => (
            <Collapsible key={variant.title} title={variant.title} open={false}>
              <Children schema={variant.schema} depth={depth + 1} />
            </Collapsible>
          ))}
        </div>
      )}
    </>
  );
}

function Collapsible({
  title,
  open,
  children,
}: {
  title: string;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="group/details border border-border">
      <summary className="flex items-center gap-2 px-3 py-2 font-mono text-xs text-foreground select-none hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/details:rotate-90" />
        <span className="min-w-0 break-all">{title}</span>
      </summary>
      <div className="border-t border-border px-3">{children}</div>
    </details>
  );
}

function Field({
  name,
  required,
  schema,
  depth,
}: {
  name: string;
  required: boolean;
  schema: Schema;
  depth: number;
}) {
  const description = schema.description ?? resolve(schema).description;
  const rules = constraints(schema);
  const children = depth < 6 && nested(schema);
  return (
    <li className="grid gap-1.5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <code className="font-mono text-sm font-medium break-all text-foreground">{name}</code>
        <span className="font-mono text-xs break-all text-muted-foreground">
          {typeLabel(schema)}
        </span>
        {required && <span className="text-xs text-primary">required</span>}
      </div>
      {description && <DocMarkdown className="text-sm leading-6">{description}</DocMarkdown>}
      {rules.length > 0 && (
        <p className="font-mono text-xs break-all text-faint">{rules.join(" · ")}</p>
      )}
      {children && (
        <div className="mt-1">
          <Collapsible
            title={`${name} fields`}
            open={depth === 0 && shape(schema).fields.length < 8}
          >
            <Children schema={schema} depth={depth + 1} />
          </Collapsible>
        </div>
      )}
    </li>
  );
}

// A request or response body as a readable field tree.
export function SchemaView({ schema, className }: { schema: Schema; className?: string }) {
  const s = resolve(schema);
  const { fields, variants, item, type, nullable } = shape(schema);
  return (
    <div className={cn("min-w-0", className)}>
      <p className="font-mono text-xs text-muted-foreground">
        {type}
        {nullable && !type.endsWith("| null") ? " | null" : ""}
      </p>
      {s.description && (
        <DocMarkdown className="mt-1 text-sm leading-6">{s.description}</DocMarkdown>
      )}
      {fields.length || variants.length > 1 || item ? <Children schema={schema} depth={0} /> : null}
    </div>
  );
}
