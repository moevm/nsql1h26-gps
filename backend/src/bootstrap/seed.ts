import config from "../../config";
import { db } from "../common/db";
import { importDump, parseDump } from "../common/dump";
import { resyncIdCounters } from "../common/ids";

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
  await db.tx((tx) => resyncIdCounters(tx));
  console.log(`[seed] imported ${nodes} nodes, ${relationships} relationships`);
  return true;
}
