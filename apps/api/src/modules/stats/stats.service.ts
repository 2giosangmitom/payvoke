import type { QuoteDocument } from "@payvoke/shared/x402";
import type { Cradle } from "../../container";
import { imageUrl } from "../apps/serializers";
import { holdOutcomes } from "./hold-outcomes";

// Days a series covers, ending today (UTC).
export const SERIES_DAYS = 30;
// Bound on the jobs one account's figures are computed from.
const JOB_LIMIT = 5000;

export type Usage = {
  // Paid jobs whose payment the vault held.
  jobs: number;
  // Distinct buyers who opened a chat with the agent.
  users: number;
  rating: { average: number | null; count: number };
};

type Money = Record<"held" | "released" | "refunded", string>;
type Day = { date: string; amount: string; jobs: number };

type JobRow = {
  createdAt: Date;
  quote: { appId: string; document: unknown };
  settlement: { state: string; invocationKey: string } | null;
};

const emptyUsage = (): Usage => ({ jobs: 0, users: 0, rating: { average: null, count: 0 } });
const day = (date: Date) => date.toISOString().slice(0, 10);

// The last SERIES_DAYS dates, oldest first.
function days(now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: SERIES_DAYS }, (_, index) =>
    day(new Date(today - (SERIES_DAYS - 1 - index) * 86_400_000)),
  );
}

// Usage numbers and money for the store, Studio and the console. Money is in
// atomic USDC strings. A provider's share is the gross amount less the fee.
export class StatsService {
  private readonly db: Cradle["db"];

  constructor({ db }: Cradle) {
    this.db = db;
  }

  /** Jobs, users and rating of each agent, keyed by app id. */
  async usage(appIds: string[]): Promise<Map<string, Usage>> {
    const ids = [...new Set(appIds)];
    const result = new Map(ids.map((id) => [id, emptyUsage()]));
    if (!ids.length) return result;
    const [jobs, buyers, ratings] = await Promise.all([
      this.db.quote.groupBy({
        by: ["appId"],
        where: { appId: { in: ids }, invocation: { settlement: { state: "HELD" } } },
        _count: { _all: true },
      }),
      this.db.chatThread.groupBy({ by: ["appId", "buyerId"], where: { appId: { in: ids } } }),
      this.db.appRating.groupBy({
        by: ["appId"],
        where: { appId: { in: ids } },
        _avg: { score: true },
        _count: { _all: true },
      }),
    ]);
    for (const row of jobs) result.get(row.appId)!.jobs = row._count._all;
    for (const row of buyers) result.get(row.appId)!.users += 1;
    for (const row of ratings)
      result.get(row.appId)!.rating = {
        average: row._avg.score === null ? null : Math.round(row._avg.score * 10) / 10,
        count: row._count._all,
      };
    return result;
  }

  // Where each job's money stands, from the hold's finalized projection.
  private async classify(rows: JobRow[]) {
    const outcome = await holdOutcomes(
      this.db,
      rows.flatMap((row) => row.settlement?.invocationKey ?? []),
    );
    return rows.flatMap((row) => {
      const settlement = row.settlement;
      if (settlement?.state !== "HELD") return [];
      const bucket: keyof Money = outcome(settlement.invocationKey);
      const document = row.quote.document as QuoteDocument;
      const gross = BigInt(document.grossAmount);
      return [{ row, bucket, gross, net: gross - (gross * BigInt(document.feeBps)) / 10_000n }];
    });
  }

  private jobs(where: object) {
    return this.db.invocation.findMany({
      where: { ...where, settlement: { state: "HELD" } },
      select: {
        createdAt: true,
        quote: { select: { appId: true, document: true } },
        settlement: { select: { state: true, invocationKey: true } },
      },
      orderBy: { createdAt: "desc" },
      take: JOB_LIMIT,
    });
  }

  // Daily totals of jobs that were not refunded, by the day they were paid.
  private series(jobs: { row: JobRow; bucket: keyof Money; value: bigint }[]): Day[] {
    const totals = new Map(days().map((date) => [date, { amount: 0n, jobs: 0 }]));
    for (const job of jobs) {
      if (job.bucket === "refunded") continue;
      const entry = totals.get(day(job.row.createdAt));
      if (!entry) continue;
      entry.amount += job.value;
      entry.jobs += 1;
    }
    return [...totals].map(([date, entry]) => ({
      date,
      amount: entry.amount.toString(),
      jobs: entry.jobs,
    }));
  }

  private money(jobs: { bucket: keyof Money; value: bigint }[]): Money {
    const totals = { held: 0n, released: 0n, refunded: 0n };
    for (const job of jobs) totals[job.bucket] += job.value;
    return {
      held: totals.held.toString(),
      released: totals.released.toString(),
      refunded: totals.refunded.toString(),
    };
  }

  /** What an account spent as a buyer and earned as a builder. */
  async account(accountId: string) {
    const [bought, apps] = await Promise.all([
      this.jobs({ buyerId: accountId }),
      this.db.app.findMany({
        where: { ownerId: accountId, archivedAt: null },
        select: { id: true, name: true, imageKey: true, visibility: true, status: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const spent = (await this.classify(bought)).map((job) => ({ ...job, value: job.gross }));
    const appNames = new Map<string, string>();
    const spendByApp = new Map<string, bigint>();
    for (const job of spent)
      if (job.bucket !== "refunded")
        spendByApp.set(
          job.row.quote.appId,
          (spendByApp.get(job.row.quote.appId) ?? 0n) + job.gross,
        );
    if (spendByApp.size) {
      const rows = await this.db.app.findMany({
        where: { id: { in: [...spendByApp.keys()] } },
        select: { id: true, name: true },
      });
      for (const row of rows) appNames.set(row.id, row.name);
    }
    const buyer = {
      ...this.money(spent),
      jobs: spent.length,
      series: this.series(spent),
      topApps: [...spendByApp]
        .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
        .slice(0, 5)
        .map(([id, amount]) => ({
          id,
          name: appNames.get(id) ?? "Agent",
          amount: amount.toString(),
        })),
    };
    if (!apps.length) return { buyer, provider: null };

    const ids = apps.map((app) => app.id);
    const [sold, usage] = await Promise.all([
      this.jobs({ quote: { appId: { in: ids } } }),
      this.usage(ids),
    ]);
    const earned = (await this.classify(sold)).map((job) => ({ ...job, value: job.net }));
    return {
      buyer,
      provider: {
        ...this.money(earned),
        jobs: earned.length,
        users: [...usage.values()].reduce((sum, item) => sum + item.users, 0),
        series: this.series(earned),
        apps: apps.map((app) => {
          const own = earned.filter((job) => job.row.quote.appId === app.id);
          return {
            id: app.id,
            name: app.name,
            imageUrl: imageUrl(app),
            visibility: app.visibility,
            status: app.status,
            ...usage.get(app.id)!,
            ...this.money(own),
            series: this.series(own),
          };
        }),
      },
    };
  }
}
