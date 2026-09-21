import { Elysia, t } from "elysia";
import { AppError } from "../../../common/errors";
import { db } from "../../../common/db";
import { nextId } from "../../../common/ids";
import { logEvent } from "../../../common/log";
import { ENTITY_CONFIGS } from "../../../common/cypher/entity-configs";
import { makeAdminListRoutes } from "../../../common/cypher/list-route";
import { triggerRuleSchema, validateTriggerRules } from "../../quests/triggers";

const DETAIL = `
  MATCH (q:QUEST {id: $id})
  OPTIONAL MATCH (q)-[:DEPENDS_ON]->(d:QUEST)
  OPTIONAL MATCH (e:EVENT_LOG {entity_id: q.id, entity_type: 'Quest'})
  RETURN q {.*},
         collect(DISTINCT CASE WHEN d IS NULL THEN NULL ELSE {id: d.id, name: d.name} END) AS dependsOn,
         collect(DISTINCT CASE WHEN e IS NULL THEN NULL
               ELSE {id: e.id, type: e.type, timestamp: e.timestamp, priority: e.priority, description: e.description} END)[..20] AS relatedLogs
`;

const questSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  reward: t.Optional(t.String({ maxLength: 100 })),
  duration: t.Optional(t.String({ maxLength: 50 })),
  trigger_rules: t.Array(triggerRuleSchema),
  note: t.Optional(t.String({ maxLength: 2000 })),
  depends_on: t.Optional(t.Array(t.Number())),
});

export const adminQuestsModule = new Elysia({ name: "admin-quests" })
    .use(
  makeAdminListRoutes({
    prefix: "/admin/quests",
    cfg: ENTITY_CONFIGS.quests,
    detailCypher: DETAIL,
    createSchema: questSchema,
    onCreate: async (client, body) => {
      const rules = validateTriggerRules(body.trigger_rules);
      const now = new Date().toISOString();
      const id = await client.tx(async (tx) => {
        const id = await nextId(tx, "QUEST");
        await tx.run(
          `CREATE (q:QUEST {id: $id, name: $name, description: $desc, reward: $reward, duration: $duration,
                            trigger_rules: $triggerRules, note: $note, created_at: $now, updated_at: $now})
           RETURN q.id AS id`,
          {
            id,
            name: body.name,
            desc: body.description ?? null,
            reward: body.reward ?? null,
            duration: body.duration ?? null,
            triggerRules: JSON.stringify(rules),
            note: body.note ?? null,
            now,
          },
        );
        for (const depId of (body.depends_on as number[] | undefined) ?? []) {
          const dep = await tx.run(`MATCH (d:QUEST {id: $did}) RETURN d.id AS id`, { did: depId });
          if (dep.length === 0) throw new AppError(400, "INVALID_DEPENDENCY", `quest ${depId} not found`);
          await tx.run(
            `MATCH (q:QUEST {id: $id}), (d:QUEST {id: $did}) MERGE (q)-[:DEPENDS_ON]->(d)`,
            { id, did: depId },
          );
        }
        return id;
      });
      await logAdminAction(client, "QUEST_CREATED", "Quest", id, body.name as string, { questId: id });
      return { id, ...body, trigger_rules: rules };
    },
    patchSchema: t.Partial(questSchema) as any,
    onPatch: async (client, id, body) => {
      const now = new Date().toISOString();
      const props: Record<string, unknown> = { updated_at: now };
      if (body.name != null) props.name = body.name;
      if (body.description != null) props.description = body.description;
      if (body.reward != null) props.reward = body.reward;
      if (body.duration != null) props.duration = body.duration;
      if (body.note != null) props.note = body.note;
      if (body.trigger_rules != null) props.trigger_rules = JSON.stringify(validateTriggerRules(body.trigger_rules));
      await client.tx(async (tx) => {
        const rows = await tx.run(`MATCH (q:QUEST {id: $id}) SET q += $props RETURN q.id AS id`, { id, props });
        if (rows.length === 0) throw new AppError(404, "NOT_FOUND", "quest not found");
        if (body.depends_on != null) {
          await tx.run(`MATCH (q:QUEST {id: $id})-[r:DEPENDS_ON]->() DELETE r`, { id });
          for (const depId of body.depends_on as number[]) {
            const dep = await tx.run(`MATCH (d:QUEST {id: $did}) RETURN d.id AS id`, { did: depId });
            if (dep.length === 0) throw new AppError(400, "INVALID_DEPENDENCY", `quest ${depId} not found`);
            await tx.run(`MATCH (q:QUEST {id: $id}), (d:QUEST {id: $did}) MERGE (q)-[:DEPENDS_ON]->(d)`, { id, did: depId });
          }
        }
      });
      await logAdminAction(client, "QUEST_UPDATED", "Quest", id, String(body.name ?? id), { questId: id, changes: Object.keys(body) });
      const rows = await client.run(`MATCH (q:QUEST {id: $id}) RETURN q {.*}`, { id });
      return rows[0]!.q as Record<string, unknown>;
    },
  }),
);

async function logAdminAction(
  client: typeof db,
  type: string,
  entityType: "Quest",
  entityId: number,
  description: string,
  details: Record<string, unknown>,
): Promise<void> {
  await client.tx((tx) =>
    logEvent(tx, {
      type,
      entityId,
      entityType,
      priority: "Medium",
      description,
      details,
    }),
  );
}
