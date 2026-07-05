import booleanIntersects from "@turf/boolean-intersects";
import { feature as turfFeature } from "@turf/helpers";
import type { MapFootprint } from "@/app/workspace-map";

function footprintToTurfFeatures(fp: MapFootprint): GeoJSON.Feature[] {
  const geojson = fp.geojson;
  if (!geojson || typeof geojson !== "object") return [];
  const g = geojson as {
    type?: string;
    features?: GeoJSON.Feature[];
    geometry?: GeoJSON.Geometry;
    coordinates?: unknown;
  };
  if (g.type === "FeatureCollection" && Array.isArray(g.features)) {
    return g.features.filter((f) => f.geometry != null);
  }
  if (g.type === "Feature" && g.geometry) {
    return [geojson as GeoJSON.Feature];
  }
  if (g.type && g.coordinates) {
    return [
      turfFeature(g as unknown as GeoJSON.Geometry, { _fpId: fp.id }),
    ];
  }
  return [];
}

/** G-B5 — ID footprint existing yang bertabrakan dengan pratinjau impor. */
export function computeImportOverlapFootprintIds(
  previewLayers: MapFootprint[],
  existingLayers: MapFootprint[]
): Set<string> {
  const overlap = new Set<string>();
  if (previewLayers.length === 0 || existingLayers.length === 0) {
    return overlap;
  }

  const previewFeatures = previewLayers.flatMap(footprintToTurfFeatures);
  const existing = existingLayers.filter(
    (fp) => fp.layerKind === "virtual_table"
  );

  for (const ex of existing) {
    const exFeatures = footprintToTurfFeatures(ex);
    if (exFeatures.length === 0) continue;
    for (const pf of previewFeatures) {
      for (const ef of exFeatures) {
        try {
          if (booleanIntersects(pf, ef)) {
            overlap.add(ex.id);
            break;
          }
        } catch {
          /* geometry invalid */
        }
      }
      if (overlap.has(ex.id)) break;
    }
  }

  return overlap;
}
