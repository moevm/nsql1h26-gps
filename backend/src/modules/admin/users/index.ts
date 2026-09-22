import { Elysia, t } from "elysia";
import { authPlugin } from "../../../plugins/auth";
import { AppError } from "../../../common/errors";
import { ENTITY_CONFIGS } from "../../../common/cypher/entity-configs";
import { makeAdminListRoutes } from "../../../common/cypher/list-route";
import { logEvent } from "../../../common/log";
import { db } from "../../../common/db";
import { nextId } from "../../../common/ids";
import { saveAvatar } from "../../../common/avatar-upload";

const userCreateSchema = t.Object({
  username: t.String({ minLength: 3, maxLength: 30 }),
  password: t.String({ minLength: 6, maxLength: 128 }),
  status: t.Optional(t.Union([t.Literal("Active"), t.Literal("Banned")])),
});

const DETAIL = `
  MATCH (u:USER {id: $id})
  OPTIONAL MATCH (u)-[:VISITED]->(c:CELL)
  WITH u, count(DISTINCT c) AS cellsVisited
  OPTIONAL MATCH (u)-[:DISCOVERED]->(p:POI)
  WITH u, cellsVisited, count(DISTINCT p) AS poisDiscovered
  OPTIONAL MATCH (u)-[q:HAS_QUEST]->(quest:QUEST)
  WITH u, cellsVisited, poisDiscovered,
       collect(DISTINCT CASE WHEN quest IS NULL THEN NULL
             ELSE {id: quest.id, name: quest.name, status: q.status, progress: q.progress} END) AS quests
  OPTIONAL MATCH (u)-[:UNLOCKED]->(a:ACHIEVEMENT)
  WITH u, cellsVisited, poisDiscovered, quests,
       collect(DISTINCT CASE WHEN a IS NULL THEN NULL
             ELSE {id: a.id, name: a.name} END) AS achievements
  OPTIONAL MATCH (e:EVENT_LOG {user_id: u.id})
  RETURN u {.*}, cellsVisited, poisDiscovered, quests, achievements,
         collect(DISTINCT CASE WHEN e IS NULL THEN NULL
               ELSE {id: e.id, type: e.type, timestamp: e.timestamp, priority: e.priority, description: e.description} END)[..20] AS recentLogs
`;

