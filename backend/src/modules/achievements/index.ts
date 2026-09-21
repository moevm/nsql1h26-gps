import { Elysia, t } from "elysia";
import { AppError } from "../../common/errors";
import { db } from "../../common/db";
import { authPlugin } from "../../plugins/auth";
import { registerAchievementHandlers } from "./handlers";

export const achievementsModule = new Elysia({ name: "achievements" })
  .use(authPlugin)
  .get(
    "/achievements/:id",
    async ({ params, auth }) => {
      const rows = await db.run(
        `MATCH (a:ACHIEVEMENT {id: $aid})
         OPTIONAL MATCH (u:USER {id: $uid})-[ul:UNLOCKED]->(a)
         RETURN a {.*, unlockedAt: ul.unlocked_at}`,
        { aid: Number(params.id), uid: auth!.userId },
      );
      const a = rows[0]?.a as Record<string, unknown> | undefined;
      if (!a) throw new AppError(404, "NOT_FOUND", "achievement not found");
      if (typeof a.trigger_rules === "string") a.trigger_rules = JSON.parse(a.trigger_rules);
      return a;
    },
    { params: t.Object({ id: t.Numeric() }) },
  );

export function registerAchievementModuleHandlers(): void {
  registerAchievementHandlers();
}
