import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../http/context";
import { maxBody, rateLimit } from "../../http/limits";
import { validate } from "../../http/validate";
import { requireAccount } from "./guard";

const DAY_MS = 24 * 60 * 60 * 1000;

const newTokenBody = z
  .object({
    name: z.string().trim().min(1).max(64),
    expiresInDays: z.number().int().min(1).max(365).default(90),
    // A vault grant the buyer registered for this token's agent to sign with.
    autopay: z
      .object({
        grantId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
        buyer: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        signer: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      })
      .strict()
      .optional(),
  })
  .strict();

// Buyer access tokens for MCP hosts. Session only: the origin guard refuses a
// token on these paths, so a token can never mint or revoke tokens.
export const accessTokenRoutes = new Hono<AppEnv>()
  .get("/v1/access-tokens", requireAccount, async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(await c.var.cradle.accessTokenService.list(c.var.account.id));
  })
  .post(
    "/v1/access-tokens",
    rateLimit("access-tokens", 10),
    maxBody(1024),
    validate("json", newTokenBody, "INVALID_ACCESS_TOKEN_REQUEST"),
    requireAccount,
    async (c) => {
      const { name, expiresInDays, autopay } = c.req.valid("json");
      c.header("Cache-Control", "no-store");
      return c.json(
        await c.var.cradle.accessTokenService.issue(
          c.var.account.id,
          {
            name,
            expiresAt: new Date(Date.now() + expiresInDays * DAY_MS),
          },
          autopay,
        ),
        201,
      );
    },
  )
  .delete("/v1/access-tokens/:id", requireAccount, async (c) =>
    c.json(await c.var.cradle.accessTokenService.revoke(c.var.account.id, c.req.param("id"))),
  );
