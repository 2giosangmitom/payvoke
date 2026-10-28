import { Hono } from "hono";
import { StreamableHTTPTransport } from "@hono/mcp";
import type { AppEnv } from "../../http/context";
import { maxBody, rateLimit } from "../../http/limits";
import { isBuyerToken } from "../auth/access-token.service";
import { payvokeMcpServer, type BuyerApi } from "./mcp.tools";

type Fetch = (request: Request) => Response | Promise<Response>;

// Streamable HTTP MCP for coding agents and other MCP hosts, authenticated
// with a buyer access token. Stateless: every request builds its own server,
// so any replica answers and the token is checked on each call. Tools call
// the buyer REST routes in process with the same token, so they share their
// validation, limits and ownership checks.
export const mcpRoutes = (fetch: Fetch) =>
  new Hono<AppEnv>().all("/mcp", rateLimit("mcp", 120), maxBody(65536), async (c) => {
    const authorization = c.req.header("authorization");
    if (!isBuyerToken(authorization)) {
      c.header("WWW-Authenticate", 'Bearer realm="payvoke"');
      return c.json({ error: "INVALID_ACCESS_TOKEN" }, 401);
    }
    // Fails with the same 401 as any other bad token.
    await c.var.cradle.accessTokenService.userId(authorization);

    const { config } = c.var.cradle;
    const api: BuyerApi = async (method, path, init = {}) => {
      const response = await fetch(
        new Request(new URL(path, config.API_ORIGIN), {
          method,
          headers: {
            authorization: authorization!,
            ...(init.json !== undefined ? { "content-type": "application/json" } : {}),
            ...init.headers,
          },
          ...(init.json !== undefined ? { body: JSON.stringify(init.json) } : {}),
        }),
      );
      const raw = await response.text();
      let body: unknown = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = { error: "UNEXPECTED_RESPONSE" };
      }
      return { status: response.status, body };
    };

    const server = payvokeMcpServer(api, new URL("/v1/invocations", config.API_ORIGIN).href);
    const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    return transport.handleRequest(c);
  });
