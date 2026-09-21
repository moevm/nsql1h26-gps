import { Elysia, t } from "elysia";
import { format, startOfWeek, subDays } from "date-fns";
import { AppError } from "../../../common/errors";
import { db } from "../../../common/db";

const querySchema = t.Object({
  period: t.Optional(t.Union([t.Literal("today"), t.Literal("week"), t.Literal("month"), t.Literal("custom")])),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
  groupBy: t.Optional(t.Union([t.Literal("day"), t.Literal("hour"), t.Literal("week")])),
});

function periodRange(
  period: string | undefined,
  from?: string,
  to?: string,
): { from: string; to: string } {
  const now = new Date();
  const end = to ? new Date(to) : now;
  if (period === "custom") {
    if (!from) throw new AppError(400, "INVALID_PERIOD", "custom period requires from");
    if (Number.isNaN(Date.parse(from)) || Number.isNaN(end.getTime()))
      throw new AppError(400, "INVALID_PERIOD", "bad date range");
    return { from: new Date(from).toISOString(), to: end.toISOString() };
  }
  const days = period === "today" ? 1 : period === "month" ? 30 : 7;
  return { from: subDays(now, days).toISOString(), to: end.toISOString() };
}

function bucket(iso: string, groupBy: "day" | "hour" | "week"): string {
  const d = new Date(iso);
  if (groupBy === "hour") return format(d, "yyyy-MM-dd'T'HH");
  if (groupBy === "week") return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
  return format(d, "yyyy-MM-dd");
}

export const adminStatsModule = new Elysia({ name: "admin-stats" })
    .get(
  "/admin/stats",
  async ({ query }) => {
    const { from, to } = periodRange(query.period, query.from, query.to);
    const groupBy = query.groupBy ?? "day";
    const p = { from, to };

    const [totalUsers, newUsers, activeUsers, completedQuests, dbState, seriesRows, questStatus, entityTypes] =
      await Promise.all([
        db.run(`MATCH (u:USER) RETURN count(u) AS c`),
        db.run(`MATCH (u:USER) WHERE u.created_at >= $from AND u.created_at <= $to RETURN count(u) AS c`, p),
        db.run(
          `MATCH (e:EVENT_LOG) WHERE e.timestamp >= $from AND e.timestamp <= $to AND e.user_id IS NOT NULL
           RETURN count(DISTINCT e.user_id) AS c`,
          p,
        ),
        db.run(
          `MATCH (:USER)-[r:HAS_QUEST]->(:QUEST) WHERE r.status = 'COMPLETED'
           AND r.completed_at >= $from AND r.completed_at <= $to RETURN count(r) AS c`,
          p,
        ),
        db.run(`MATCH (n) RETURN count(n) AS nodes`).then((r) =>
          db.run(`MATCH ()-[rel]->() RETURN count(rel) AS rels`).then((r2) => ({
            nodes: r[0]!.nodes,
            relationships: r2[0]!.rels,
          })),
        ),
        db.run(
          `MATCH (u:USER) WHERE u.created_at >= $from AND u.created_at <= $to
           RETURN u.created_at AS createdAt ORDER BY createdAt`,
          p,
        ),
        db.run(`MATCH (:USER)-[r:HAS_QUEST]->(:QUEST) RETURN r.status AS status, count(r) AS c`),
        db.run(`MATCH (e:EVENT_LOG) RETURN e.entity_type AS entityType, count(e) AS c`),
      ]);

    const seriesMap = new Map<string, number>();
    for (const row of seriesRows) {
      const b = bucket(row.createdAt as string, groupBy);
      seriesMap.set(b, (seriesMap.get(b) ?? 0) + 1);
    }
    const series = [...seriesMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([bucket, count]) => ({ bucket, count }));

    return {
      period: { from, to, groupBy },
      totals: {
        totalUsers: totalUsers[0]!.c,
        newUsers: newUsers[0]!.c,
        activeUsers: activeUsers[0]!.c,
        completedQuests: completedQuests[0]!.c,
      },
      database: dbState,
      series,
      questStatus,
      entityTypes,
    };
  },
  { query: querySchema },
);