export const adminUsersModule = new Elysia({ name: "admin-users" })
    .use(
  makeAdminListRoutes({
    prefix: "/admin/users",
    cfg: ENTITY_CONFIGS.users,
    detailCypher: DETAIL,
    patchSchema: t.Object({
      status: t.Optional(t.Union([t.Literal("Active"), t.Literal("Banned")])),
      note: t.Optional(t.String({ maxLength: 2000 })),
      username: t.Optional(t.String({ minLength: 3, maxLength: 30 })),
    }),
    onPatch: async (db, id, body) => {
      const rows = await db.run(
        `MATCH (u:USER {id: $id}) SET u += $props, u.updated_at = $now RETURN u {.*}`,
        { id, props: body, now: new Date().toISOString() },
      );
      if (rows.length === 0) throw new AppError(404, "NOT_FOUND", "user not found");
      await db.tx((tx) =>
        logEvent(tx, {
          type: "USER_UPDATED",
          userId: id,
          entityId: id,
          entityType: "User",
          priority: "Medium",
          description: `Admin updated user ${id}`,
          details: { changes: body },
        }),
      );
      return rows[0]!;
    },
    createSchema: userCreateSchema,
    onCreate: async (client, body) => {
      const now = new Date().toISOString();
      const password_hash = await Bun.password.hash(body.password as string);
      let created: Record<string, unknown>;
      try {
        created = await client.tx(async (tx) => {
          const id = await nextId(tx, "USER");
          const rows = await tx.run(
            `CREATE (u:USER {id: $id, username: $username, password_hash: $ph})
             SET u.status = $status, u.exp = 0, u.total_distance_km = 0,
                 u.created_at = $now, u.updated_at = $now
             RETURN u {.*}`,
            { id, username: body.username, ph: password_hash, status: body.status ?? "Active", now },
          );
          return rows[0]!.u as Record<string, unknown>;
        });
      } catch (e) {
        if ((e as { code?: string })?.code === "Neo.ClientError.Schema.ConstraintValidationFailed") {
          throw new AppError(409, "USERNAME_TAKEN", "username is already taken");
        }
        throw e;
      }
      await client.tx((tx) =>
        logEvent(tx, {
          type: "USER_CREATED",
          userId: created.id as number,
          entityId: created.id as number,
          entityType: "User",
          priority: "Medium",
          description: `Admin created user ${created.username as string}`,
          details: { userId: created.id, username: created.username },
        }),
      );
      return created;
    },
  }),
)
  .post(
    "/admin/users/:id/avatar",
    async ({ params, body }) => {
      const id = Number(params.id);
      const exists = await db.run(`MATCH (u:USER {id: $id}) RETURN u.id AS id`, { id });
      if (exists.length === 0) throw new AppError(404, "NOT_FOUND", "user not found");
      const filename = await saveAvatar(body.file, id);
      await db.run(`MATCH (u:USER {id: $id}) SET u.avatar = $avatar, u.updated_at = $now`, {
        id,
        avatar: filename,
        now: new Date().toISOString(),
      });
      return { avatar: filename };
    },
    { type: "multipart/form-data", body: t.Object({ file: t.File() }), params: t.Object({ id: t.Numeric() }) },
  )
  .post(
    "/admin/users/:id/quests",
    async ({ params, body }) => {
      const id = Number(params.id);
      const now = new Date().toISOString();
      const rows = await db.tx(async (tx) => {
        const user = await tx.run(`MATCH (u:USER {id: $id}) RETURN u.username AS username`, { id });
        if (user.length === 0) throw new AppError(404, "NOT_FOUND", "user not found");
        const quest = await tx.run(`MATCH (q:QUEST {id: $qid}) RETURN q.name AS name`, { qid: body.questId });
        if (quest.length === 0) throw new AppError(404, "NOT_FOUND", "quest not found");
        const existing = await tx.run(
          `MATCH (u:USER {id: $id})-[r:HAS_QUEST]->(q:QUEST {id: $qid}) RETURN r.status AS status`,
          { id, qid: body.questId },
        );
        if (existing.length > 0) throw new AppError(409, "ALREADY_ASSIGNED", "quest already assigned to user");
        await tx.run(
          `MATCH (u:USER {id: $id}), (q:QUEST {id: $qid})
           CREATE (u)-[r:HAS_QUEST {status: 'IN_PROGRESS', progress: '0', started_at: $now}]->(q)
           RETURN r.status AS status`,
          { id, qid: body.questId, now },
        );
        return { questId: body.questId, questName: quest[0]!.name as string };
      });
      await db.tx((tx) =>
        logEvent(tx, {
          type: "QUEST_ASSIGNED",
          userId: id,
          entityId: body.questId,
          entityType: "Quest",
          priority: "Medium",
          description: `Admin assigned quest ${rows.questName} to user ${id}`,
          details: { userId: id, questId: body.questId },
        }),
      );
      return { questId: body.questId, status: "IN_PROGRESS" };
    },
    { body: t.Object({ questId: t.Number() }), params: t.Object({ id: t.Numeric() }) },
  )
  .post(
    "/admin/users/:id/achievements",
    async ({ params, body }) => {
      const id = Number(params.id);
      const now = new Date().toISOString();
      const rows = await db.tx(async (tx) => {
        const user = await tx.run(`MATCH (u:USER {id: $id}) RETURN u.username AS username`, { id });
        if (user.length === 0) throw new AppError(404, "NOT_FOUND", "user not found");
        const ach = await tx.run(`MATCH (a:ACHIEVEMENT {id: $aid}) RETURN a.name AS name`, { aid: body.achievementId });
        if (ach.length === 0) throw new AppError(404, "NOT_FOUND", "achievement not found");
        const existing = await tx.run(
          `MATCH (u:USER {id: $id})-[r:UNLOCKED]->(a:ACHIEVEMENT {id: $aid}) RETURN 1 AS ok`,
          { id, aid: body.achievementId },
        );
        if (existing.length > 0) throw new AppError(409, "ALREADY_ASSIGNED", "achievement already assigned to user");
        await tx.run(
          `MATCH (u:USER {id: $id}), (a:ACHIEVEMENT {id: $aid})
           CREATE (u)-[r:UNLOCKED {unlocked_at: $now}]->(a)
           RETURN r.unlocked_at AS unlockedAt`,
          { id, aid: body.achievementId, now },
        );
        return { achievementId: body.achievementId, achievementName: ach[0]!.name as string };
      });
      await db.tx((tx) =>
        logEvent(tx, {
          type: "ACHIEVEMENT_ASSIGNED",
          userId: id,
          entityId: body.achievementId,
          entityType: "Achievement",
          priority: "Medium",
          description: `Admin assigned achievement ${rows.achievementName} to user ${id}`,
          details: { userId: id, achievementId: body.achievementId },
        }),
      );
      return { achievementId: body.achievementId, unlockedAt: now };
    },
    { body: t.Object({ achievementId: t.Number() }), params: t.Object({ id: t.Numeric() }) },
  );
