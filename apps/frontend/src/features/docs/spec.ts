import document from "./openapi.json";
import x402Guide from "../../../../api/docs/x402.md?raw";

// The builder API reference, generated from the API's routes by
// `bun --filter api docs`. Never edit openapi.json by hand.

export type Schema = {
  $ref?: string;
  type?: string | string[];
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  additionalProperties?: Schema | boolean;
  enum?: unknown[];
  const?: unknown;
  oneOf?: Schema[];
  anyOf?: Schema[];
  allOf?: Schema[];
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  default?: unknown;
  examples?: unknown[];
};

export type Parameter = {
  in: "path" | "query" | "header";
  name: string;
  required?: boolean;
  description?: string;
  schema?: Schema;
};

type Media = Record<string, { schema?: Schema }>;

export type Operation = {
  method: string;
  path: string;
  operationId: string;
  summary: string;
  description: string;
  tag: string;
  scope: string;
  parameters: Parameter[];
  requestBody?: { content: Media };
  responses: Record<string, { description: string; content?: Media }>;
};

export type Section = {
  slug: string;
  name: string;
  description: string;
  operations: Operation[];
  // A guide's one-line summary for the overview; reference sections list their operations.
  summary?: string;
};

type RawOperation = Omit<Operation, "method" | "path" | "tag" | "scope" | "parameters"> & {
  tags: string[];
  parameters?: Parameter[];
  "x-payvoke-scope": string;
};

const spec = document as unknown as {
  info: { title: string; description: string };
  servers: { url: string }[];
  tags: { name: string; description: string }[];
  paths: Record<string, Record<string, RawOperation>>;
  components: { schemas: Record<string, Schema> };
};

export const info = spec.info;

// The public API the reference documents.
export const serverUrl = spec.servers[0].url;

const referenceSections: Section[] = spec.tags.map((tag) => ({
  slug: tag.name.toLowerCase(),
  name: tag.name,
  description: tag.description,
  operations: Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([, operation]) => operation.tags.includes(tag.name))
      .map(([method, { tags: _tags, "x-payvoke-scope": scope, parameters, ...operation }]) => ({
        ...operation,
        method: method.toUpperCase(),
        path,
        tag: tag.name,
        scope,
        parameters: parameters ?? [],
      })),
  ),
}));

// Guides with no builder operations of their own, written in the API's docs/
// next to the generated sections' text.
const guides: Section[] = [
  {
    slug: "x402",
    name: "x402",
    description: x402Guide.trim(),
    operations: [],
    summary: "Pay for jobs over HTTP: the 402 challenge, escrow, instant commands, the SDK",
  },
];

export const sections: Section[] = [...referenceSections, ...guides];

export const sectionOf = (operationId: string) =>
  sections.find((section) => section.operations.some((op) => op.operationId === operationId));

export const refName = (ref: string) => ref.replace("#/components/schemas/", "");

export function resolve(schema: Schema): Schema {
  return schema.$ref ? resolve(spec.components.schemas[refName(schema.$ref)] ?? {}) : schema;
}

// `#operation/<id>` links in the guide text point at an operation's anchor.
export function docsHref(href: string) {
  const match = /^#operation\/(\w+)$/.exec(href);
  if (!match) return href;
  const section = sectionOf(match[1]);
  return section ? `/docs/${section.slug}#${match[1]}` : href;
}

export const jsonSchemaOf = (media?: Media) =>
  media?.["application/json"]?.schema ?? Object.values(media ?? {})[0]?.schema;

// A plausible value for a schema, for request examples.
export function example(schema: Schema, depth = 0): unknown {
  const s = resolve(schema);
  if (s.examples?.length) return s.examples[0];
  if (s.const !== undefined) return s.const;
  if (s.enum?.length) return s.enum[0];
  if (s.default !== undefined) return s.default;
  const variant = s.oneOf?.[0] ?? s.anyOf?.find((option) => resolve(option).type !== "null");
  if (variant) return example(variant, depth);
  if (s.allOf) return Object.assign({}, ...s.allOf.map((part) => example(part, depth) as object));
  if (depth > 6) return null;
  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  switch (type) {
    case "object": {
      if (!s.properties) return {};
      const required = new Set(s.required);
      return Object.fromEntries(
        Object.entries(s.properties)
          .filter(([name]) => required.has(name))
          .map(([name, child]) => [name, example(child, depth + 1)]),
      );
    }
    case "array":
      return s.items ? [example(s.items, depth + 1)] : [];
    case "integer":
    case "number":
      return s.minimum ?? (s.exclusiveMinimum !== undefined ? s.exclusiveMinimum + 1 : 1);
    case "boolean":
      return true;
    case "string":
      return s.format === "date-time" ? "2026-10-31T12:00:00.000Z" : "string";
    default:
      return null;
  }
}

// A curl call for the operation, against this deployment's API origin.
export function curl(operation: Operation, origin: string) {
  const url = `${origin}${operation.path.replace(/\{(\w+)\}/g, (_, name: string) => `$${name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`)}`;
  const lines = [
    `curl${operation.method === "GET" ? "" : ` -X ${operation.method}`} "${url}"`,
    `  -H "Authorization: Bearer $PAYVOKE_KEY"`,
  ];
  const content = operation.requestBody?.content ?? {};
  if (content["application/x-ndjson"]) {
    const line = example(content["application/x-ndjson"].schema ?? {});
    lines.push(
      `  -H "Content-Type: application/x-ndjson"`,
      `  --data-binary '${JSON.stringify(line)}'`,
    );
  } else if (content["application/json"]) {
    const body = JSON.stringify(example(content["application/json"].schema ?? {}), null, 2);
    lines.push(`  -H "Content-Type: application/json"`, `  -d '${body.replaceAll("\n", "\n  ")}'`);
  }
  return lines.join(" \\\n");
}

// Error responses list their codes in the description: "Conflict: `A`, `B`".
export function errorCodes(description: string) {
  const [label] = description.split(":");
  return { label, codes: [...description.matchAll(/`([A-Z0-9_]+)`/g)].map((match) => match[1]) };
}
