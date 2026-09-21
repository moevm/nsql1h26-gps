import { AppError } from "./errors";
import { toLatLon } from "./point";
import { IMPORTABLE_LABELS, UNIQUE_KEYS } from "./cypher/entity-configs";
import { validateTriggerRules } from "../modules/quests/triggers";
import type { GraphClient } from "./db";

export interface DumpRef {
  label: string;
  key: Record<string, unknown>;
}
export interface DumpNode {
  label: string;
  key: Record<string, unknown>;
  properties: Record<string, unknown>;
}
export interface DumpRelationship {
  type: string;
  from: DumpRef;
  to: DumpRef;
  properties: Record<string, unknown>;
}
export interface GraphDump {
  meta?: Record<string, unknown>;
  nodes: DumpNode[];
  relationships: DumpRelationship[];
}

export interface ExportOptions {
  scope?: string[];
  dateRange?: { from: string; to: string };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function validateRef(ref: unknown, what: string): DumpRef {
  if (!isRecord(ref) || typeof ref.label !== "string" || !isRecord(ref.key))
    throw new AppError(400, "INVALID_DUMP", `${what} must be {label, key}`);
  const keys = UNIQUE_KEYS[ref.label];
  if (!keys || !(IMPORTABLE_LABELS as readonly string[]).includes(ref.label))
    throw new AppError(400, "INVALID_DUMP", `unknown label: ${ref.label}`);
  for (const k of keys) if (!(k in ref.key)) throw new AppError(400, "INVALID_DUMP", `${what}.key missing ${k}`);
  return { label: ref.label, key: ref.key };
}

export function parseDump(raw: unknown): GraphDump {
  if (!isRecord(raw) || !Array.isArray(raw.nodes) || !Array.isArray(raw.relationships))
    throw new AppError(400, "INVALID_DUMP", "dump must be {nodes: [], relationships: []}");

  const nodes: DumpNode[] = raw.nodes.map((n, i) => {
    const what = `nodes[${i}]`;
    if (!isRecord(n)) throw new AppError(400, "INVALID_DUMP", `${what} must be an object`);
    const node = validateRef(n, what);
    if (!isRecord(n.properties)) throw new AppError(400, "INVALID_DUMP", `${what}.properties must be an object`);
    return { ...node, properties: n.properties };
  });

  const relationships: DumpRelationship[] = raw.relationships.map((r, i) => {
    const what = `relationships[${i}]`;
    if (!isRecord(r) || typeof r.type !== "string")
      throw new AppError(400, "INVALID_DUMP", `${what} must be {type, from, to}`);
    return {
      type: r.type,
      from: validateRef(r.from, `${what}.from`),
      to: validateRef(r.to, `${what}.to`),
      properties: isRecord(r.properties) ? r.properties : {},
    };
  });

  for (const n of nodes) {
    if ((n.label === "QUEST" || n.label === "ACHIEVEMENT") && typeof n.properties.trigger_rules === "string") {
      let rules: unknown;
      try {
        rules = JSON.parse(n.properties.trigger_rules);
      } catch {
        throw new AppError(400, "INVALID_DUMP", `${n.label} trigger_rules is not valid JSON`);
      }
      validateTriggerRules(rules);
    }
  }

  return { meta: isRecord(raw.meta) ? raw.meta : undefined, nodes, relationships };
}

function keyParams(key: Record<string, unknown>, prefix = "key"): { cypher: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = {};
  const parts = Object.entries(key).map(([k, v], i) => {
    params[`${prefix}${i}`] = v;
    return `\`${k}\`: $${prefix}${i}`;
  });
  return { cypher: parts.join(", "), params };
}

export async function importDump(
  client: GraphClient,
  dump: GraphDump,
): Promise<{ nodes: number; relationships: number }> {
  const prepared: DumpNode[] = [];
  for (const n of dump.nodes) {
    const properties = { ...n.properties };
    if ((n.label === "USER" || n.label === "ADMIN") && typeof properties.password === "string") {
      properties.password_hash = await Bun.password.hash(properties.password);
      delete properties.password;
    }
    let pointProp: { key: string; latitude: number; longitude: number } | null = null;
    for (const key of ["location", "last_position"]) {
      const v = properties[key];
      if (v && typeof v === "object" && typeof (v as Record<string, unknown>).latitude === "number") {
        const ll = v as { latitude: number; longitude: number };
        pointProp = { key, latitude: ll.latitude, longitude: ll.longitude };
        delete properties[key];
      }
    }
    prepared.push({ ...n, properties, pointProp } as (DumpNode & { pointProp: typeof pointProp }));
  }

  await client.tx(async (tx) => {
    for (const n of prepared as (DumpNode & { pointProp: { key: string; latitude: number; longitude: number } | null })[]) {
      const key = keyParams(n.key);
      await tx.run(
        `MERGE (n:\`${n.label}\` { ${key.cypher} }) SET n += $props`,
        { ...key.params, props: n.properties },
      );
      if (n.pointProp) {
        await tx.run(
          `MATCH (n:\`${n.label}\` { ${key.cypher} })
           SET n.\`${n.pointProp.key}\` = point({latitude: $lat, longitude: $lon})`,
          { ...key.params, lat: n.pointProp.latitude, lon: n.pointProp.longitude },
        );
      }
    }
    for (const r of dump.relationships) {
      const from = keyParams(r.from.key, "fk");
      const to = keyParams(r.to.key, "tk");
      await tx.run(
        `MATCH (a:\`${r.from.label}\` { ${from.cypher} })
         MATCH (b:\`${r.to.label}\` { ${to.cypher} })
         MERGE (a)-[rel:\`${r.type}\`]->(b) SET rel += $relProps`,
        { ...from.params, ...to.params, relProps: r.properties },
      );
    }
  });

  return { nodes: prepared.length, relationships: dump.relationships.length };
}

function normalizePropValue(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.year === "number" && typeof o.month === "number") {
      try {
        return String(v);
      } catch {
        return v;
      }
    }
  }
  return v;
}

