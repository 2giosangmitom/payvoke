import { createMiddleware } from "hono/factory";
import { ForbiddenError } from "../../errors";
import type { AppEnv, SignedInEnv } from "../../http/context";

// Routes opt into a signed-in buyer; handlers then read `c.var.account`.
export const requireAccount = createMiddleware<SignedInEnv>(async (c, next) => {
  c.set("account", await c.var.cradle.authService.requireAccount(c.req.raw.headers));
  await next();
});

// The web-write policy, including pre-login endpoints. CORS alone is not CSRF
// protection; no Origin-less web writes are allowed. Provider workers write
// with an app key instead of a browser session.
export const originGuard = (webOrigin: string) => {
  const allowed = new URL(webOrigin).origin;
  return createMiddleware<AppEnv>(async (c, next) => {
    const providerBearer =
      c.req.path.startsWith("/v1/provider/apps/") &&
      c.req.header("authorization")?.startsWith("Bearer pvk_");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
      !providerBearer &&
      c.req.header("origin") !== allowed
    )
      throw new ForbiddenError("INVALID_ORIGIN");
    await next();
    if (c.req.path.startsWith("/v1/auth/") || c.req.path === "/v1/me")
      c.header("Cache-Control", "no-store");
  });
};
