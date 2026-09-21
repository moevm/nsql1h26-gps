import { Elysia, t } from "elysia";
import { AppError } from "../../common/errors";
import { db } from "../../common/db";
import { levelFromExp } from "../../common/level";
import { saveAvatar } from "../../common/avatar-upload";
import { authPlugin } from "../../plugins/auth";

export const profileModule = new Elysia({ name: "profile" })
  .use(authPlugin)
  .get("/me", async ({ auth }) => {
    const rows = await db.run(
      `MATCH (u:USER {id: $id})
       OPTIONAL MATCH (u)-[:DISCOVERED]->(p:POI)
       OPTIONAL MATCH (u)-[:UNLOCKED]->(a:ACHIEVEMENT)
       WITH u, count(DISTINCT p) AS discovered,
            collect(DISTINCT CASE WHEN a IS NULL THEN NULL
                  ELSE {id: a.id, name: a.name, description: a.description, reward: a.reward} END) AS achievements
       MATCH (allP:POI)
       RETURN u {.id, .username, .avatar, .total_distance_km, .exp, .status, .created_at},
              discovered, count(DISTINCT allP) AS totalPois, achievements`,
      { id: auth!.userId },
    );
    const r = rows[0]!;
    const u = r.u as Record<string, unknown>;
    const exp = u.exp as number;
    const discovered = r.discovered as number;
    const totalPois = r.totalPois as number;
    return {
      ...u,
      level: levelFromExp(exp),
      exploration_percent: totalPois > 0 ? +(discovered / totalPois).toFixed(3) : 0,
      achievements: r.achievements,
    };
  })
  .patch(
    "/me",
    async ({ body, auth }) => {
      const rows = await db.run(
        `MATCH (u:USER {id: $id}) SET u += $props, u.updated_at = $now RETURN u {.*}`,
        { id: auth!.userId, props: body, now: new Date().toISOString() },
      );
      if (rows.length === 0) throw new AppError(401, "USER_NOT_FOUND", "user not found");
      const u = rows[0]!.u as Record<string, unknown>;
      delete u.password_hash;
      return u;
    },
    {
      body: t.Object({
        username: t.Optional(t.String({ minLength: 3, maxLength: 30 })),
      }),
    },
  )
  .post(
    "/me/avatar",
    async ({ body, auth }) => {
      const filename = await saveAvatar(body.file, auth!.userId);
      await db.run(
        `MATCH (u:USER {id: $id}) SET u.avatar = $avatar, u.updated_at = $now`,
        { id: auth!.userId, avatar: filename, now: new Date().toISOString() },
      );
      return { avatar: filename };
    },
    { type: "multipart/form-data", body: t.Object({ file: t.File() }) },
  )
  .post("/me/logout", () => ({ ok: true }))
  .get(
    "/users/:id",
    async ({ params }) => {
      const rows = await db.run(
        `MATCH (u:USER {id: $id})
         OPTIONAL MATCH (u)-[:UNLOCKED]->(a:ACHIEVEMENT)
         RETURN u {.id, .username, .avatar, .exp, .total_distance_km, .created_at},
                collect(DISTINCT CASE WHEN a IS NULL THEN NULL
                      ELSE {id: a.id, name: a.name, description: a.description} END) AS achievements`,
        { id: Number(params.id) },
      );
      const r = rows[0];
      if (!r) throw new AppError(404, "NOT_FOUND", "user not found");
      const exp = (r.u as Record<string, unknown>).exp as number;
      return { ...(r.u as Record<string, unknown>), level: levelFromExp(exp), achievements: r.achievements };
    },
    { params: t.Object({ id: t.Numeric() }) },
  );
