import { Elysia, t } from "elysia";
import { latLngToCell } from "h3-js";
import { AppError } from "../../common/errors";
import { bus, type GameEvent, type ProgressReport } from "../../common/events";
import { logEvent } from "../../common/log";
import { db } from "../../common/db";
import { authPlugin } from "../../plugins/auth";
import { toLatLon } from "../../common/point";

export const H3_RESOLUTION = 9;

const posBody = t.Object({
  latitude: t.Number({ minimum: -90, maximum: 90 }),
  longitude: t.Number({ minimum: -180, maximum: 180 }),
});

export const geoModule = new Elysia({ name: "geo" })
  .use(authPlugin)
  .post(
    "/me/ping",
    async ({ body, auth }) => {
      const userId = auth!.userId;
      const h3Index = latLngToCell(body.latitude, body.longitude, H3_RESOLUTION);
      const now = new Date().toISOString();
      const posParams = { lat: body.latitude, lon: body.longitude };

      const result = await db.tx(async (tx) => {
        const prevRows = await tx.run("MATCH (u:USER {id: $id}) RETURN u.last_cell AS lastCell", {
          id: userId,
        });
        if (prevRows.length === 0) throw new AppError(401, "USER_NOT_FOUND", "user not found");
        const isNewCell = prevRows[0]!.lastCell !== h3Index;

        const upd = await tx.run(
          `MATCH (u:USER {id: $id})
           WITH u, point.distance(
             coalesce(u.last_position, point({latitude: $lat, longitude: $lon})),
             point({latitude: $lat, longitude: $lon})
           ) / 1000.0 AS deltaKm
           SET u.last_position = point({latitude: $lat, longitude: $lon}),
               u.last_cell = $h3,
               u.total_distance_km = coalesce(u.total_distance_km, 0) + deltaKm,
               u.exp = coalesce(u.exp, 0) + $expDelta
           RETURN u.total_distance_km AS totalDistanceKm, u.exp AS exp, deltaKm AS deltaKm`,
          { id: userId, h3: h3Index, expDelta: isNewCell ? 1 : 0, ...posParams },
        );

        if (isNewCell) {
          await tx.run(
            `MATCH (u:USER {id: $id})
             MERGE (c:CELL {index: $h3}) ON CREATE SET c.resolution = $res
             MERGE (u)-[v:VISITED]->(c)
             ON CREATE SET v.first_visited = $now, v.last_visited = $now, v.visit_count = 1
             ON MATCH SET v.last_visited = $now, v.visit_count = v.visit_count + 1`,
            { id: userId, h3: h3Index, res: H3_RESOLUTION, now },
          );
        }

        const newPois = await tx.run(
          `MATCH (u:USER {id: $id}), (c:CELL {index: $h3})-[:CONTAINS]->(p:POI)
           WHERE NOT EXISTS { (u)-[:DISCOVERED]->(p) }
           RETURN p.id AS id, p.name AS name, p.type AS type, p.description AS description,
                  p.tags AS tags, p.location AS location`,
          { id: userId, h3: h3Index },
        );
        for (const p of newPois) {
          await tx.run(
            `MATCH (u:USER {id: $id}), (p:POI {id: $poiId})
             MERGE (u)-[d:DISCOVERED]->(p) ON CREATE SET d.timestamp = $now`,
            { id: userId, poiId: p.id, now },
          );
        }
        if (newPois.length > 0) {
          const expUpd = await tx.run(
            `MATCH (u:USER {id: $id}) SET u.exp = coalesce(u.exp, 0) + $poiExp RETURN u.exp AS exp`,
            { id: userId, poiExp: newPois.length * 5 },
          );
          return {
            isNewCell,
            deltaKm: upd[0]!.deltaKm as number,
            totalDistanceKm: upd[0]!.totalDistanceKm,
            exp: expUpd[0]!.exp,
            newPois,
          };
        }

        return {
          isNewCell,
          deltaKm: upd[0]!.deltaKm as number,
          totalDistanceKm: upd[0]!.totalDistanceKm,
          exp: upd[0]!.exp,
          newPois,
        };
      });

      const events: GameEvent[] = [];
      if (result.isNewCell) {
        events.push({
          type: "user:visited_cell",
          userId,
          cellIndex: h3Index,
          isNewCell: true,
          latitude: body.latitude,
          longitude: body.longitude,
        });
      }
      for (const p of result.newPois) {
        events.push({
          type: "user:discovered_poi",
          userId,
          poiId: p.id as number,
          poiName: p.name as string,
          poiType: p.type as string,
        });
      }

      if (result.isNewCell || result.newPois.length > 0) {
        await db.tx(async (tx) => {
          if (result.isNewCell) {
            await logEvent(tx, {
              type: "CELL_VISITED",
              userId,
              entityType: "User",
              priority: "Low",
              description: `User ${userId} entered cell ${h3Index}`,
              details: { cell: h3Index, latitude: body.latitude, longitude: body.longitude, distanceKm: +result.deltaKm.toFixed(3) },
            });
          }
          for (const p of result.newPois) {
            await logEvent(tx, {
              type: "POI_DISCOVERED",
              userId,
              entityId: p.id as number,
              entityType: "POI",
              priority: "Low",
              description: `User ${userId} discovered ${p.name}`,
              details: { poiId: p.id, poiName: p.name, poiType: p.type, cell: h3Index },
            });
          }
        });
      }

      const reports = await bus.emit(events);
      return {
        h3: h3Index,
        newCell: result.isNewCell,
        distanceDeltaKm: +result.deltaKm.toFixed(3),
        totalDistanceKm: result.totalDistanceKm,
        exp: result.exp,
        newPois: result.newPois.map((p) => ({ ...p, location: toLatLon(p.location) })),
        quests: collectQuests(reports),
        achievements: collectAchievements(reports),
      };
    },
    { body: posBody },
  )
  .get("/map/visible", async ({ auth }) => {
    const rows = await db.run(
      `MATCH (u:USER {id: $id})-[:VISITED]->(c:CELL)-[:CONTAINS]->(p:POI)
       OPTIONAL MATCH (u)-[d:DISCOVERED]->(p)
       RETURN p.id AS id, p.name AS name, p.type AS type, p.description AS description,
              p.tags AS tags, p.location AS location,
              d IS NOT NULL AS discovered, d.timestamp AS discoveredAt
       ORDER BY p.id`,
      { id: auth!.userId },
    );
    return rows.map((r) => ({ ...r, location: toLatLon(r.location) }));
  })
  .get(
    "/poi/:id",
    async ({ params, auth }) => {
      const rows = await db.run(
        `MATCH (p:POI {id: $poiId})
         OPTIONAL MATCH (u:USER {id: $userId})-[d:DISCOVERED]->(p)
         RETURN p {.*, discoveredAt: d.timestamp}`,
        { poiId: Number(params.id), userId: auth!.userId },
      );
      const poi = rows[0]?.p as Record<string, unknown> | undefined;
      if (!poi) throw new AppError(404, "NOT_FOUND", "poi not found");
      if (poi.location) poi.location = toLatLon(poi.location);
      return poi;
    },
    { params: t.Object({ id: t.Numeric() }) },
  );

function collectQuests(reports: ProgressReport[]): unknown[] {
  const byId = new Map<number, unknown>();
  for (const r of reports) {
    if (r.kind !== "quest_progress" && r.kind !== "quest_completed") continue;
    byId.set((r as { questId: number }).questId, {
      questId: (r as { questId: number }).questId,
      name: r.name,
      status: r.kind === "quest_completed" ? "COMPLETED" : "IN_PROGRESS",
      progress: r.kind === "quest_progress" ? (r as { progress: string }).progress : null,
    });
  }
  return [...byId.values()];
}

function collectAchievements(reports: ProgressReport[]): unknown[] {
  const byId = new Map<number, unknown>();
  for (const r of reports) {
    if (r.kind !== "achievement_unlocked") continue;
    byId.set((r as { achievementId: number }).achievementId, {
      achievementId: (r as { achievementId: number }).achievementId,
      name: r.name,
    });
  }
  return [...byId.values()];
}
