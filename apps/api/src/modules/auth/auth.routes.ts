import { Hono } from "hono";
import type { AppEnv } from "../../http/context";
import { maxBody, rateLimit } from "../../http/limits";
import { requireAccount } from "./guard";

// Better Auth's native endpoints (SIWE nonce/verify, session, sign-out) and the
// signed-in buyer.
export const authRoutes = new Hono<AppEnv>()
  .on(["GET", "POST"], "/v1/auth/*", maxBody(8192), rateLimit("auth", 20), async (c) => {
    const response = await c.var.cradle.authService.handle(c.req.raw);
    if (response.ok) return response;
    // SIWE can wrap adapter exceptions in a 401 with an `error` detail.
    // Forward only a public code, never arbitrary library/DB exception data.
    const failure = (await response
      .clone()
      .json()
      .catch(() => ({}))) as { code?: string; error?: unknown };
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.set("content-type", "application/json");
    if (response.status >= 500 || failure.error) {
      c.var.cradle.log.error("Authentication request failed");
      return new Response(
        JSON.stringify({ code: "INTERNAL_ERROR", message: "Authentication failed" }),
        { status: 500, headers },
      );
    }
    return new Response(
      JSON.stringify({
        code: failure.code ?? "AUTHENTICATION_FAILED",
        message: "Authentication failed",
      }),
      { status: response.status, headers },
    );
  })
  .get("/v1/me", requireAccount, (c) =>
    c.json({
      buyer: { id: c.var.account.id, address: c.var.account.walletAddress },
      roles: [] as string[],
      scopes: [] as string[],
    }),
  );
