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

const QUEST_STATUSES = ["COMPLETED", "IN_PROGRESS", "NOT_ACCEPTED"] as const;

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

    const [totalUsers, newUsers, activeUsers, completedQuests, dbState, seriesRows, activeRows, questStatusRows, entityTypes] =
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
        db.run(
          `MATCH (e:EVENT_LOG) WHERE e.timestamp >= $from AND e.timestamp <= $to AND e.user_id IS NOT NULL
           RETURN e.timestamp AS ts, e.user_id AS uid`,
          p,
        ),
        Promise.all([
          db.run(
            `MATCH (:USER)-[r:HAS_QUEST]->(:QUEST) WHERE r.status = 'COMPLETED'
             AND r.completed_at >= $from AND r.completed_at <= $to
             RETURN 'COMPLETED' AS status, count(r) AS c`,
            p,
          ),
          db.run(
            `MATCH (:USER)-[r:HAS_QUEST]->(:QUEST) WHERE r.status = 'IN_PROGRESS'
             AND r.started_at >= $from AND r.started_at <= $to
             RETURN 'IN_PROGRESS' AS status, count(r) AS c`,
            p,
          ),
          db.run(
            `MATCH (q:QUEST) WHERE q.created_at >= $from AND q.created_at <= $to
             AND NOT EXISTS { (:USER)-[:HAS_QUEST]->(q) }
             RETURN 'NOT_ACCEPTED' AS status, count(q) AS c`,
            p,
          ),
        ]).then((rows) => rows.map((r, i) => r[0] ?? { status: QUEST_STATUSES[i], c: 0 })),
        db.run(
          `MATCH (e:EVENT_LOG) WHERE e.timestamp >= $from AND e.timestamp <= $to
           RETURN e.entity_type AS entityType, count(e) AS c`,
          p,
        ),
      ]);

    const seriesMap = new Map<string, number>();
    for (const row of seriesRows) {
      const b = bucket(row.createdAt as string, groupBy);
      seriesMap.set(b, (seriesMap.get(b) ?? 0) + 1);
    }
    const series = [...seriesMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([bucket, count]) => ({ bucket, count }));

    const activeMap = new Map<string, Set<number>>();
    for (const row of activeRows) {
      const b = bucket(row.ts as string, "day");
      if (!activeMap.has(b)) activeMap.set(b, new Set());
      activeMap.get(b)!.add(row.uid as number);
    }
    const activeSeries = [...activeMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, users]) => ({ bucket, count: users.size }));

    const questCounts = new Map(questStatusRows.map((r) => [r.status as string, r.c as number]));
    const questStatus = QUEST_STATUSES.map((status) => ({
      status,
      c: questCounts.get(status) ?? 0,
    }));

    return {
      period: { from, to, groupBy },
      totals: {
        totalUsers: totalUsers[0]?.c ?? 0,
        newUsers: newUsers[0]?.c ?? 0,
        activeUsers: activeUsers[0]?.c ?? 0,
        completedQuests: completedQuests[0]?.c ?? 0,
      },
      database: dbState,
      series,
      activeSeries,
      questStatus,
      entityTypes,
    };
  },
  { query: querySchema },
);
