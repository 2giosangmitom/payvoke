import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { siwe } from "better-auth/plugins";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { getAddress, isHex, verifyMessage } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import type { Config } from "../../config";
import type { PrismaClient } from "@/core/db";

export function createAuth(
  config: Pick<Config, "API_ORIGIN" | "WEB_ORIGIN" | "BETTER_AUTH_SECRET">,
  db: PrismaClient,
) {
  const web = new URL(config.WEB_ORIGIN);
  const api = new URL(config.API_ORIGIN);
  const secure = api.protocol === "https:";
  if (!secure && !["localhost", "127.0.0.1", "[::1]"].includes(api.hostname)) {
    throw new Error("Authentication requires HTTPS outside localhost");
  }
  const binding = {
    name: secure ? "__Host-payvoke_siwe" : "payvoke_siwe",
    attributes: { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 300 } as const,
  };

  return betterAuth({
    appName: "Payvoke",
    baseURL: api.origin,
    basePath: "/v1/auth",
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [web.origin],
    database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
    user: {
      additionalFields: {
        status: { type: ["ACTIVE", "SUSPENDED"], defaultValue: "ACTIVE", input: false },
        suspendedAt: { type: "date", required: false, input: false },
      },
    },
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: secure,
      defaultCookieAttributes: { httpOnly: true, secure, sameSite: "lax", path: "/" },
    },
    // Fastify owns rate limits and sanitized logs; do not log adapter errors here.
    rateLimit: { enabled: false },
    logger: { disabled: true },
    plugins: [
      siwe({
        domain: web.host,
        anonymous: true,
        getNonce: async () => randomBytes(16).toString("hex"),
        verifyMessage: async ({ message, signature, address, chainId }) => {
          try {
            const parsed = parseSiweMessage(message);
            const now = new Date();
            // The plugin checks nonce/domain. Payvoke additionally fixes Fuji,
            // URI and a short signed validity window; viem verifies EOA signatures.
            return (
              chainId === 43113 &&
              parsed.version === "1" &&
              parsed.uri === web.origin &&
              !!parsed.issuedAt &&
              !!parsed.expirationTime &&
              parsed.issuedAt <= now &&
              parsed.expirationTime.getTime() > parsed.issuedAt.getTime() &&
              parsed.expirationTime.getTime() - parsed.issuedAt.getTime() <= 300000 &&
              validateSiweMessage({
                message: parsed,
                domain: web.host,
                address: getAddress(address),
                time: now,
              }) &&
              isHex(signature) &&
              (await verifyMessage({ address: getAddress(address), message, signature }))
            );
          } catch {
            return false;
          }
        },
      }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/siwe/verify") return;
        const nonce = parseSiweMessage(ctx.body.message).nonce;
        if (!nonce || (await ctx.getSignedCookie(binding.name, ctx.context.secret)) !== nonce) {
          throw new APIError("UNAUTHORIZED", {
            code: "INVALID_SIWE_BROWSER",
            message: "Invalid sign-in attempt",
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/siwe/nonce" && ctx.path !== "/siwe/get-nonce") return;
        const result = ctx.context.returned as { nonce?: string };
        if (result?.nonce)
          await ctx.setSignedCookie(
            binding.name,
            result.nonce,
            ctx.context.secret,
            binding.attributes,
          );
      }),
    },
    databaseHooks: {
      verification: {
        create: {
          before: async (verification) => {
            if (verification.identifier.startsWith("siwe:")) {
              return { data: { ...verification, expiresAt: new Date(Date.now() + 300000) } };
            }
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await db.user.findUniqueOrThrow({ where: { id: session.userId } });
            if (user.status !== "ACTIVE")
              throw new APIError("FORBIDDEN", {
                code: "ACCOUNT_SUSPENDED",
                message: "Account suspended",
              });
          },
        },
      },
    },
  });
}
