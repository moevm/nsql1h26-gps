import { Elysia, t } from "elysia";
import { latLngToCell } from "h3-js";
import { AppError } from "../../../common/errors";
import { nextId } from "../../../common/ids";
import { logEvent } from "../../../common/log";
import { ENTITY_CONFIGS } from "../../../common/cypher/entity-configs";
import { makeAdminListRoutes } from "../../../common/cypher/list-route";
import { toLatLon } from "../../../common/point";
import { H3_RESOLUTION } from "../../geo";

const DETAIL = `
  MATCH (p:POI {id: $id})
  OPTIONAL MATCH (c:CELL)-[:CONTAINS]->(p)
  OPTIONAL MATCH (e:EVENT_LOG {entity_id: p.id, entity_type: 'POI'})
  RETURN p {.*, cellIndex: c.index},
         collect(DISTINCT CASE WHEN e IS NULL THEN NULL
               ELSE {id: e.id, type: e.type, timestamp: e.timestamp, priority: e.priority, description: e.description} END)[..20] AS relatedLogs
`;

const poiCreateSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  type: t.String({ minLength: 1, maxLength: 50 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  tags: t.Optional(t.String({ maxLength: 500 })),
  location: t.Object({
    latitude: t.Number({ minimum: -90, maximum: 90 }),
    longitude: t.Number({ minimum: -180, maximum: 180 }),
  }),
  note: t.Optional(t.String({ maxLength: 2000 })),
});

export const adminPoisModule = new Elysia({ name: "admin-pois" })
    .use(
  makeAdminListRoutes({
    prefix: "/admin/pois",
    cfg: ENTITY_CONFIGS.pois,
    detailCypher: DETAIL,
    createSchema: poiCreateSchema,
    onCreate: async (client, body) => {
      const now = new Date().toISOString();
      const lat = (body.location as { latitude: number; longitude: number }).latitude;
      const lon = (body.location as { latitude: number; longitude: number }).longitude;
      const h3Index = latLngToCell(lat, lon, H3_RESOLUTION);
      const id = await client.tx(async (tx) => {
        const id = await nextId(tx, "POI");
        await tx.run(
          `CREATE (p:POI {id: $id, name: $name, type: $type, description: $desc, tags: $tags,
                          location: point({latitude: $lat, longitude: $lon}),
                          note: $note, created_at: $now, updated_at: $now})
           MERGE (c:CELL {index: $h3}) ON CREATE SET c.resolution = $res
           MERGE (c)-[:CONTAINS]->(p)
           RETURN p.id AS id`,
          {
            id,
            name: body.name,
            type: body.type,
            desc: body.description ?? null,
            tags: body.tags ?? null,
            lat,
            lon,
            note: body.note ?? null,
            now,
            h3: h3Index,
            res: H3_RESOLUTION,
          },
        );
        return id;
      });
      await client.tx((tx) =>
        logEvent(tx, {
          type: "POI_CREATED",
          entityId: id,
          entityType: "POI",
          priority: "Medium",
          description: `POI created: ${body.name}`,
          details: { poiId: id, poiName: body.name, cell: h3Index },
        }),
      );
      return { id, ...body, cellIndex: h3Index };
    },
    patchSchema: t.Partial(poiCreateSchema) as any,
    onPatch: async (client, id, body) => {
      const now = new Date().toISOString();
      const props: Record<string, unknown> = { updated_at: now };
      for (const k of ["name", "type", "description", "tags", "note"]) {
        if (body[k] != null) props[k] = body[k];
      }
      const moveCell = body.location != null;

      await client.tx(async (tx) => {
        const rows = await tx.run(`MATCH (p:POI {id: $id}) SET p += $props RETURN p.id AS id`, { id, props });
        if (rows.length === 0) throw new AppError(404, "NOT_FOUND", "poi not found");

        if (moveCell) {
          const cur = await tx.run(`MATCH (p:POI {id: $id}) RETURN p.location AS location`, { id });
          const loc = (body.location ?? toLatLon(cur[0]?.location)) as { latitude: number; longitude: number };
          const h3Index = latLngToCell(loc.latitude, loc.longitude, H3_RESOLUTION);
          await tx.run(
            `MATCH (p:POI {id: $id})
             SET p.location = point({latitude: $lat, longitude: $lon})
             WITH p
             OPTIONAL MATCH (old:CELL)-[r:CONTAINS]->(p) DELETE r
             WITH p
             MERGE (c:CELL {index: $h3}) ON CREATE SET c.resolution = $res
             MERGE (c)-[:CONTAINS]->(p)`,
            { id, lat: loc.latitude, lon: loc.longitude, h3: h3Index, res: H3_RESOLUTION },
          );
        }
      });
      await client.tx((tx) =>
        logEvent(tx, {
          type: "POI_UPDATED",
          entityId: id,
          entityType: "POI",
          priority: "Medium",
          description: `POI updated: ${id}`,
          details: { poiId: id, changes: Object.keys(body) },
        }),
      );
      const rows = await client.run(`MATCH (p:POI {id: $id}) RETURN p {.*}`, { id });
      return rows[0]!.p as Record<string, unknown>;
    },
  }),
);
