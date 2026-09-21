import { AppError } from "../../common/errors";
import { bus, type GameEvent, type ProgressReport } from "../../common/events";
import { db } from "../../common/db";
import { logEvent } from "../../common/log";
import { evaluate, type TriggerRule, type UserStatsSnapshot } from "./triggers";

export async function loadSnapshot(userId: number): Promise<UserStatsSnapshot> {
  const rows = await db.run(
    `MATCH (u:USER {id: $id})
     OPTIONAL MATCH (u)-[:DISCOVERED]->(p:POI)
     WITH u, collect(DISTINCT p.id) AS poiIds, collect(p.type) AS poiTypes
     OPTIONAL MATCH (u)-[:VISITED]->(c:CELL)
     WITH u, poiIds, poiTypes, count(DISTINCT c) AS cellCount
     OPTIONAL MATCH (u)-[q:HAS_QUEST]->(qst:QUEST) WHERE q.status = 'COMPLETED'
     WITH u, poiIds, poiTypes, cellCount, collect(DISTINCT qst.id) AS completedQuestIds
     OPTIONAL MATCH (u)-[:UNLOCKED]->(a:ACHIEVEMENT)
     RETURN coalesce(u.total_distance_km, 0) AS totalDistanceKm,
            poiIds, poiTypes, cellCount, completedQuestIds,
            collect(DISTINCT a.id) AS unlockedAchievementIds`,
    { id: userId },
  );
  if (rows.length === 0) throw new AppError(401, "USER_NOT_FOUND", "user not found");
  const r = rows[0]!;
  const poiTypeCounts: Record<string, number> = {};
  for (const t of r.poiTypes as (string | null)[]) {
    if (t == null) continue;
    poiTypeCounts[t] = (poiTypeCounts[t] ?? 0) + 1;
  }
  return {
    poiTypeCounts,
    poiIds: (r.poiIds as (number | null)[]).filter((x): x is number => x != null),
    totalDistanceKm: r.totalDistanceKm as number,
    cellCount: r.cellCount as number,
    completedQuestIds: (r.completedQuestIds as (number | null)[]).filter((x): x is number => x != null),
    unlockedAchievementIds: (r.unlockedAchievementIds as (number | null)[]).filter((x): x is number => x != null),
  };
}

export async function evaluateUserQuests(userId: number): Promise<ProgressReport[]> {
  const reports: ProgressReport[] = [];
  const snapshot = await loadSnapshot(userId);

  const quests = await db.run(
    `MATCH (u:USER {id: $id})-[r:HAS_QUEST]->(q:QUEST)
     WHERE r.status = 'IN_PROGRESS'
     RETURN q.id AS id, q.name AS name, q.reward AS reward, q.trigger_rules AS trigger_rules`,
    { id: userId },
  );

  for (const q of quests) {
    const questId = q.id as number;
    const name = q.name as string;
    const reward = q.reward as string;
    const rules = JSON.parse(q.trigger_rules as string) as TriggerRule[];
    const res = evaluate(rules, snapshot);

    if (res.satisfied) {
      const completed = await db.tx(async (tx) => {
        const rows = await tx.run(
          `MATCH (u:USER {id: $uid})-[r:HAS_QUEST]->(q:QUEST {id: $qid})
           WHERE r.status = 'IN_PROGRESS'
           SET r.status = 'COMPLETED', r.progress = $progress, r.completed_at = $now,
               u.exp = coalesce(u.exp, 0) + 100
           RETURN u.exp AS exp`,
          { uid: userId, qid: questId, progress: res.progress, now: new Date().toISOString() },
        );
        if (rows.length === 0) return false;
        await logEvent(tx, {
          type: "QUEST_COMPLETED",
          userId: userId,
          entityId: questId,
          entityType: "Quest",
          priority: "Medium",
          description: `User ${userId} completed quest ${name}`,
          details: { questId, questName: name, reward },
        });
        return true;
      });
      if (!completed) continue;

      reports.push({ kind: "quest_completed", questId, name, reward });
      const chained = await bus.emit([{ type: "quest:completed", userId: userId, questId, questName: name }]);
      reports.push(...chained);
    } else {
      await db.run(
        `MATCH (u:USER {id: $uid})-[r:HAS_QUEST]->(q:QUEST {id: $qid}) SET r.progress = $progress`,
        { uid: userId, qid: questId, progress: res.progress },
      );
      reports.push({ kind: "quest_progress", questId, name, status: "IN_PROGRESS", progress: res.progress });
    }
  }
  return reports;
}

export function registerQuestHandlers(): void {
  const handler = (e: GameEvent) => evaluateUserQuests(e.userId);
  bus.on("user:visited_cell", handler);
  bus.on("user:discovered_poi", handler);
  bus.on("quest:completed", handler);
  bus.on("achievement:unlocked", handler);
}
