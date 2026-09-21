export type FieldType = "string" | "number" | "date" | "enum";

export interface FieldConfig {
  type: FieldType;
  ops?: string[];
  enumValues?: string[];
}

export interface EntityConfig {
  label: string;
  uniqueKeys: string[];
  fields: Record<string, FieldConfig>;
  sortable: string[];
  defaultSort: { by: string; dir: "asc" | "desc" };
}

export const DEFAULT_OPS: Record<FieldType, string[]> = {
  string: ["eq", "contains", "regex"],
  number: ["eq", "gt", "gte", "lt", "lte", "between"],
  date: ["eq", "gt", "gte", "lt", "lte", "between"],
  enum: ["eq", "in"],
};

export const ENTITY_CONFIGS = {
  users: {
    label: "USER",
    uniqueKeys: ["id"],
    fields: {
      id: { type: "number" },
      username: { type: "string" },
      status: { type: "enum", enumValues: ["Active", "Banned"] },
      created_at: { type: "date" },
      updated_at: { type: "date" },
      total_distance_km: { type: "number" },
      exp: { type: "number" },
    },
    sortable: ["id", "username", "status", "created_at", "total_distance_km", "exp"],
    defaultSort: { by: "created_at", dir: "desc" },
  },
  quests: {
    label: "QUEST",
    uniqueKeys: ["id"],
    fields: {
      id: { type: "number" },
      name: { type: "string" },
      description: { type: "string" },
      reward: { type: "string" },
      duration: { type: "string" },
      created_at: { type: "date" },
    },
    sortable: ["id", "name", "created_at"],
    defaultSort: { by: "id", dir: "asc" },
  },
  pois: {
    label: "POI",
    uniqueKeys: ["id"],
    fields: {
      id: { type: "number" },
      name: { type: "string" },
      type: { type: "string", ops: ["eq", "contains"] }, 
      description: { type: "string" },
      "location.latitude": { type: "number" },
      "location.longitude": { type: "number" },
      created_at: { type: "date" },
    },
    sortable: ["id", "name", "type", "created_at"],
    defaultSort: { by: "id", dir: "asc" },
  },
  achievements: {
    label: "ACHIEVEMENT",
    uniqueKeys: ["id"],
    fields: {
      id: { type: "number" },
      name: { type: "string" },
      description: { type: "string" },
      reward: { type: "string" },
      created_at: { type: "date" },
    },
    sortable: ["id", "name", "created_at"],
    defaultSort: { by: "id", dir: "asc" },
  },
  logs: {
    label: "EVENT_LOG",
    uniqueKeys: ["id"],
    fields: {
      id: { type: "number" },
      type: { type: "string" },
      user_id: { type: "number" },
      entity_id: { type: "number" },
      entity_type: {
        type: "enum",
        enumValues: ["User", "Quest", "POI", "Achievement", "Admin", "System"],
      },
      priority: { type: "enum", enumValues: ["Low", "Medium", "High"] },
      timestamp: { type: "date" },
      description: { type: "string" },
    },
    sortable: ["id", "timestamp", "priority", "entity_type", "type"],
    defaultSort: { by: "timestamp", dir: "desc" },
  },
} satisfies Record<string, EntityConfig>;

export const IMPORTABLE_LABELS = ["USER", "ADMIN", "CELL", "POI", "QUEST", "ACHIEVEMENT", "EVENT_LOG"] as const;

export const REL_TYPES = ["VISITED", "DISCOVERED", "HAS_QUEST", "UNLOCKED", "CONTAINS", "DEPENDS_ON", "REQUIRES_QUEST"] as const;

export const LABEL_CONFIGS: Record<string, EntityConfig> = {
  ...Object.fromEntries(Object.values(ENTITY_CONFIGS).map((c) => [c.label, c])),
  CELL: {
    label: "CELL",
    uniqueKeys: ["index"],
    fields: {
      index: { type: "string" },
      resolution: { type: "number" },
    },
    sortable: [],
    defaultSort: { by: "index", dir: "asc" },
  },
};

export const UNIQUE_KEYS: Record<string, string[]> = {
  USER: ["id"],
  ADMIN: ["id"],
  CELL: ["index"],
  POI: ["id"],
  QUEST: ["id"],
  ACHIEVEMENT: ["id"],
  EVENT_LOG: ["id"],
};
