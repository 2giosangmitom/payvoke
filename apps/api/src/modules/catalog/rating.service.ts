import type { Cradle } from "../../container";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../errors";
import { holdOutcomes } from "../stats/hold-outcomes";

export const COMMENT_MAX = 500;
const PAGE = 20;

export type RatingBody = { score: number; comment?: string | null };

// Star ratings of agents. A buyer rates an agent once and may change it. Only
// a buyer with a settled job of the agent can rate: one whose escrow was
// released or refunded, so every rating comes from someone who saw how the
// job ended, not just paid for it. Owners never rate their own.
export class RatingService {
  private readonly db: Cradle["db"];
  private readonly profileService: Cradle["profileService"];

  constructor({ db, profileService }: Cradle) {
    this.db = db;
    this.profileService = profileService;
  }

  private async app(appId: string, viewerId: string | null) {
    const app = await this.db.app.findFirst({
      where: {
        id: appId,
        archivedAt: null,
        OR: [{ visibility: "PUBLIC" }, ...(viewerId ? [{ ownerId: viewerId }] : [])],
      },
      select: { id: true, ownerId: true },
    });
    if (!app) throw new NotFoundError("APP_NOT_FOUND");
    return app;
  }

  // Each buyer's paid and settled jobs of the app, keyed by buyer id.
  private async jobs(buyerIds: string[], appId: string) {
    const rows = buyerIds.length
      ? await this.db.invocation.findMany({
          where: { buyerId: { in: buyerIds }, quote: { appId }, settlement: { state: "HELD" } },
          select: { buyerId: true, settlement: { select: { invocationKey: true } } },
        })
      : [];
    const outcome = await holdOutcomes(
      this.db,
      rows.flatMap((row) => row.settlement?.invocationKey ?? []),
    );
    const jobs = new Map(buyerIds.map((id) => [id, { paid: 0, finished: 0 }]));
    for (const row of rows) {
      const entry = jobs.get(row.buyerId)!;
      entry.paid++;
      if (row.settlement && outcome(row.settlement.invocationKey) !== "held") entry.finished++;
    }
    return jobs;
  }

  // Why the viewer may not rate, or null when they may.
  private async blocker(viewerId: string | null, app: { id: string; ownerId: string }) {
    if (!viewerId) return "SIGN_IN";
    if (viewerId === app.ownerId) return "OWN_APP";
    const jobs = (await this.jobs([viewerId], app.id)).get(viewerId)!;
    if (jobs.finished) return null;
    return jobs.paid ? "JOB_NOT_FINISHED" : "HIRE_FIRST";
  }

  async list(appId: string, viewerId: string | null) {
    const app = await this.app(appId, viewerId);
    const [rows, groups, mine, blocker] = await Promise.all([
      this.db.appRating.findMany({
        where: { appId },
        orderBy: { updatedAt: "desc" },
        take: PAGE,
      }),
      this.db.appRating.groupBy({ by: ["score"], where: { appId }, _count: { _all: true } }),
      viewerId
        ? this.db.appRating.findUnique({ where: { userId_appId: { userId: viewerId, appId } } })
        : null,
      this.blocker(viewerId, app),
    ]);
    const [people, jobs] = await Promise.all([
      this.profileService.people(rows.map((row) => row.userId)),
      this.jobs(
        rows.map((row) => row.userId),
        appId,
      ),
    ]);
    // Count of each score, index 0 for one star.
    const distribution = [1, 2, 3, 4, 5].map(
      (score) => groups.find((group) => group.score === score)?._count._all ?? 0,
    );
    const count = distribution.reduce((sum, value) => sum + value, 0);
    const total = distribution.reduce((sum, value, index) => sum + value * (index + 1), 0);
    return {
      average: count ? Math.round((total / count) * 10) / 10 : null,
      count,
      distribution,
      items: rows.map((row) => ({
        score: row.score,
        comment: row.comment,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        author: people.get(row.userId)!,
        // Settled jobs behind the rating, shown as "Hired 3x".
        finishedJobs: jobs.get(row.userId)?.finished ?? 0,
        mine: row.userId === viewerId,
      })),
      mine: mine ? { score: mine.score, comment: mine.comment } : null,
      canRate: blocker === null,
      // SIGN_IN | OWN_APP | HIRE_FIRST | JOB_NOT_FINISHED, or null.
      reason: blocker,
    };
  }

  async rate(userId: string, appId: string, body: RatingBody) {
    const app = await this.app(appId, userId);
    if (!Number.isInteger(body.score) || body.score < 1 || body.score > 5)
      throw new BadRequestError("INVALID_RATING");
    const comment = body.comment?.trim() || null;
    if (comment && comment.length > COMMENT_MAX) throw new BadRequestError("INVALID_RATING");
    const blocker = await this.blocker(userId, app);
    if (blocker === "OWN_APP") throw new ForbiddenError("CANNOT_RATE_OWN_APP");
    if (blocker) throw new ForbiddenError("RATING_REQUIRES_JOB");
    await this.db.appRating.upsert({
      where: { userId_appId: { userId, appId } },
      create: { userId, appId, score: body.score, comment },
      update: { score: body.score, comment },
    });
    return this.list(appId, userId);
  }

  async remove(userId: string, appId: string) {
    const app = await this.app(appId, userId);
    await this.db.appRating.deleteMany({ where: { userId, appId: app.id } });
    return this.list(appId, userId);
  }
}
