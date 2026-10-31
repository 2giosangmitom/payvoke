import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../http/context";
import { noStore } from "../../http/financial-json";
import { maxBody, rateLimit } from "../../http/limits";
import { validate } from "../../http/validate";
import { requireAccount } from "../auth/guard";
import { IMAGE_MAX_BYTES } from "../provider/provider.validation";
import { BIO_MAX, NAME_MAX } from "./profile.service";

const profilePatch = z.object({
  displayName: z.string().max(NAME_MAX).nullable().optional(),
  bio: z.string().max(BIO_MAX).nullable().optional(),
});

// The signed-in account's profile, public developer pages, and the account's
// own usage and earnings figures.
export const peopleRoutes = new Hono<AppEnv>()
  .get("/v1/profile", requireAccount, async (c) =>
    c.json(await c.var.cradle.profileService.me(c.var.account)),
  )
  .patch(
    "/v1/profile",
    maxBody(4096),
    validate("json", profilePatch, "INVALID_PROFILE", {
      displayName: "INVALID_DISPLAY_NAME",
      bio: "INVALID_BIO",
    }),
    requireAccount,
    async (c) => c.json(await c.var.cradle.profileService.update(c.var.account, c.req.valid("json"))),
  )
  // The raw image bytes are the body; the Content-Type names the format.
  .put(
    "/v1/profile/image",
    rateLimit("images", 20),
    maxBody(IMAGE_MAX_BYTES),
    requireAccount,
    async (c) => {
      const type = c.req.header("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      return c.json(await c.var.cradle.profileService.setImage(c.var.account, type, bytes));
    },
  )
  .delete("/v1/profile/image", requireAccount, async (c) =>
    c.json(await c.var.cradle.profileService.removeImage(c.var.account)),
  )
  // Redirects to a short-lived signed URL; the versioned path is cacheable.
  .get("/v1/users/:userId/image", async (c) => {
    const target = await c.var.cradle.profileService.image(c.req.param("userId"));
    c.header("Cache-Control", "public, max-age=300");
    return c.redirect(target.url, 302);
  })
  .get("/v1/developers/:userId", async (c) => {
    const { profileService, catalogService } = c.var.cradle;
    const userId = c.req.param("userId");
    const [developer, apps] = await Promise.all([
      profileService.developer(userId),
      catalogService.list({ ownerId: userId, limit: 50 }),
    ]);
    const rated = apps.items.filter((app) => app.rating.count > 0);
    const ratings = rated.reduce((sum, app) => sum + app.rating.count, 0);
    return c.json({
      ...developer,
      apps: apps.items,
      totals: {
        apps: apps.items.length,
        jobs: apps.items.reduce((sum, app) => sum + app.jobs, 0),
        users: apps.items.reduce((sum, app) => sum + app.users, 0),
        ratings,
        // Average over every rating of every agent, not of the agent averages.
        rating: ratings
          ? Math.round(
              (rated.reduce((sum, app) => sum + app.rating.average! * app.rating.count, 0) /
                ratings) *
                10,
            ) / 10
          : null,
      },
    });
  })
  .get("/v1/stats", noStore, requireAccount, async (c) =>
    c.json(await c.var.cradle.statsService.account(c.var.account.id)),
  );
