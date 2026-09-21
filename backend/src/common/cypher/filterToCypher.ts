import * as Cypher from "@neo4j/cypher-builder";
import { AppError } from "../errors";
import { DEFAULT_OPS, LABEL_CONFIGS, REL_TYPES, type EntityConfig, type FieldConfig } from "./entity-configs";

export type FilterLeafValue = string | number | boolean | (string | number)[] | [string, string] | [number, number];
export type FilterLeaf = { field: string; op: string; value: FilterLeafValue };
export type RelNode = { rel: string; dir: "out" | "in"; label: string; where: FilterNode };
export type FilterNode = FilterLeaf | { and: FilterNode[] } | { or: FilterNode[] } | { not: FilterNode } | RelNode;

export interface ListQueryInput {
  filters: FilterNode | null;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface BuiltQueries {
  listCypher: string;
  countCypher: string;
  params: Record<string, unknown>;
}

const isLeaf = (n: FilterNode): n is FilterLeaf => "field" in n;
const isRel = (n: FilterNode): n is RelNode => "rel" in n;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateLeaf(leaf: FilterLeaf, cfg: EntityConfig): { field: FieldConfig; op: string; value: FilterLeafValue } {
  const fcfg = cfg.fields[leaf.field];
  if (!fcfg) throw new AppError(400, "INVALID_FILTER", `unknown field: ${leaf.field}`);
  const ops = fcfg.ops ?? DEFAULT_OPS[fcfg.type];
  if (!ops.includes(leaf.op)) throw new AppError(400, "INVALID_FILTER", `op ${leaf.op} not allowed for ${leaf.field}`);

  let value = leaf.value;
  if (leaf.op === "between") {
    if (typeof value === "string") value = value.split(",");
    if (!Array.isArray(value) || value.length !== 2)
      throw new AppError(400, "INVALID_FILTER", `between requires two values`);
    if (fcfg.type === "number") {
      value = value.map((v) => Number(v));
    }
  }
  if (fcfg.type === "enum" && fcfg.enumValues) {
    const vals = Array.isArray(value) ? value : [value];
    if (vals.some((v) => typeof v !== "string" || !fcfg.enumValues!.includes(v)))
      throw new AppError(400, "INVALID_FILTER", `invalid enum value for ${leaf.field}`);
  }
  if (fcfg.type === "number") {
    const nums = Array.isArray(value) ? value : [value];
    if (nums.some((v) => typeof v !== "number" || !Number.isFinite(v)))
      throw new AppError(400, "INVALID_FILTER", `${leaf.field} must be numeric`);
  }
  if (fcfg.type === "date") {
    const dates = Array.isArray(value) ? value : [value];
    if (dates.some((v) => typeof v !== "string" || Number.isNaN(Date.parse(v))))
      throw new AppError(400, "INVALID_FILTER", `${leaf.field} must be a date`);
  }
  return { field: fcfg, op: leaf.op, value };
}

function leafToPredicate(node: Cypher.Node, leaf: FilterLeaf, cfg: EntityConfig): Cypher.Predicate {
  const { field, op, value } = validateLeaf(leaf, cfg);
  const prop = node.property(...leaf.field.split("."));
  const param = (v: FilterLeafValue) => new Cypher.Param(v);

  switch (op) {
    case "eq":
      return Cypher.eq(prop, param(value));
    case "contains":
      return Cypher.matches(prop, param(`(?i).*${escapeRegExp(String(value))}.*`));
    case "regex":
      return Cypher.matches(prop, param(value));
    case "gt":
      return Cypher.gt(prop, param(value));
    case "gte":
      return Cypher.gte(prop, param(value));
    case "lt":
      return Cypher.lt(prop, param(value));
    case "lte":
      return Cypher.lte(prop, param(value));
    case "between": {
      const [v1, v2] = value as [FilterLeafValue, FilterLeafValue];
      return Cypher.and(Cypher.gte(prop, param(v1)), Cypher.lte(prop, param(v2)));
    }
    case "in":
      return Cypher.in(prop, param(value));
    default:
      throw new AppError(400, "INVALID_FILTER", `unknown op: ${op} (${field.type})`);
  }
}

export function toPredicate(node: Cypher.Node, filter: FilterNode, cfg: EntityConfig): Cypher.Predicate {
  if (isLeaf(filter)) return leafToPredicate(node, filter, cfg);
  if ("and" in filter) {
    if (filter.and.length === 0) return Cypher.true;
    return Cypher.and(...filter.and.map((x) => toPredicate(node, x, cfg)))!;
  }
  if ("or" in filter) {
    if (filter.or.length === 0) return Cypher.false;
    return Cypher.or(...filter.or.map((x) => toPredicate(node, x, cfg)))!;
  }
  if (isRel(filter)) return relToPredicate(node, filter);
  return Cypher.not(toPredicate(node, filter.not, cfg));
}

function relToPredicate(node: Cypher.Node, rel: RelNode): Cypher.Predicate {
  const targetCfg = LABEL_CONFIGS[rel.label]!; // наличие гарантировано validateTree
  const m = new Cypher.Node();
  const pattern =
    rel.dir === "in"
      ? new Cypher.Pattern(m, { labels: [rel.label] }).related({ type: rel.rel }).to(node)
      : new Cypher.Pattern(node).related({ type: rel.rel }).to(m, { labels: [rel.label] });
  const inner = toPredicate(m, rel.where, targetCfg);
  return new Cypher.Exists(new Cypher.Match(pattern).where(inner));
}

export function parseSimple(fParams: string[] | undefined, cfg: EntityConfig): FilterNode | null {
  if (!fParams || fParams.length === 0) return null;
  const leaves: FilterLeaf[] = fParams.map((raw) => {
    const i1 = raw.indexOf(":");
    const i2 = raw.indexOf(":", i1 + 1);
    if (i1 < 0 || i2 < 0) throw new AppError(400, "INVALID_FILTER", `bad f param: ${raw}`);
    const field = raw.slice(0, i1);
    const op = raw.slice(i1 + 1, i2);
    const rawValue = raw.slice(i2 + 1);
    if (!field || !op || rawValue === "") throw new AppError(400, "INVALID_FILTER", `bad f param: ${raw}`);
    return { field, op, value: coerceSimpleValue(rawValue, op, cfg.fields[field]) };
  });
  return leaves.length === 1 ? leaves[0]! : { and: leaves };
}

function coerceSimpleValue(raw: string, op: string, fcfg?: FieldConfig): FilterLeafValue {
  if (!fcfg) return raw; 
  if (op === "between") return raw;
  if (op === "in") return raw.split(",");
  if (fcfg.type === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new AppError(400, "INVALID_FILTER", `bad number: ${raw}`);
    return n;
  }
  return raw;
}

export function parseComplexQuery(b64: string, cfg: EntityConfig): FilterNode {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    throw new AppError(400, "INVALID_FILTER", "query must be base64-encoded JSON");
  }

