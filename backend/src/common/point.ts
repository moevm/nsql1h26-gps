export interface LatLon {
  latitude: number;
  longitude: number;
}

export function toLatLon(v: unknown): LatLon | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.latitude === "number" && typeof o.longitude === "number") {
    return { latitude: o.latitude, longitude: o.longitude };
  }
  if (typeof o.x === "number" && typeof o.y === "number") {
    return { latitude: o.y, longitude: o.x };
  }
  return null;
}

export const POINT_CYPHER = "point({latitude: $lat, longitude: $lon})";
