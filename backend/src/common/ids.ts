import type { Tx } from "./db";

export type EntityLabel = "USER" | "ADMIN" | "POI" | "QUEST" | "ACHIEVEMENT" | "EVENT_LOG";

export async function nextId(tx: Tx, label: EntityLabel, start = 1001): Promise<number> {
  const rows = await tx.run(
    `MERGE (c:IdCounter {label: $label})
     ON CREATE SET c.value = $start
     ON MATCH SET c.value = c.value + 1
     RETURN c.value AS id`,
    { label, start },
  );
  return rows[0]!.id as number;
}
