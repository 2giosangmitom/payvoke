import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../http/context";
import { maxBody, rateLimit } from "../../http/limits";
import { validate } from "../../http/validate";
import { requireAccount } from "../auth/guard";

const listQuery = z.object({
  q: z.string().max(100).optional(),
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  // "1" lists only the viewer's starred apps.
  saved: z.string().optional(),
  // A developer's user id: only their agents.
  owner: z.string().max(128).optional(),
});

const ratingBody = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).nullable().optional(),
});

const viewer = (c: { var: AppEnv["Variables"]; req: { raw: Request } }) =>
  c.var.cradle.authService.optionalAccount(c.req.raw.headers);

export const catalogRoutes = new Hono<AppEnv>()
  .get("/v1/apps", validate("query", listQuery, "INVALID_CATALOG_QUERY"), async (c) => {
    const { q, cursor, limit, saved, owner } = c.req.valid("query");
    const account = await viewer(c);
    return c.json(
      await c.var.cradle.catalogService.list({
        q,
        cursor,
        limit,
        savedBy: saved === "1" ? account?.id : undefined,
        ownerId: owner,
      }),
    );
  })
  .get("/v1/apps/:appId", async (c) => {
    const account = await viewer(c);
    return c.json(await c.var.cradle.catalogService.get(c.req.param("appId"), account?.id ?? null));
  })
  // Redirects to a short-lived signed URL; the versioned path is cacheable.
  .get("/v1/apps/:appId/image", async (c) => {
    const account = await viewer(c);
    const target = await c.var.cradle.catalogService.image(
      c.req.param("appId"),
      account?.id ?? null,
    );
    c.header("Cache-Control", "private, max-age=300");
    return c.redirect(target.url, 302);
  })
  .get("/v1/apps/:appId/commands", async (c) => {
    const account = await viewer(c);
    return c.json(
      await c.var.cradle.catalogService.commands(c.req.param("appId"), account?.id ?? null),
    );
  })
  .get("/v1/apps/:appId/ratings", async (c) => {
    const account = await viewer(c);
    return c.json(
      await c.var.cradle.ratingService.list(c.req.param("appId"), account?.id ?? null),
    );
  })
  .put(
    "/v1/apps/:appId/rating",
    rateLimit("ratings", 20),
    maxBody(4096),
    validate("json", ratingBody, "INVALID_RATING"),
    requireAccount,
    async (c) =>
      c.json(
        await c.var.cradle.ratingService.rate(
          c.var.account.id,
          c.req.param("appId"),
          c.req.valid("json"),
        ),
      ),
  )
  .delete("/v1/apps/:appId/rating", requireAccount, async (c) =>
    c.json(await c.var.cradle.ratingService.remove(c.var.account.id, c.req.param("appId"))),
  )
  .get("/v1/stars", requireAccount, async (c) =>
    c.json(await c.var.cradle.catalogService.stars(c.var.account.id)),
  )
  .put("/v1/apps/:appId/star", requireAccount, async (c) =>
    c.json(await c.var.cradle.catalogService.star(c.var.account.id, c.req.param("appId"))),
  )
  .delete("/v1/apps/:appId/star", requireAccount, async (c) =>
    c.json(await c.var.cradle.catalogService.unstar(c.var.account.id, c.req.param("appId"))),
  );
