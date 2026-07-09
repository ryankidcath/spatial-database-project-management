import centroid from "@turf/centroid";
import transformRotate from "@turf/transform-rotate";
import type { Geometry, Position } from "geojson";
import { feature } from "@turf/helpers";
import { asGeometry } from "@/lib/workspace-map-geo-utils";
import {
  geometryKindFromStored,
  translateStoredGeometry,
} from "@/lib/workspace-map-translate-geom";

export type MoveGeomTransform = {
  deltaLng: number;
  deltaLat: number;
  rotationDeg: number;
};

export const EMPTY_MOVE_GEOM_TRANSFORM: MoveGeomTransform = {
  deltaLng: 0,
  deltaLat: 0,
  rotationDeg: 0,
};

function storedToFeature(stored: unknown): GeoJSON.Feature | null {
  if (!stored || typeof stored !== "object") return null;
  const obj = stored as { type?: string; geometry?: Geometry };
  if (obj.type === "Feature" && obj.geometry) {
    return stored as GeoJSON.Feature;
  }
  const geom = asGeometry(stored);
  if (!geom) return null;
  return feature(geom);
}

/** Centroid [lng, lat] dari geometri tersimpan. */
export function centroidOfStoredGeometry(stored: unknown): Position | null {
  const f = storedToFeature(stored);
  if (!f) return null;
  try {
    const c = centroid(f);
    const coords = c.geometry.coordinates;
    if (
      coords.length >= 2 &&
      Number.isFinite(coords[0]) &&
      Number.isFinite(coords[1])
    ) {
      return [coords[0]!, coords[1]!];
    }
  } catch {
    /* invalid */
  }
  return null;
}

/** Titik tunggal tidak bisa diputar secara bermakna. */
export function supportsMoveGeomRotation(stored: unknown): boolean {
  const kind = geometryKindFromStored(stored);
  return kind === "polygon" || kind === "linestring";
}

/** Rotasi Feature/Geometry mentah sekitar pivot (derajat, CCW). */
export function rotateStoredGeometry(
  stored: unknown,
  rotationDeg: number,
  pivot: Position
): unknown | null {
  if (Math.abs(rotationDeg) < 1e-12) return stored;
  const f = storedToFeature(stored);
  if (!f) return null;
  try {
    const rotated = transformRotate(f, rotationDeg, {
      pivot: [pivot[0]!, pivot[1]!],
      mutate: false,
    });
    if (f.type === "Feature" && (stored as { type?: string }).type === "Feature") {
      return {
        ...(stored as GeoJSON.Feature),
        geometry: rotated.geometry,
      };
    }
    return rotated.geometry ?? rotated;
  } catch {
    return null;
  }
}

/**
 * Terapkan translasi lalu rotasi sekitar centroid hasil translasi.
 */
export function applyMoveGeomTransform(
  stored: unknown,
  transform: MoveGeomTransform
): unknown | null {
  const { deltaLng, deltaLat, rotationDeg } = transform;
  const hasTranslate =
    Math.abs(deltaLng) > 1e-12 || Math.abs(deltaLat) > 1e-12;
  const hasRotate = Math.abs(rotationDeg) > 1e-12;

  if (!hasTranslate && !hasRotate) return stored;

  let current = stored;
  if (hasTranslate) {
    current = translateStoredGeometry(current, deltaLng, deltaLat);
    if (!current) return null;
  }

  if (!hasRotate) return current;

  const pivot = centroidOfStoredGeometry(current);
  if (!pivot) return current;

  return rotateStoredGeometry(current, rotationDeg, pivot);
}

/** Normalisasi sudut ke rentang (-180, 180]. */
export function normalizeRotationDeg(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}
