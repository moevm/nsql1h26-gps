import { Elysia, t } from "elysia";
import { AppError } from "../../common/errors";
import { db } from "../../common/db";
import { logEvent } from "../../common/log";
import { authPlugin } from "../../plugins/auth";
import { toDto } from "../../common/cypher/list-route";
import { evaluateUserQuests, registerQuestHandlers } from "./handlers";

export const questsModule = new Elysia({ name: "quests" })
  .use(authPlugin)
  .get("/quests", async ({ auth }) => {
    const rows = await db.run(
      `MATCH (q:QUEST)
       OPTIONAL MATCH (u:USER {id: $id})-[r:HAS_QUEST]->(q)
       WITH q, r
       WHERE r IS NULL OR r.status = 'IN_PROGRESS'
       RETURN q {.*, status: coalesce(r.status, 'AVAILABLE'), progress: r.progress, startedAt: r.started_at}
       ORDER BY q.id`,
      { id: auth!.userId },
    );
    return rows.map(toDto);
  })
  .post(
    "/quests/:id/accept",
    async ({ params, auth }) => {
      const questId = Number(params.id);
      await db.tx(async (tx) => {
        const q = await tx.run(`MATCH (q:QUEST {id: $qid}) RETURN q.id AS id, q.name AS name`, { qid: questId });
        if (q.length === 0) throw new AppError(404, "NOT_FOUND", "quest not found");
        const questName = q[0]!.name as string;

        const deps = await tx.run(`MATCH (q:QUEST {id: $qid})-[:DEPENDS_ON]->(d:QUEST) RETURN d.id AS id`, { qid: questId });
        for (const dep of deps) {
          const done = await tx.run(
            `MATCH (u:USER {id: $uid})-[rd:HAS_QUEST]->(dq:QUEST {id: $did})
             WHERE rd.status = 'COMPLETED' RETURN 1 AS ok`,
            { uid: auth!.userId, did: dep.id },
          );
          if (done.length === 0) throw new AppError(409, "PREREQUISITES_NOT_MET", `quest depends on quest ${dep.id}`);
        }

        const existing = await tx.run(
          `MATCH (u:USER {id: $uid})-[r:HAS_QUEST]->(q:QUEST {id: $qid}) RETURN r.status AS status`,
          { uid: auth!.userId, qid: questId },
        );
        const status = existing[0]?.status as string | undefined;
        if (status === "COMPLETED") throw new AppError(409, "ALREADY_COMPLETED", "quest already completed");
        if (status === "IN_PROGRESS") return; 

        await tx.run(
          `MATCH (u:USER {id: $uid}), (q:QUEST {id: $qid})
           MERGE (u)-[r:HAS_QUEST]->(q)
           ON CREATE SET r.status = 'IN_PROGRESS', r.progress = '0', r.started_at = $now`,
          { uid: auth!.userId, qid: questId, now: new Date().toISOString() },
        );
        await logEvent(tx, {
          type: "QUEST_ACCEPTED",
          userId: auth!.userId,
          entityId: questId,
          entityType: "Quest",
          priority: "Low",
          description: `User ${auth!.userId} accepted quest ${questName}`,
          details: { questId, questName },
        });
      });

      const reports = await evaluateUserQuests(auth!.userId);
      return {
        ok: true,
        quests: reports
          .filter((r) => r.kind === "quest_progress" || r.kind === "quest_completed")
          .map((r) => ({
            questId: (r as { questId: number }).questId,
            name: r.name,
            status: r.kind === "quest_completed" ? "COMPLETED" : "IN_PROGRESS",
            progress: r.kind === "quest_progress" ? (r as { progress: string }).progress : null,
          })),
        achievements: reports
          .filter((r) => r.kind === "achievement_unlocked")
          .map((r) => ({ achievementId: (r as { achievementId: number }).achievementId, name: r.name })),
      };
    },
    { params: t.Object({ id: t.Numeric() }) },
  )
  .delete(
    "/quests/:id/accept",
    async ({ params, auth }) => {
      const rows = await db.run(
        `MATCH (u:USER {id: $uid})-[r:HAS_QUEST]->(q:QUEST {id: $qid})
         WHERE r.status = 'IN_PROGRESS'
         DELETE r
         RETURN 1 AS ok`,
        { uid: auth!.userId, qid: Number(params.id) },
      );
      if (rows.length === 0) throw new AppError(409, "NOT_IN_PROGRESS", "quest is not in progress");
      return { ok: true };
    },
    { params: t.Object({ id: t.Numeric() }) },
  );

export function registerQuestModuleHandlers(): void {
  registerQuestHandlers();
}