  const walk = (n: unknown): FilterNode => {
    if (typeof n !== "object" || n === null) throw new AppError(400, "INVALID_FILTER", "bad filter tree");
    const obj = n as Record<string, unknown>;
    if ("and" in obj || "or" in obj) {
      const key = "and" in obj ? "and" : "or";
      if (!Array.isArray(obj[key])) throw new AppError(400, "INVALID_FILTER", `${key} must be an array`);
      return { [key]: (obj[key] as unknown[]).map(walk) } as FilterNode;
    }
    if ("not" in obj) return { not: walk(obj.not) };
    if (typeof obj.rel === "string") {
      return {
        rel: obj.rel,
        dir: obj.dir === "in" ? "in" : "out",
        label: typeof obj.label === "string" ? obj.label : "",
        where: obj.where !== undefined ? walk(obj.where) : { and: [] },
      } as RelNode;
    }
    if (typeof obj.field === "string" && typeof obj.op === "string") {
      return { field: obj.field, op: obj.op, value: obj.value as FilterLeafValue };
    }
    throw new AppError(400, "INVALID_FILTER", "leaf must be {field, op, value}");
  };

  const node = walk(parsed);
  validateTree(node, cfg);
  return node;
}

function validateTree(node: FilterNode, cfg: EntityConfig): void {
  if (isLeaf(node)) {
    validateLeaf(node, cfg);
    return;
  }
  if ("and" in node) node.and.forEach((x) => validateTree(x, cfg));
  else if ("or" in node) node.or.forEach((x) => validateTree(x, cfg));
  else if (isRel(node)) {
    if (!(REL_TYPES as readonly string[]).includes(node.rel))
      throw new AppError(400, "INVALID_FILTER", `unknown relationship type: ${node.rel}`);
    const targetCfg = LABEL_CONFIGS[node.label];
    if (!targetCfg) throw new AppError(400, "INVALID_FILTER", `unknown target label: ${node.label}`);
    validateTree(node.where, targetCfg);
  } else validateTree(node.not, cfg);
}

export function buildListQueries(cfg: EntityConfig, input: ListQueryInput): BuiltQueries {
  const node = new Cypher.Node();
  const pattern = new Cypher.Pattern(node, { labels: [cfg.label] });
  const predicate = input.filters ? toPredicate(node, input.filters, cfg) : undefined;

  const sortBy = input.sortBy ?? cfg.defaultSort.by;
  const sortDir = input.sortDir ?? cfg.defaultSort.dir;
  if (!cfg.sortable.includes(sortBy)) throw new AppError(400, "INVALID_FILTER", `not sortable: ${sortBy}`);

  let listClause: any = new Cypher.Match(pattern)
    .where(predicate)
    .return(new Cypher.MapProjection(node, "*"))
    .orderBy([node.property(sortBy), sortDir === "desc" ? "DESC" : "ASC"]);
  const offset = (input.page - 1) * input.pageSize;
  if (offset > 0) listClause = listClause.skip(offset);
  listClause = listClause.limit(input.pageSize);

  const countClause = new Cypher.Match(pattern)
    .where(predicate)
    .return([Cypher.count(node), "total"]);

  const list = listClause.build();
  const count = countClause.build();
  return {
    listCypher: list.cypher,
    countCypher: count.cypher,
    params: { ...list.params, ...count.params },
  };
}
