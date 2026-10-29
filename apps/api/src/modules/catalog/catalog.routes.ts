import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../http/context";
import { validate } from "../../http/validate";
import { requireAccount } from "../auth/guard";

const listQuery = z.object({
  q: z.string().max(100).optional(),
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  // "1" lists only the viewer's starred apps.
  saved: z.string().optional(),
});

const viewer = (c: { var: AppEnv["Variables"]; req: { raw: Request } }) =>
  c.var.cradle.authService.optionalAccount(c.req.raw.headers);

export const catalogRoutes = new Hono<AppEnv>()
  .get("/v1/apps", validate("query", listQuery, "INVALID_CATALOG_QUERY"), async (c) => {
    const { q, cursor, limit, saved } = c.req.valid("query");
    const account = await viewer(c);
    return c.json(
      await c.var.cradle.catalogService.list({
        q,
        cursor,
        limit,
        savedBy: saved === "1" ? account?.id : undefined,
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
  .get("/v1/stars", requireAccount, async (c) =>
    c.json(await c.var.cradle.catalogService.stars(c.var.account.id)),
  )
  .put("/v1/apps/:appId/star", requireAccount, async (c) =>
    c.json(await c.var.cradle.catalogService.star(c.var.account.id, c.req.param("appId"))),
  )
  .delete("/v1/apps/:appId/star", requireAccount, async (c) =>
    c.json(await c.var.cradle.catalogService.unstar(c.var.account.id, c.req.param("appId"))),
  );
