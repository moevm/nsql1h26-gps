import { nextId } from "./ids";
import type { Tx } from "./db";

export const PRIORITIES = ["Low", "Medium", "High"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const ENTITY_TYPES = ["User", "Quest", "POI", "Achievement", "Admin", "System"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export interface LogInput {
  type: string;
  userId?: number;
  entityId?: number;
  entityType: EntityType;
  priority: Priority;
  description: string;
  details?: Record<string, unknown>;
}

export async function logEvent(tx: Tx, e: LogInput): Promise<void> {
  await tx.run(
    `CREATE (l:EVENT_LOG {
       id: $id, type: $type, user_id: $userId, entity_id: $entityId,
       description: $description, details: $details,
       timestamp: $now, priority: $priority, entity_type: $entityType
     })`,
    {
      id: await nextId(tx, "EVENT_LOG"),
      type: e.type,
      userId: e.userId ?? null,
      entityId: e.entityId ?? null,
      description: e.description,
      details: e.details ? JSON.stringify(e.details) : null,
      now: new Date().toISOString(),
      priority: e.priority,
      entityType: e.entityType,
    },
  );
}
