import { mkdir } from "node:fs/promises";
import config from "./config";
import { buildApp } from "./src/app";
import { ensureConstraints } from "./src/bootstrap/constraints";
import { seedIfEmpty } from "./src/bootstrap/seed";
import { withRetry } from "./src/common/db";

process.on("uncaughtException", (e) => {
  console.error("[uncaughtException]", e);
});
process.on("unhandledRejection", (e) => {
  console.error("[unhandledRejection]", e);
});

const app = buildApp();
app.listen(config.PORT);
console.log(`[server] listening on :${config.PORT}`);

void mkdir(config.UPLOADS_DIR, { recursive: true }).catch(() => {});

void withRetry(async () => {
  await ensureConstraints();
  await seedIfEmpty();
}, 30, 2000)
  .then(() => console.log("[bootstrap] constraints + seed ready"))
  .catch((e) => console.error("[bootstrap] failed", e));
