import { generateSpecs } from "hono-openapi";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BUILDER_TAGS } from "./http/openapi";
import { routes } from "./routes";

// The builder API reference as one OpenAPI 3.1 document, generated from the
// routes and the guide text in docs/. scripts/docs.ts writes it out.
const guide = (name: string) => readFile(join(import.meta.dir, "../docs", `${name}.md`), "utf8");

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
export type Json = Record<string, unknown>;
export type Operation = Json & { tags?: string[]; parameters?: Json[] };

export async function builderSpec() {
  const tags = await Promise.all(
    BUILDER_TAGS.map(async (name) => ({
      name,
      description: (await guide(name.toLowerCase())).trim(),
    })),
  );
  const spec = (await generateSpecs(routes, {
    defaultValidationErrorResponse: false,
    documentation: {
      info: {
        title: "Payvoke builder API",
        version: "1.0.0",
        description: (await guide("overview")).trim(),
      },
      servers: [
        {
          url: "https://payvoke.up.railway.app",
          description: "Payvoke API (Avalanche Fuji testnet)",
        },
      ],
      tags,
      components: {
        securitySchemes: {
          appKey: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "pvk_<prefix>.<secret>",
            description: "The agent's app key from Studio.",
          },
        },
      },
    },
  })) as unknown as Json & { paths: Record<string, Record<string, Operation>>; components: Json };

  // Keep builder operations only, and declare path parameters no validator did.
  const paths: Record<string, Record<string, Operation>> = {};
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation?.tags?.some((tag) => (BUILDER_TAGS as readonly string[]).includes(tag)))
        continue;
      const declared = new Set(
        (operation.parameters ?? []).filter((p) => p.in === "path").map((p) => p.name),
      );
      const missing = [...path.matchAll(/\{(\w+)\}/g)]
        .map((match) => match[1])
        .filter((name) => !declared.has(name))
        .map((name) => ({ in: "path", name, required: true, schema: { type: "string" } }));
      operation.parameters = [...missing, ...(operation.parameters ?? [])].map((parameter) =>
        parameter.in === "path" && PATH_PARAMS[parameter.name as string]
          ? { ...parameter, description: PATH_PARAMS[parameter.name as string] }
          : parameter,
      );
      (paths[path] ??= {})[method] = operation;
    }
  }
  spec.paths = paths;
  spec.components = { ...spec.components, schemas: referenced(spec) };
  return spec;
}

const PATH_PARAMS: Record<string, string> = {
  appId: "The agent's app id, shown in Studio.",
  commandId: "A command id.",
  threadId: "The buyer's thread, from the event.",
  messageId: "The buyer message, from `thread.message`.",
  offerId: "An offer id.",
  id: "The invocation id, from `invocation.ready`.",
  runId: "The run id, from the event you acknowledged.",
  fileId: "A file id.",
};

// Only the schemas the builder operations reach, directly or through others.
function referenced(spec: { paths: unknown; components: Json }) {
  const schemas = (spec.components.schemas ?? {}) as Record<string, unknown>;
  const keep = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref" && typeof child === "string") {
        const name = child.replace("#/components/schemas/", "");
        if (name in schemas && !keep.has(name)) {
          keep.add(name);
          visit(schemas[name]);
        }
      } else visit(child);
    }
  };
  visit(spec.paths);
  return Object.fromEntries(
    Object.keys(schemas)
      .sort()
      .filter((name) => keep.has(name))
      .map((name) => [name, schemas[name]]),
  );
}
