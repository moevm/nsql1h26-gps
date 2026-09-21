import { existsSync } from "node:fs";
import { Elysia } from "elysia";
import { openapi } from "@elysia/openapi";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import config from "../config";
import { authPlugin, pathGuard } from "./plugins/auth";
import { errorHandler } from "./common/errors";
import { userAuthModule } from "./modules/auth";
import { adminAuthModule } from "./modules/admin/auth";
import { geoModule } from "./modules/geo";
import { questsModule, registerQuestModuleHandlers } from "./modules/quests";
import { achievementsModule, registerAchievementModuleHandlers } from "./modules/achievements";
import { profileModule } from "./modules/profile";
import { leaderboardModule } from "./modules/leaderboard";
import { adminStatsModule } from "./modules/admin/stats";
import { adminUsersModule } from "./modules/admin/users";
import { adminQuestsModule } from "./modules/admin/quests";
import { adminPoisModule } from "./modules/admin/pois";
import { adminAchievementsModule } from "./modules/admin/achievements";
import { adminLogsModule } from "./modules/admin/logs";
import { adminDataModule } from "./modules/admin/data";

export function buildApp() {
  const app = new Elysia()
    .onError({ as: "global" }, errorHandler as any)
    .use(openapi())
    .use(
      cors({
        origin: true,
        allowedHeaders: ["Content-Type", "Authorization"],
      }),
    )
    .use(authPlugin)
    .onBeforeHandle({ as: "global" }, pathGuard)
    .use(
      staticPlugin({
        assets: "public",
        prefix: "/",
        indexHTML: true,
      }),
    )
    .use(
      staticPlugin({
        assets: config.UPLOADS_DIR,
        prefix: "/uploads",
      }),
    )
    .get("/", () => {
      const index = "public/index.html";
      if (existsSync(index)) return Bun.file(index);
      return { status: "ok", service: "nsql1h26-gps-backend" };
    })
    .get("/api/health", () => ({ status: "ok", service: "nsql1h26-gps-backend" }))
    .use(userAuthModule)
    .use(adminAuthModule)
    .use(geoModule)
    .use(questsModule)
    .use(achievementsModule)
    .use(profileModule)
    .use(leaderboardModule)
    .use(adminStatsModule)
    .use(adminUsersModule)
    .use(adminQuestsModule)
    .use(adminPoisModule)
    .use(adminAchievementsModule)
    .use(adminLogsModule)
    .use(adminDataModule);

  registerQuestModuleHandlers();
  registerAchievementModuleHandlers();

  return app;
}

export type App = ReturnType<typeof buildApp>;
