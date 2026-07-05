import type { MapFootprint } from "@/app/workspace-map";

function walkCoordsForCentroid(
  coords: unknown,
  acc: { sumLat: number; sumLng: number; count: number }
): void {
  if (!Array.isArray(coords)) return;
  if (
    coords.length >= 2 &&
    typeof coords[0] === "number" &&
    typeof coords[1] === "number"
  ) {
    const lng = coords[0];
    const lat = coords[1];
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      acc.sumLat += lat;
      acc.sumLng += lng;
      acc.count += 1;
    }
    return;
  }
  for (const c of coords) {
    walkCoordsForCentroid(c, acc);
  }
}

function centroidFromGeometry(value: unknown): { lat: number; lng: number } | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as { type?: string; coordinates?: unknown };
  if (!obj.type || obj.coordinates === undefined) return null;

  const acc = { sumLat: 0, sumLng: 0, count: 0 };
  walkCoordsForCentroid(obj.coordinates, acc);
  if (acc.count === 0) return null;
  return { lat: acc.sumLat / acc.count, lng: acc.sumLng / acc.count };
}

function centroidFromGeoJson(value: unknown): { lat: number; lng: number } | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as {
    type?: string;
    geometry?: unknown;
    features?: unknown[];
  };

  if (obj.type === "Feature") {
    return centroidFromGeometry(obj.geometry);
  }
  if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
    const acc = { sumLat: 0, sumLng: 0, count: 0 };
    for (const f of obj.features) {
      const c = centroidFromGeoJson(f);
      if (c) {
        acc.sumLat += c.lat;
        acc.sumLng += c.lng;
        acc.count += 1;
      }
    }
    if (acc.count === 0) return null;
    return { lat: acc.sumLat / acc.count, lng: acc.sumLng / acc.count };
  }
  return centroidFromGeometry(value);
}

export function footprintCentroid(
  fp: MapFootprint
): { lat: number; lng: number } | null {
  return centroidFromGeoJson(fp.geojson);
}

export function footprintRowKey(tableId: string, rowId: string): string {
  return `${tableId}:${rowId}`;
}
