import { describeRoute, resolver, type DescribeRouteOptions } from "hono-openapi";
import { z } from "zod";
import type { KeyScope } from "../modules/provider/provider.validation";

// The builder API reference is generated from the routes (scripts/docs.ts).
// Only operations tagged with one of these appear in it, in this order.
export const BUILDER_TAGS = ["Commands", "Threads", "Events", "Runs", "Files"] as const;
export type BuilderTag = (typeof BUILDER_TAGS)[number];

// Every failure is `{ error: CODE }` (http/errors.ts).
export const errorBody = z
  .object({ error: z.string().meta({ description: "Stable public error code." }) })
  .meta({ id: "Error", description: "Every failed request answers this body." });

type Media = Record<string, { schema?: z.ZodType; example?: unknown }>;
type Response = { description: string; schema?: z.ZodType; content?: Media };

// Codes every app-key route can answer, besides its own.
const keyErrors = {
  401: ["INVALID_PROVIDER_KEY"],
  403: ["INSUFFICIENT_SCOPE"],
} satisfies Record<number, string[]>;

const STATUS_TEXT: Record<number, string> = {
  400: "Bad request",
  401: "Missing, invalid or revoked app key",
  403: "The key lacks the required scope",
  404: "Not found",
  409: "Conflict with the current state",
  410: "Gone",
  413: "Payload too large",
  415: "Unsupported media type",
  422: "Rejected by the deployment policy",
  429: "Rate limited",
  503: "Unavailable on this deployment",
};

// Responses are documented in zod's input form too: objects stay open to
// fields added later, and a schema used both ways is one component.
const asInput = { options: { io: "input" } };
const content = (media: Media) =>
  Object.fromEntries(
    Object.entries(media).map(([type, { schema, example }]) => [
      type,
      {
        ...(schema ? { schema: resolver(schema, asInput) } : {}),
        ...(example ? { example } : {}),
      },
    ]),
  );

// Documents one builder (app-key) route. Chain it after the route's
// validators: a later `describeRoute` wins, so `body` can document a request
// the validator checks loosely and the service checks in full.
export function builderRoute(spec: {
  operationId: string;
  tag: BuilderTag;
  summary: string;
  description: string;
  scope: KeyScope;
  body?: z.ZodType;
  requestContent?: Media;
  responses: Record<number, Response>;
  errors?: Record<number, string[]>;
}) {
  const errors: Record<number, string[]> = { ...keyErrors };
  for (const [status, codes] of Object.entries(spec.errors ?? {}))
    errors[Number(status)] = [...(errors[Number(status)] ?? []), ...codes];
  const responses: DescribeRouteOptions["responses"] = {};
  for (const [status, response] of Object.entries(spec.responses))
    responses[status] = {
      description: response.description,
      ...(response.schema || response.content
        ? {
            content: content(
              response.content ?? { "application/json": { schema: response.schema } },
            ),
          }
        : {}),
    };
  for (const [status, codes] of Object.entries(errors).sort(([a], [b]) => Number(a) - Number(b)))
    responses[status] = {
      description: `${STATUS_TEXT[Number(status)] ?? "Error"}: ${codes.map((code) => `\`${code}\``).join(", ")}`,
      content: { "application/json": { schema: resolver(errorBody, asInput) } },
    };
  const requestBody = spec.body
    ? { required: true, content: content({ "application/json": { schema: spec.body } }) }
    : spec.requestContent
      ? { required: true, content: content(spec.requestContent) }
      : undefined;
  return describeRoute({
    operationId: spec.operationId,
    tags: [spec.tag],
    summary: spec.summary,
    description: `${spec.description}\n\nRequires an app key with the \`${spec.scope}\` scope.`,
    security: [{ appKey: [] }],
    ...(requestBody ? { requestBody } : {}),
    responses,
    "x-payvoke-scope": spec.scope,
  } as DescribeRouteOptions);
}
