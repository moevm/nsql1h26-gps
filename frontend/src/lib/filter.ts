export type FieldType = "string" | "number" | "date" | "enum";

export interface FieldConfig {
  type: FieldType;
  ops?: string[];
  enumValues?: string[];
  label: string;
}

export interface EntityConfig {
  label: string; 
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

export const REL_TYPES = ["VISITED", "DISCOVERED", "HAS_QUEST", "UNLOCKED", "CONTAINS", "DEPENDS_ON", "REQUIRES_QUEST"] as const;

export const LABEL_CONFIGS: Record<string, EntityConfig> = {};

export const ADMIN_ENTITY_CONFIGS: Record<string, EntityConfig> = {
  users: {
    label: "USER",
    fields: {
      id: { type: "number", label: "ID" },
      username: { type: "string", label: "Username" },
      status: { type: "enum", enumValues: ["Active", "Banned"], label: "Status" },
      created_at: { type: "date", label: "Created" },
      updated_at: { type: "date", label: "Updated" },
      total_distance_km: { type: "number", label: "Distance, km" },
      exp: { type: "number", label: "XP" },
    },
    sortable: ["id", "username", "status", "created_at", "total_distance_km", "exp"],
    defaultSort: { by: "created_at", dir: "desc" },
  },
  quests: {
    label: "QUEST",
    fields: {
      id: { type: "number", label: "ID" },
      name: { type: "string", label: "Title" },
      description: { type: "string", label: "Description" },
      reward: { type: "string", label: "Reward" },
      duration: { type: "string", label: "Duration" },
      created_at: { type: "date", label: "Created" },
    },
    sortable: ["id", "name", "created_at"],
    defaultSort: { by: "id", dir: "asc" },
  },
  pois: {
    label: "POI",
    fields: {
      id: { type: "number", label: "ID" },
      name: { type: "string", label: "Name" },
      type: { type: "string", ops: ["eq", "contains"], label: "Type" },
      description: { type: "string", label: "Description" },
      "location.latitude": { type: "number", label: "Latitude" },
      "location.longitude": { type: "number", label: "Longitude" },
      created_at: { type: "date", label: "Created" },
    },
    sortable: ["id", "name", "type", "created_at"],
    defaultSort: { by: "id", dir: "asc" },
  },
  achievements: {
    label: "ACHIEVEMENT",
    fields: {
      id: { type: "number", label: "ID" },
      name: { type: "string", label: "Name" },
      description: { type: "string", label: "Description" },
      reward: { type: "string", label: "Reward" },
      created_at: { type: "date", label: "Created" },
    },
    sortable: ["id", "name", "created_at"],
    defaultSort: { by: "id", dir: "asc" },
  },
  logs: {
    label: "EVENT_LOG",
    fields: {
      id: { type: "number", label: "ID" },
      type: { type: "string", label: "Event type" },
      user_id: { type: "number", label: "User ID" },
      entity_id: { type: "number", label: "Entity ID" },
      entity_type: {
        type: "enum",
        enumValues: ["User", "Quest", "POI", "Achievement", "Admin", "System"],
        label: "Entity",
      },
      priority: { type: "enum", enumValues: ["Low", "Medium", "High"], label: "Priority" },
      timestamp: { type: "date", label: "Timestamp" },
      description: { type: "string", label: "Description" },
    },
    sortable: ["id", "timestamp", "priority", "entity_type", "type"],
    defaultSort: { by: "timestamp", dir: "desc" },
  },
};

for (const cfg of Object.values(ADMIN_ENTITY_CONFIGS)) LABEL_CONFIGS[cfg.label] = cfg;
LABEL_CONFIGS["CELL"] = {
  label: "CELL",
  fields: {
    index: { type: "string", label: "Index" },
    resolution: { type: "number", label: "Resolution" },
  },
  sortable: [],
  defaultSort: { by: "index", dir: "asc" },
};

export interface SimpleFilter {
  field: string;
  op: string;
  value: string;
}

export function parseSimple(query: URLSearchParams): SimpleFilter[] {
  return query.getAll("f").map((raw) => {
    const [field, op, ...rest] = raw.split(":");
    return { field: field ?? "", op: op ?? "eq", value: rest.join(":") };
  });
}

export function simpleToQuery(filters: SimpleFilter[]): URLSearchParams {
  const q = new URLSearchParams();
  for (const f of filters) q.append("f", `${f.field}:${f.op}:${f.value}`);
  return q;
}

export type LeafValue = string | number | (string | number)[];

export type ComplexNode =
  | { field: string; op: string; value: LeafValue }
  | { and: ComplexNode[] }
  | { or: ComplexNode[] }
  | { not: ComplexNode }
  | { rel: string; dir: "out" | "in"; label: string; where: ComplexNode };

export function parseComplex(query: URLSearchParams): ComplexNode | null {
  const raw = query.get("query");
  if (!raw) return null;
  try {
    return JSON.parse(atob(raw)) as ComplexNode;
  } catch {
    return null;
  }
}

export function complexToQuery(node: ComplexNode): URLSearchParams {
  const q = new URLSearchParams();
  q.set("query", btoa(JSON.stringify(node)));
  return q;
}

export function nodeIsGroup(node: ComplexNode): node is { and: ComplexNode[] } | { or: ComplexNode[] } | { not: ComplexNode } {
  return "and" in node || "or" in node || "not" in node;
}

export function nodeIsRel(node: ComplexNode): node is { rel: string; dir: "out" | "in"; label: string; where: ComplexNode } {
  return "rel" in node;
}

export function makeRelNode(rel: string, dir: "out" | "in", label: string): ComplexNode {
  return { rel, dir, label, where: { and: [] } };
}

export function groupKey(node: ComplexNode): "and" | "or" | "not" {
  return "and" in node ? "and" : "or" in node ? "or" : "not";
}

export function groupChildren(node: ComplexNode): ComplexNode[] {
  if ("and" in node) return node.and;
  if ("or" in node) return node.or;
  if ("not" in node) return [node.not];
  return []; 
}

export function makeLeaf(cfg: EntityConfig, field: string, op: string, value: string): ComplexNode {
  const fcfg = cfg.fields[field];
  if (fcfg?.type === "number") return { field, op, value: Number(value) };
  return { field, op, value };
}

export function makeGroup(key: "and" | "or" | "not", children: ComplexNode[]): ComplexNode {
  if (key === "and") return { and: children };
  if (key === "or") return { or: children };
  return { not: children[0] ?? { and: [] } };
}

export interface ListState {
  filters: SimpleFilter[];
  complex: ComplexNode | null;
  mode: "simple" | "complex";
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: "asc" | "desc";
}

export function listStateToQuery(cfg: EntityConfig, s: ListState): URLSearchParams {
  let q: URLSearchParams;
  if (s.mode === "complex") {
    q = complexToQuery(s.complex ?? { and: [] });
  } else {
    q = simpleToQuery(s.filters);
  }
  if (s.mode === "complex") q.set("mode", "complex");
  if (s.page > 1) q.set("page", String(s.page));
  q.set("pageSize", String(s.pageSize));
  q.set("sortBy", s.sortBy);
  q.set("sortDir", s.sortDir);
  return q;
}

export function listStateFromQuery(cfg: EntityConfig, query: URLSearchParams): ListState {
  const complex = query.get("mode") === "complex" ? parseComplex(query) : null;
  return {
    filters: complex ? [] : parseSimple(query),
    complex,
    mode: complex ? "complex" : "simple",
    page: Number(query.get("page") ?? 1),
    pageSize: Number(query.get("pageSize") ?? 20),
    sortBy: query.get("sortBy") ?? cfg.defaultSort.by,
    sortDir: (query.get("sortDir") as "asc" | "desc") ?? cfg.defaultSort.dir,
  };
}

export const OP_LABELS: Record<string, string> = {
  eq: "=",
  contains: "содержит",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  between: "между",
  in: "в списке",
};
