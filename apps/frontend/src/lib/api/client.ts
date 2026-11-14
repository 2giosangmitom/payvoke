import { hc, type ClientResponse, type InferResponseType } from "hono/client";
import type { SuccessStatusCode } from "hono/utils/http-status";
import type { AppType } from "api/rpc";

export const apiOrigin = import.meta.env.VITE_API_ORIGIN || "http://localhost:3001";

// Typed client for the Payvoke API (Hono RPC). Every request carries the
// session cookie; the API checks the Origin of each write.
export const client = hc<AppType>(apiOrigin, {
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, { ...init, credentials: "include" }),
});

// Readable text for codes a person is likely to hit in the console.
const messages: Record<string, string> = {
  APP_LIMIT_REACHED: "You can have at most 3 agents. Archive one to create another.",
  APP_NEVER_CONNECTED: "Connect your agent to its event feed once before publishing it.",
  APP_NO_DEFAULT_COMMAND: "Register at least one command before publishing.",
  APP_DESCRIPTION_TOO_SHORT: "Write a description of at least 20 characters before publishing.",
  INVALID_APP: "Names can't contain links, HTML or special characters.",
  INVALID_APP_NAME: "Names can't contain links, HTML or special characters.",
  INVALID_DISPLAY_NAME: "Display names can't contain links, HTML or special characters.",
  RATE_LIMITED: "Too many requests. Try again later.",
  rpc_unavailable:
    "The Avalanche network did not answer in time. Nothing was charged; try paying again.",
  REVISION_TOO_LATE:
    "Too little time is left for a fix and its review. The payment settles on the current result.",
};

// A failed request: the API's stable public code, or the HTTP status.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(messages[code] ?? code);
    this.name = "ApiError";
  }
}

// The body of a successful response of an RPC call.
export type Ok<R> =
  R extends ClientResponse<infer T, infer S, "json">
    ? S extends SuccessStatusCode
      ? T
      : never
    : never;

type JsonResponse = { ok: boolean; status: number; json(): Promise<unknown> };

async function read(request: Promise<JsonResponse>) {
  const response = await request;
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status,
      (data as { error?: string }).error || `HTTP ${response.status}`,
    );
  return data;
}

// Awaits an RPC call and returns its typed JSON body, or throws ApiError.
export async function call<R extends ClientResponse<unknown, number, string>>(
  request: Promise<R>,
): Promise<Ok<R>> {
  return (await read(request)) as Ok<R>;
}

// For a body the API serializes from stored JSON (signed quote documents,
// AG-UI events), whose inferred type is only JSON: the caller names its shape.
export async function callAs<T>(request: Promise<JsonResponse>): Promise<T> {
  return (await read(request)) as T;
}

// The success body type of an endpoint, e.g. `Body<typeof client.v1.apps.$get>`.
export type Body<E extends (...args: never[]) => unknown> = InferResponseType<E, SuccessStatusCode>;
