import { Elysia, t } from "elysia";
import { authPlugin } from "../../../plugins/auth";
import { AppError } from "../../../common/errors";
import { ENTITY_CONFIGS } from "../../../common/cypher/entity-configs";
import { makeAdminListRoutes } from "../../../common/cypher/list-route";
import { logEvent } from "../../../common/log";
import { db } from "../../../common/db";
import { saveAvatar } from "../../../common/avatar-upload";

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
  );
