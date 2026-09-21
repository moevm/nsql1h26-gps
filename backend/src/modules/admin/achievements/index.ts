import { Elysia, t } from "elysia";
import { authPlugin } from "../../../plugins/auth";
import { AppError } from "../../../common/errors";
import { db } from "../../../common/db";
import { nextId } from "../../../common/ids";
import { logEvent } from "../../../common/log";
import { ENTITY_CONFIGS } from "../../../common/cypher/entity-configs";
import { makeAdminListRoutes } from "../../../common/cypher/list-route";
import { triggerRuleSchema, validateTriggerRules } from "../../quests/triggers";

const DETAIL = `
  MATCH (a:ACHIEVEMENT {id: $id})
  OPTIONAL MATCH (a)-[:REQUIRES_QUEST]->(q:QUEST)
  OPTIONAL MATCH (a)-[:DEPENDS_ON]->(d:ACHIEVEMENT)
  RETURN a {.*},
         collect(DISTINCT CASE WHEN q IS NULL THEN NULL ELSE {id: q.id, name: q.name} END) AS requiresQuest,
         collect(DISTINCT CASE WHEN d IS NULL THEN NULL ELSE {id: d.id, name: d.name} END) AS dependsOn
`;

const achievementSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  reward: t.Optional(t.String({ maxLength: 100 })),
  trigger_rules: t.Array(triggerRuleSchema),
  note: t.Optional(t.String({ maxLength: 2000 })),
  requires_quest: t.Optional(t.Number()),
  depends_on: t.Optional(t.Array(t.Number())),
});

export const adminAchievementsModule = new Elysia({ name: "admin-achievements" })
    .use(
  makeAdminListRoutes({
    prefix: "/admin/achievements",
    cfg: ENTITY_CONFIGS.achievements,
    detailCypher: DETAIL,
    createSchema: achievementSchema,
    onCreate: async (client, body) => {
      const rules = validateTriggerRules(body.trigger_rules);
      const now = new Date().toISOString();
      const id = await client.tx(async (tx) => {
        const id = await nextId(tx, "ACHIEVEMENT");
        await tx.run(
          `CREATE (a:ACHIEVEMENT {id: $id, name: $name, description: $desc, reward: $reward,
                                  trigger_rules: $triggerRules, note: $note, created_at: $now, updated_at: $now})
           RETURN a.id AS id`,
          {
            id,
            name: body.name,
            desc: body.description ?? null,
            reward: body.reward ?? null,
            triggerRules: JSON.stringify(rules),
            note: body.note ?? null,
            now,
          },
        );
        if (body.requires_quest != null) {
          const q = await tx.run(`MATCH (q:QUEST {id: $qid}) RETURN q.id AS id`, { qid: body.requires_quest });
          if (q.length === 0) throw new AppError(400, "INVALID_DEPENDENCY", `quest ${body.requires_quest} not found`);
          await tx.run(
            `MATCH (a:ACHIEVEMENT {id: $id}), (q:QUEST {id: $qid}) MERGE (a)-[:REQUIRES_QUEST]->(q)`,
            { id, qid: body.requires_quest },
          );
        }
        for (const depId of (body.depends_on as number[] | undefined) ?? []) {
          const dep = await tx.run(`MATCH (d:ACHIEVEMENT {id: $did}) RETURN d.id AS id`, { did: depId });
          if (dep.length === 0) throw new AppError(400, "INVALID_DEPENDENCY", `achievement ${depId} not found`);
          await tx.run(
            `MATCH (a:ACHIEVEMENT {id: $id}), (d:ACHIEVEMENT {id: $did}) MERGE (a)-[:DEPENDS_ON]->(d)`,
            { id, did: depId },
          );
        }
        return id;
      });
      await client.tx((tx) =>
        logEvent(tx, {
          type: "ACHIEVEMENT_CREATED",
          entityId: id,
          entityType: "Achievement",
          priority: "Medium",
          description: `Achievement created: ${body.name}`,
          details: { achievementId: id, achievementName: body.name },
        }),
      );
      return { id, ...body, trigger_rules: rules };
    },
    patchSchema: t.Partial(achievementSchema) as any,
    onPatch: async (client, id, body) => {
      const now = new Date().toISOString();
      const props: Record<string, unknown> = { updated_at: now };
      for (const k of ["name", "description", "reward", "note"]) {
        if (body[k] != null) props[k] = body[k];
      }
      if (body.trigger_rules != null) props.trigger_rules = JSON.stringify(validateTriggerRules(body.trigger_rules));
      await client.tx(async (tx) => {
        const rows = await tx.run(`MATCH (a:ACHIEVEMENT {id: $id}) SET a += $props RETURN a.id AS id`, { id, props });
        if (rows.length === 0) throw new AppError(404, "NOT_FOUND", "achievement not found");
        if (body.requires_quest != null) {
          const q = await tx.run(`MATCH (q:QUEST {id: $qid}) RETURN q.id AS id`, { qid: body.requires_quest });
          if (q.length === 0) throw new AppError(400, "INVALID_DEPENDENCY", `quest ${body.requires_quest} not found`);
          await tx.run(`MATCH (a:ACHIEVEMENT {id: $id})-[r:REQUIRES_QUEST]->() DELETE r`, { id });
          await tx.run(
            `MATCH (a:ACHIEVEMENT {id: $id}), (q:QUEST {id: $qid}) MERGE (a)-[:REQUIRES_QUEST]->(q)`,
            { id, qid: body.requires_quest },
          );
        }
        if (body.depends_on != null) {
          await tx.run(`MATCH (a:ACHIEVEMENT {id: $id})-[r:DEPENDS_ON]->() DELETE r`, { id });
          for (const depId of body.depends_on as number[]) {
            const dep = await tx.run(`MATCH (d:ACHIEVEMENT {id: $did}) RETURN d.id AS id`, { did: depId });
            if (dep.length === 0) throw new AppError(400, "INVALID_DEPENDENCY", `achievement ${depId} not found`);
            await tx.run(
              `MATCH (a:ACHIEVEMENT {id: $id}), (d:ACHIEVEMENT {id: $did}) MERGE (a)-[:DEPENDS_ON]->(d)`,
              { id, did: depId },
            );
          }
        }
      });
      await client.tx((tx) =>
        logEvent(tx, {
          type: "ACHIEVEMENT_UPDATED",
          entityId: id,
          entityType: "Achievement",
          priority: "Medium",
          description: `Achievement updated: ${id}`,
          details: { achievementId: id, changes: Object.keys(body) },
        }),
      );
      const rows = await client.run(`MATCH (a:ACHIEVEMENT {id: $id}) RETURN a {.*}`, { id });
      return rows[0]!.a as Record<string, unknown>;
    },
  }),
);
