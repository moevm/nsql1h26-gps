import config from "../../config";
import { db } from "../common/db";
import { importDump, parseDump } from "../common/dump";

const ID_LABELS = ["USER", "ADMIN", "POI", "QUEST", "ACHIEVEMENT", "EVENT_LOG"] as const;

export async function seedIfEmpty(): Promise<boolean> {
  const rows = await db.run("MATCH (n) RETURN count(n) AS c");
  const count = rows[0]?.c as number;
  if (count > 0) {
    console.log(`[seed] db not empty (${count} nodes), skip`);
    return false;
  }

  const file = Bun.file(config.SEED_FILE);
  if (!(await file.exists())) {
    console.error(`[seed] seed file not found: ${config.SEED_FILE}`);
    return false;
  }
  const raw = await file.json();
  const dump = parseDump(raw);
  const { nodes, relationships } = await importDump(db, dump);
  await initIdCounters();
  console.log(`[seed] imported ${nodes} nodes, ${relationships} relationships`);
  return true;
}

async function initIdCounters(): Promise<void> {
  await db.tx(async (tx) => {
    for (const label of ID_LABELS) {
      const rows = await tx.run(`MATCH (n:\`${label}\`) RETURN max(n.id) AS mx`);
      const max = rows[0]?.mx as number | null;
      const start = Math.max((max ?? 0) + 1, 1001);
      await tx.run(
        `MERGE (c:IdCounter {label: $label}) ON CREATE SET c.value = $start`,
        { label, start },
      );
    }
  });
}
