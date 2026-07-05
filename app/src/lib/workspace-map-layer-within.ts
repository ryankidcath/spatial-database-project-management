import booleanIntersects from "@turf/boolean-intersects";
import booleanWithin from "@turf/boolean-within";
import buffer from "@turf/buffer";
import centroid from "@turf/centroid";
import { point } from "@turf/helpers";
import type { MapFootprint } from "@/app/workspace-map";
import {
  filterFootprintsByVirtualTable,
  footprintToTurfFeatures,
  isPolygonalGeometry,
} from "./workspace-map-geo-utils";

export type WithinQueryHit = {
  footprintId: string;
  label: string;
  virtualRowId?: string;
};

export type BufferQueryParams = {
  lat: number;
  lng: number;
  radiusMeters: number;
};

/**
 * G-D2 — Fitur dari lapisan sumber yang centroid-nya berada dalam buffer titik.
 */
export function findFootprintsWithinBuffer(
  footprints: MapFootprint[],
  sourceTableId: string,
  params: BufferQueryParams
): WithinQueryHit[] {
  const source = filterFootprintsByVirtualTable(footprints, sourceTableId);
  if (source.length === 0 || params.radiusMeters <= 0) return [];

  let zone: GeoJSON.Feature | null = null;
  try {
    const buffered = buffer(point([params.lng, params.lat]), params.radiusMeters, {
      units: "meters",
      steps: 64,
    });
    zone = buffered ?? null;
  } catch {
    return [];
  }
  if (!zone) return [];

  const hits: WithinQueryHit[] = [];
  for (const fp of source) {
    const features = footprintToTurfFeatures(fp);
    let matched = false;
    for (const f of features) {
      if (!f.geometry) continue;
      try {
        if (booleanIntersects(f, zone)) {
          matched = true;
          break;
        }
      } catch {
        /* invalid geometry */
      }
    }
    if (matched) {
      hits.push({
        footprintId: fp.id,
        label: fp.label,
        virtualRowId: fp.virtualRowId,
      });
    }
  }
  return hits;
}

/**
 * G-D2 — Fitur sumber yang seluruh geometrinya berada di dalam poligon referensi (union per fitur referensi).
 */
export function findFootprintsWithinReferenceLayer(
  footprints: MapFootprint[],
  sourceTableId: string,
  referenceTableId: string
): WithinQueryHit[] {
  const source = filterFootprintsByVirtualTable(footprints, sourceTableId);
  const reference = filterFootprintsByVirtualTable(footprints, referenceTableId);
  if (source.length === 0 || reference.length === 0) return [];

  const refFeatures = reference.flatMap(footprintToTurfFeatures).filter(
    (f) => f.geometry && isPolygonalGeometry(f.geometry)
  );
  if (refFeatures.length === 0) return [];

  const hits: WithinQueryHit[] = [];
  for (const fp of source) {
    const srcFeatures = footprintToTurfFeatures(fp).filter(
      (f) => f.geometry && isPolygonalGeometry(f.geometry)
    );
    if (srcFeatures.length === 0) continue;

    let inside = false;
    outer: for (const sf of srcFeatures) {
      for (const rf of refFeatures) {
        try {
          if (booleanWithin(sf, rf)) {
            inside = true;
            break outer;
          }
        } catch {
          try {
            const c = centroid(sf);
            if (booleanWithin(c, rf)) {
              inside = true;
              break outer;
            }
          } catch {
            /* skip */
          }
        }
      }
    }

    if (inside) {
      hits.push({
        footprintId: fp.id,
        label: fp.label,
        virtualRowId: fp.virtualRowId,
      });
    }
  }
  return hits;
}
