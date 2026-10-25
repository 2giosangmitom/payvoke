import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { ForbiddenError } from "../../errors";
import type { AccountIdentity } from "./auth.service";

declare module "fastify" {
  interface FastifyRequest {
    account: AccountIdentity | null;
  }
  interface FastifyInstance {
    requireAccount(request: FastifyRequest): Promise<void>;
    optionalAccount(request: FastifyRequest): Promise<AccountIdentity | null>;
  }
}

// Register after the DI and HTTP plugins and before feature routes. Routes opt
// into a signed-in buyer with `preHandler: app.requireAccount`.
export const authGuard = fp(
  async (app: FastifyInstance) => {
    const { authService, config } = app.diContainer.cradle;
    const webOrigin = new URL(config.WEB_ORIGIN).origin;

    app.decorateRequest("account", null);
    app.decorate("optionalAccount", (request: FastifyRequest) =>
      authService.optionalAccount(request.headers),
    );
    app.decorate("requireAccount", async (request: FastifyRequest) => {
      request.account = await authService.requireAccount(request.headers);
    });

    // Preserve the web-write policy, including pre-login endpoints. CORS alone
    // is not CSRF protection; no Origin-less web writes are allowed.
    app.addHook("onRequest", async (request, reply) => {
      if (request.url.startsWith("/v1/auth/") || request.url.split("?")[0] === "/v1/me") {
        reply.cacheControl("no-store");
      }
      const providerBearer =
        request.url.startsWith("/v1/provider/apps/") &&
        request.headers.authorization?.startsWith("Bearer pvk_");
      if (
        !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
        !providerBearer &&
        request.headers.origin !== webOrigin
      ) {
        throw new ForbiddenError("INVALID_ORIGIN");
      }
    });
  },
  { name: "payvoke-auth-guard", dependencies: ["@fastify/awilix", "@fastify/sensible"] },
);
