import type { Geometry, Position } from "geojson";
import { asGeometry } from "@/lib/workspace-map-geo-utils";

function translatePosition(
  pos: Position,
  dLng: number,
  dLat: number
): Position {
  const lng = Number(pos[0]);
  const lat = Number(pos[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return pos;
  const out: Position = [lng + dLng, lat + dLat];
  if (pos.length > 2 && Number.isFinite(pos[2])) {
    out[2] = pos[2];
  }
  return out;
}

/** Geser geometri WGS84 sebesar delta derajat (lng, lat). */
export function translateGeometry(
  geometry: Geometry,
  dLng: number,
  dLat: number
): Geometry {
  switch (geometry.type) {
    case "Point":
      return {
        type: "Point",
        coordinates: translatePosition(geometry.coordinates, dLng, dLat),
      };
    case "LineString":
      return {
        type: "LineString",
        coordinates: geometry.coordinates.map((c) =>
          translatePosition(c, dLng, dLat)
        ),
      };
    case "Polygon":
      return {
        type: "Polygon",
        coordinates: geometry.coordinates.map((ring) =>
          ring.map((c) => translatePosition(c, dLng, dLat))
        ),
      };
    case "MultiPoint":
      return {
        type: "MultiPoint",
        coordinates: geometry.coordinates.map((c) =>
          translatePosition(c, dLng, dLat)
        ),
      };
    case "MultiLineString":
      return {
        type: "MultiLineString",
        coordinates: geometry.coordinates.map((line) =>
          line.map((c) => translatePosition(c, dLng, dLat))
        ),
      };
    case "MultiPolygon":
      return {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map((poly) =>
          poly.map((ring) => ring.map((c) => translatePosition(c, dLng, dLat)))
        ),
      };
    default:
      return geometry;
  }
}

/** Geser nilai kolom geometry tersimpan (Feature atau Geometry mentah). */
export function translateStoredGeometry(
  stored: unknown,
  dLng: number,
  dLat: number
): unknown | null {
  if (!stored || typeof stored !== "object") return null;
  const obj = stored as {
    type?: string;
    geometry?: Geometry;
    properties?: Record<string, unknown>;
  };

  if (obj.type === "Feature" && obj.geometry) {
    return {
      ...obj,
      geometry: translateGeometry(obj.geometry, dLng, dLat),
      properties: obj.properties ? { ...obj.properties } : {},
    };
  }

  const geom = asGeometry(stored);
  if (!geom) return null;
  return translateGeometry(geom, dLng, dLat);
}

/** Parse slug kolom geometri dari id footprint `vtable:rowId:geomSlug`. */
export function geometryColumnSlugFromFootprintId(
  footprintId: string
): string | null {
  const parts = footprintId.split(":");
  if (parts.length < 3 || parts[0] !== "vtable") return null;
  return parts.slice(2).join(":") || null;
}

export type GeometryKind = "point" | "linestring" | "polygon";

export function geometryKindFromStored(stored: unknown): GeometryKind | null {
  if (!stored || typeof stored !== "object") return null;
  const obj = stored as { type?: string; geometry?: { type?: string } };
  const t =
    obj.type === "Feature" ? obj.geometry?.type : obj.type;
  if (t === "Point") return "point";
  if (t === "LineString" || t === "MultiLineString") return "linestring";
  if (t === "Polygon" || t === "MultiPolygon") return "polygon";
  return null;
}

/** Jarak translasi perkiraan (meter) dari delta derajat di titik lintang rata-rata. */
export function approximateTranslationMeters(
  dLat: number,
  dLng: number,
  atLat: number
): number {
  const latRad = (atLat * Math.PI) / 180;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos(latRad);
  const dy = dLat * mPerDegLat;
  const dx = dLng * mPerDegLng;
  return Math.hypot(dx, dy);
}
