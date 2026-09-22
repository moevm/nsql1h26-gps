import type { Tx } from "./db";

export type EntityLabel = "USER" | "ADMIN" | "POI" | "QUEST" | "ACHIEVEMENT" | "EVENT_LOG";

export const ID_LABELS: EntityLabel[] = ["USER", "ADMIN", "POI", "QUEST", "ACHIEVEMENT", "EVENT_LOG"];

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

export async function resyncIdCounters(tx: Tx): Promise<void> {
  for (const label of ID_LABELS) {
    const rows = await tx.run(
      `MATCH (n:\`${label}\`) RETURN coalesce(max(n.id), 0) + 1 AS next`,
    );
    const next = rows[0]!.next as number;
    await tx.run(
      `MERGE (c:IdCounter {label: $label})
       ON CREATE SET c.value = $next
       ON MATCH SET c.value = CASE WHEN c.value < $next THEN $next ELSE c.value END`,
      { label, next },
    );
  }
}