function normalizeProps(props: Record<string, unknown>): Record<string, unknown> {
  for (const [k, v] of Object.entries(props)) props[k] = normalizePropValue(v);
  return props;
}

export function buildKey(label: string, properties: Record<string, unknown>): Record<string, unknown> {
  const keys = UNIQUE_KEYS[label];
  if (!keys) return {};
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = properties[k];
  return out;
}

export async function exportDump(client: GraphClient, opts: ExportOptions = {}): Promise<GraphDump> {
  const labels = (opts.scope && opts.scope.length > 0 ? opts.scope : [...IMPORTABLE_LABELS]).filter((l) =>
    (IMPORTABLE_LABELS as readonly string[]).includes(l),
  );

  const dateFilter = (prop: string) =>
    opts.dateRange
      ? `WHERE n.\`${prop}\` >= $dateFrom AND n.\`${prop}\` <= $dateTo`
      : "";
  const dateParams = opts.dateRange ? { dateFrom: opts.dateRange.from, dateTo: opts.dateRange.to } : {};

  const nodes: DumpNode[] = [];
  const include: Set<string> = new Set();
  for (const label of labels) {
    const prop = label === "EVENT_LOG" ? "timestamp" : label === "CELL" ? "" : "created_at";
    const rows = await client.run(`MATCH (n:\`${label}\`) ${prop ? dateFilter(prop) : ""} RETURN n {.*} AS props`, {
      ...dateParams,
    });
    for (const row of rows) {
      const properties = normalizeProps(row.props as Record<string, unknown>);
      for (const pkey of ["location", "last_position"]) {
        if (properties[pkey] && typeof properties[pkey] === "object") {
          properties[pkey] = toLatLon(properties[pkey]);
        }
      }
      const key = buildKey(label, properties);
      nodes.push({ label, key, properties });
      include.add(`${label}:${JSON.stringify(key)}`);
    }
  }

  const relationships: DumpRelationship[] = [];
  if (labels.length > 0) {
    const rows = await client.run(
      `MATCH (a)-[r]->(b)
       WHERE labels(a)[0] IN $labels AND labels(b)[0] IN $labels
       RETURN type(r) AS t, labels(a)[0] AS al, labels(b)[0] AS bl,
              a {.*} AS ap, b {.*} AS bp, r {.*} AS rp`,
      { labels },
    );
    for (const row of rows) {
      const al = row.al as string;
      const bl = row.bl as string;
      const ap = row.ap as Record<string, unknown>;
      const bp = row.bp as Record<string, unknown>;
      const aRef = `${al}:${JSON.stringify(buildKey(al, ap))}`;
      const bRef = `${bl}:${JSON.stringify(buildKey(bl, bp))}`;

      if (include.has(aRef) && include.has(bRef)) {
        relationships.push({
          type: row.t as string,
          from: { label: al, key: buildKey(al, ap) },
          to: { label: bl, key: buildKey(bl, bp) },
          properties: row.rp as Record<string, unknown>,
        });
      }
    }
  }

  return {
    meta: { format: "json", version: 1, exportedAt: new Date().toISOString(), scope: labels, dateRange: opts.dateRange ?? null },
    nodes,
    relationships,
  };
}
