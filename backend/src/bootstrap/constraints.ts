import { db } from "../common/db";

const STATEMENTS = [
  `CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:USER) REQUIRE u.id IS UNIQUE`,
  `CREATE CONSTRAINT user_username IF NOT EXISTS FOR (u:USER) REQUIRE u.username IS UNIQUE`,
  `CREATE CONSTRAINT admin_username IF NOT EXISTS FOR (a:ADMIN) REQUIRE a.username IS UNIQUE`,
  `CREATE CONSTRAINT cell_index IF NOT EXISTS FOR (c:CELL) REQUIRE c.index IS UNIQUE`,
  `CREATE CONSTRAINT poi_id IF NOT EXISTS FOR (p:POI) REQUIRE p.id IS UNIQUE`,
  `CREATE CONSTRAINT quest_id IF NOT EXISTS FOR (q:QUEST) REQUIRE q.id IS UNIQUE`,
  `CREATE CONSTRAINT achievement_id IF NOT EXISTS FOR (a:ACHIEVEMENT) REQUIRE a.id IS UNIQUE`,
  `CREATE CONSTRAINT event_log_id IF NOT EXISTS FOR (e:EVENT_LOG) REQUIRE e.id IS UNIQUE`,
  `CREATE INDEX event_log_user IF NOT EXISTS FOR (e:EVENT_LOG) ON (e.user_id)`,
  `CREATE INDEX event_log_timestamp IF NOT EXISTS FOR (e:EVENT_LOG) ON (e.timestamp)`,
];

export async function ensureConstraints(): Promise<void> {
  for (const stmt of STATEMENTS) {
    await db.run(stmt);
  }
}
