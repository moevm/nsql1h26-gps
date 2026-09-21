import { bus, type GameEvent, type ProgressReport } from "../../common/events";
import { db } from "../../common/db";
import { logEvent } from "../../common/log";
import { evaluate, type TriggerRule, type UserStatsSnapshot } from "../quests/triggers";
import { loadSnapshot } from "../quests/handlers";

interface AchievementRow {
  id: number;
  name: string;
  reward: string;
  trigger_rules: string;
  requiredQuestIds: (number | null)[];
}

async function loadAchievements(): Promise<AchievementRow[]> {
  const rows = await db.run(
    `MATCH (a:ACHIEVEMENT)
     OPTIONAL MATCH (a)-[:REQUIRES_QUEST]->(q:QUEST)
     RETURN a.id AS id, a.name AS name, a.reward AS reward, a.trigger_rules AS trigger_rules,
            collect(DISTINCT q.id) AS requiredQuestIds`,
  );
  return rows as unknown as AchievementRow[];
}

function eligible(a: AchievementRow, s: UserStatsSnapshot): boolean {
  const rules = JSON.parse(a.trigger_rules) as TriggerRule[];
  if (!evaluate(rules, s).satisfied) return false;
  return a.requiredQuestIds.every((qid) => qid == null || s.completedQuestIds.includes(qid));
}

async function achievementHandler(e: GameEvent): Promise<ProgressReport[]> {
  const reports: ProgressReport[] = [];
  const snapshot = await loadSnapshot(e.userId);
  const achievements = await loadAchievements();

  for (const a of achievements) {
    if (snapshot.unlockedAchievementIds.includes(a.id)) continue;
    if (!eligible(a, snapshot)) continue;

    const created = await db.tx(async (tx) => {
      const now = new Date().toISOString();
      const rows = await tx.run(
        `MATCH (u:USER {id: $uid}), (a:ACHIEVEMENT {id: $aid})
         MERGE (u)-[ul:UNLOCKED]->(a)
         ON CREATE SET ul.unlocked_at = $now, u.exp = coalesce(u.exp, 0) + 50
         RETURN ul.unlocked_at = $now AS isNew`,
        { uid: e.userId, aid: a.id, now },
      );

      if (rows[0]?.isNew !== true) return false;

      await logEvent(tx, {
        type: "ACHIEVEMENT_UNLOCKED",
        userId: e.userId,
        entityId: a.id,
        entityType: "Achievement",
        priority: "Medium",
        description: `User ${e.userId} unlocked achievement ${a.name}`,
        details: { achievementId: a.id, achievementName: a.name },
      });
      return true;
    });
    if (!created) continue;

    reports.push({ kind: "achievement_unlocked", achievementId: a.id, name: a.name });
    const chained = await bus.emit([{ type: "achievement:unlocked", userId: e.userId, achievementId: a.id, achievementName: a.name }]);
    reports.push(...chained);
  }
  return reports;
}

export function registerAchievementHandlers(): void {
  bus.on("user:visited_cell", achievementHandler);
  bus.on("user:discovered_poi", achievementHandler);
  bus.on("quest:completed", achievementHandler);
  bus.on("achievement:unlocked", achievementHandler);
}
