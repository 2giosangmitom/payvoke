import { createMiddleware } from "hono/factory";
import { ForbiddenError } from "../../errors";
import type { AppEnv, SignedInEnv } from "../../http/context";
import { isBuyerToken } from "./access-token.service";

// Routes opt into a signed-in buyer; handlers then read `c.var.account`.
export const requireAccount = createMiddleware<SignedInEnv>(async (c, next) => {
  c.set("account", await c.var.cradle.authService.requireAccount(c.req.raw.headers));
  await next();
});

// A buyer access token acts on buyer routes only: it cannot sign in, manage
// tokens or act in Studio.
const sessionOnly = ["/v1/auth/", "/v1/me", "/v1/access-tokens", "/v1/provider/"];

// The web-write policy, including pre-login endpoints. CORS alone is not CSRF
// protection; no Origin-less web writes are allowed. Provider workers write
// with an app key and MCP hosts with a buyer access token instead of a browser
// session; neither carries a cookie the browser could attach.
export const originGuard = (webOrigin: string) => {
  const allowed = new URL(webOrigin).origin;
  return createMiddleware<AppEnv>(async (c, next) => {
    const providerBearer =
      c.req.path.startsWith("/v1/provider/apps/") &&
      c.req.header("authorization")?.startsWith("Bearer pvk_");
    const buyerToken = isBuyerToken(c.req.header("authorization"));
    if (buyerToken && sessionOnly.some((path) => c.req.path.startsWith(path)))
      throw new ForbiddenError("ACCESS_TOKEN_NOT_ALLOWED");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
      !providerBearer &&
      !buyerToken &&
      // MCP authenticates every request with a token; it answers 401 itself.
      c.req.path !== "/mcp" &&
      c.req.header("origin") !== allowed
    )
      throw new ForbiddenError("INVALID_ORIGIN");
    await next();
    if (c.req.path.startsWith("/v1/auth/") || c.req.path === "/v1/me")
      c.header("Cache-Control", "no-store");
  });
};
