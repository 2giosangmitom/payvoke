import type { FastifyInstance, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import type { Config } from "../../config";
import type { PrismaClient } from "../../generated/prisma/client";
import { createAuth } from "./auth";

type AuthIdentity = { id: string; walletAddress: string };

declare module "fastify" {
  interface FastifyRequest {
    account: AuthIdentity | null;
  }
  interface FastifyInstance {
    requireAccount(request: FastifyRequest): Promise<void>;
  }
}

// Register after the shared HTTP plugins. requireAccount is available to the
// feature modules registered next; routes opt into it via preHandler.
export async function registerAuth(app: FastifyInstance, config: Config, db: PrismaClient) {
  const auth = createAuth(config, db);
  const webOrigin = new URL(config.WEB_ORIGIN).origin;

  app.decorateRequest("account", null);
  app.decorate("requireAccount", async function (request: FastifyRequest) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw app.httpErrors.unauthorized("UNAUTHENTICATED");
    if (session.user.status !== "ACTIVE") throw app.httpErrors.forbidden("ACCOUNT_SUSPENDED");
    const wallet = await db.walletAddress.findFirst({
      where: { userId: session.user.id, chainId: 43113, isPrimary: true },
    });
    if (!wallet) throw app.httpErrors.unauthorized("UNAUTHENTICATED");
    request.account = { id: session.user.id, walletAddress: wallet.address.toLowerCase() };
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
      throw app.httpErrors.forbidden("INVALID_ORIGIN");
    }
  });

  app.route({
    method: ["GET", "POST"],
    url: "/v1/auth/*",
    bodyLimit: 8192,
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    async handler(request, reply) {
      // The configured API origin is trusted, never the request's Host header.
      const response = await auth.handler(
        new Request(new URL(request.url, config.API_ORIGIN), {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          ...(request.method === "POST" && request.body !== undefined
            ? { body: JSON.stringify(request.body) }
            : {}),
        }),
      );
      reply.code(response.status);
      response.headers.forEach((value, name) => {
        if (name !== "set-cookie" && name !== "content-length") reply.header(name, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header("set-cookie", cookies);
      if (!response.ok) {
        // SIWE can wrap adapter exceptions in a 401 with an `error` detail.
        // Forward only a public code, never arbitrary library/DB exception data.
        const failure = (await response.json().catch(() => ({}))) as {
          code?: string;
          error?: unknown;
        };
        if (response.status >= 500 || failure.error) {
          app.log.error("Authentication request failed");
          return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Authentication failed" });
        }
        return { code: failure.code ?? "AUTHENTICATION_FAILED", message: "Authentication failed" };
      }
      return reply.send(await response.text());
    },
  });

  app.get("/v1/me", { preHandler: app.requireAccount }, async (request) => ({
    buyer: { id: request.account!.id, address: request.account!.walletAddress },
    roles: [],
    scopes: [],
  }));
}
