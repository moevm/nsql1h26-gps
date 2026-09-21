import { Elysia, t } from "elysia";
import { AppError } from "../errors";
import { db as dbClient, type GraphClient, type Row } from "../db";
import { toLatLon } from "../point";
import { buildListQueries, parseComplexQuery, parseSimple } from "./filterToCypher";
import type { EntityConfig } from "./entity-configs";

export function toDto(row: Row): Row {
  let obj = row;
  const keys = Object.keys(row);
  if (keys.length === 1 && typeof row[keys[0]!] === "object" && row[keys[0]!] !== null && !Array.isArray(row[keys[0]!])) {
    obj = row[keys[0]!] as Row;
  }
  return sanitize(obj);
}

function sanitize(obj: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "password_hash" || k === "password") continue;
    if (k === "trigger_rules" || k === "details") {
      out[k] = typeof v === "string" ? safeParse(v) : v;
      continue;
    }
    if (k === "location" || k === "last_position") {
      out[k] = toLatLon(v);
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = sanitize(v as Row);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export function flattenEntityWrapper(obj: Row): Row {
  const wrapperKey = Object.keys(obj).find(
    (k) =>
      (k === "u" || k === "q" || k === "p" || k === "a" || k === "e") &&
      obj[k] != null &&
      typeof obj[k] === "object" &&
      !Array.isArray(obj[k]),
  );
  if (!wrapperKey) return obj;
  const inner = obj[wrapperKey] as Row;
  const rest: Row = {};
  for (const [k, v] of Object.entries(obj)) if (k !== wrapperKey) rest[k] = v;
  return { ...sanitize(inner), ...rest };
}

export interface AdminListOpts {
  prefix: string;
  cfg: EntityConfig;
  detailCypher: string;
  patchSchema?: ReturnType<typeof t.Object>;
  onPatch?: (db: GraphClient, id: number, body: Record<string, unknown>) => Promise<Row>;
  createSchema?: ReturnType<typeof t.Object>;
  onCreate?: (db: GraphClient, body: Record<string, unknown>) => Promise<Row>;
}

const listQuerySchema = t.Object({
  f: t.Optional(t.Array(t.String())),
  query: t.Optional(t.String()),
  page: t.Optional(t.Number({ minimum: 1 })),
  pageSize: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
  sortBy: t.Optional(t.String()),
  sortDir: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
});

export function makeAdminListRoutes(o: AdminListOpts) {
  return new Elysia({ name: `admin-${o.cfg.label.toLowerCase()}`, prefix: o.prefix })
    .get(
      "/",
      async ({ query }) => {
        if (query.query && query.f && query.f.length > 0)
          throw new AppError(400, "INVALID_FILTER", "use either f= or query=, not both");
        const filters = query.query
          ? parseComplexQuery(query.query, o.cfg)
          : parseSimple(query.f, o.cfg);
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const built = buildListQueries(o.cfg, {
          filters,
          sortBy: query.sortBy,
          sortDir: query.sortDir,
          page,
          pageSize,
        });
        const [items, countRows] = await Promise.all([
          dbClient.run(built.listCypher, built.params),
          dbClient.run(built.countCypher, built.params),
        ]);
        return {
          items: items.map(toDto),
          total: (countRows[0]?.total as number) ?? 0,
          page,
          pageSize,
        };
      },
      { query: listQuerySchema },
    )
    .get(
      "/:id",
      async ({ params }) => {
        const rows = await dbClient.run(o.detailCypher, { id: Number(params.id) });
        if (rows.length === 0) throw new AppError(404, "NOT_FOUND", "not found");
        return flattenEntityWrapper(toDto(rows[0]!));
      },
      { params: t.Object({ id: t.Numeric() }) },
    )
    .patch(
      "/:id",
      async ({ params, body }) => {
        if (!o.patchSchema) throw new AppError(405, "NOT_ALLOWED", "patch not supported");
        if (o.onPatch) return toDto(await o.onPatch(dbClient, Number(params.id), body as Record<string, unknown>));
        const rows = await dbClient.run(
          `MATCH (n:\`${o.cfg.label}\` {id: $id}) SET n += $props, n.updated_at = $now RETURN n {.*}`,
          { id: Number(params.id), props: body, now: new Date().toISOString() },
        );
        if (rows.length === 0) throw new AppError(404, "NOT_FOUND", "not found");
        return toDto(rows[0]!);
      },
      { params: t.Object({ id: t.Numeric() }), body: o.patchSchema ?? t.Object({}) },
    )
    .post(
      "/",
      async ({ body }) => {
        if (!o.createSchema || !o.onCreate) throw new AppError(405, "NOT_ALLOWED", "create not supported");
        return toDto(await o.onCreate(dbClient, body as Record<string, unknown>));
      },
      { body: o.createSchema ?? t.Object({}) },
    );
}
