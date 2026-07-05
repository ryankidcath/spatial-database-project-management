import type { MapFootprint } from "@/app/workspace-map";
import {
  filterFootprintsByVirtualTable,
  footprintToTurfFeatures,
  isPolygonalGeometry,
  MIN_POLYGON_OVERLAP_AREA_SQ_M,
  polygonOverlapAreaSqM,
} from "./workspace-map-geo-utils";

export type LayerOverlapPair = {
  footprintIdA: string;
  footprintIdB: string;
  labelA: string;
  labelB: string;
  overlapAreaSqM: number;
};

/**
 * G-D1 — Pasangan fitur dengan irisan poligonal berluasan antara dua lapisan (atau dalam satu lapisan).
 */
export function findLayerOverlapPairs(
  footprints: MapFootprint[],
  tableIdA: string,
  tableIdB: string
): LayerOverlapPair[] {
  const layerA = filterFootprintsByVirtualTable(footprints, tableIdA);
  const layerB = filterFootprintsByVirtualTable(footprints, tableIdB);
  const sameLayer = tableIdA === tableIdB;
  const out: LayerOverlapPair[] = [];
  const seen = new Set<string>();

  for (const fpA of layerA) {
    for (const fpB of layerB) {
      if (sameLayer && fpA.id >= fpB.id) continue;
      if (!sameLayer && fpA.id === fpB.id) continue;

      const pairKey = [fpA.id, fpB.id].sort().join("|");
      if (seen.has(pairKey)) continue;

      const featuresA = footprintToTurfFeatures(fpA);
      const featuresB = footprintToTurfFeatures(fpB);
      let maxOverlap = 0;

      for (const fa of featuresA) {
        if (!fa.geometry || !isPolygonalGeometry(fa.geometry)) continue;
        for (const fb of featuresB) {
          if (!fb.geometry || !isPolygonalGeometry(fb.geometry)) continue;
          maxOverlap = Math.max(
            maxOverlap,
            polygonOverlapAreaSqM(fa.geometry, fb.geometry)
          );
        }
      }

      if (maxOverlap <= MIN_POLYGON_OVERLAP_AREA_SQ_M) continue;

      seen.add(pairKey);
      out.push({
        footprintIdA: fpA.id,
        footprintIdB: fpB.id,
        labelA: fpA.label,
        labelB: fpB.label,
        overlapAreaSqM: maxOverlap,
      });
    }
  }

  return out.sort((a, b) => b.overlapAreaSqM - a.overlapAreaSqM);
}
