import booleanIntersects from "@turf/boolean-intersects";
import type { MapFootprint } from "@/app/workspace-map";
import {
  footprintToTurfFeatures,
  isPolygonalGeometry,
  MIN_POLYGON_OVERLAP_AREA_SQ_M,
  polygonOverlapAreaSqM,
} from "./workspace-map-geo-utils";
import {
  geometryKindFromStored,
  translateStoredGeometry,
} from "./workspace-map-translate-geom";
import type { MoveGeomSelection } from "./workspace-map-tool-types";

export type MoveGeomOverlapHit = {
  footprintId: string;
  label: string;
  /** Luas irisan m² untuk poligon; null bila hanya irisan geometri (garis/titik). */
  overlapAreaSqM: number | null;
};

export type MoveGeomOverlapPreview = {
  hits: MoveGeomOverlapHit[];
  highlightFootprintIds: string[];
  isClean: boolean;
  supportsAreaOverlap: boolean;
};

const EMPTY_PREVIEW: MoveGeomOverlapPreview = {
  hits: [],
  highlightFootprintIds: [],
  isClean: true,
  supportsAreaOverlap: false,
};

function translatedMovingFeatures(
  selection: MoveGeomSelection,
  deltaLng: number,
  deltaLat: number
): GeoJSON.Feature[] {
  const translated = translateStoredGeometry(
    selection.originalGeojson,
    deltaLng,
    deltaLat
  );
  if (!translated) return [];
  const pseudo: MapFootprint = {
    id: selection.footprintId,
    label: selection.label,
    geojson: translated,
    layerKind: "virtual_table",
    virtualTableId: selection.virtualTableId,
    virtualRowId: selection.virtualRowId,
  };
  return footprintToTurfFeatures(pseudo);
}

/**
 * Pratinjau overlap fitur yang digeser terhadap lapisan referensi lain di peta.
 */
export function computeMoveGeomOverlapPreview(
  selection: MoveGeomSelection | null,
  deltaLat: number,
  deltaLng: number,
  referenceFootprints: MapFootprint[]
): MoveGeomOverlapPreview {
  if (!selection) return EMPTY_PREVIEW;

  const supportsAreaOverlap =
    geometryKindFromStored(selection.originalGeojson) === "polygon";
  const movingFeatures = translatedMovingFeatures(
    selection,
    deltaLng,
    deltaLat
  );
  if (movingFeatures.length === 0) return { ...EMPTY_PREVIEW, supportsAreaOverlap };

  const refs = referenceFootprints.filter(
    (fp) =>
      fp.layerKind === "virtual_table" && fp.id !== selection.footprintId
  );

  const hits: MoveGeomOverlapHit[] = [];

  for (const ref of refs) {
    const refFeatures = footprintToTurfFeatures(ref);
    if (refFeatures.length === 0) continue;

    let maxArea = 0;
    let intersects = false;

    for (const mf of movingFeatures) {
      if (!mf.geometry) continue;
      for (const rf of refFeatures) {
        if (!rf.geometry) continue;
        try {
          if (
            isPolygonalGeometry(mf.geometry) &&
            isPolygonalGeometry(rf.geometry)
          ) {
            const area = polygonOverlapAreaSqM(mf.geometry, rf.geometry);
            if (area > MIN_POLYGON_OVERLAP_AREA_SQ_M) {
              intersects = true;
              maxArea = Math.max(maxArea, area);
            }
          } else if (booleanIntersects(mf, rf)) {
            intersects = true;
          }
        } catch {
          /* geometri tidak valid */
        }
      }
    }

    if (!intersects) continue;

    hits.push({
      footprintId: ref.id,
      label: ref.label,
      overlapAreaSqM:
        supportsAreaOverlap && maxArea > MIN_POLYGON_OVERLAP_AREA_SQ_M
          ? maxArea
          : null,
    });
  }

  hits.sort((a, b) => (b.overlapAreaSqM ?? 0) - (a.overlapAreaSqM ?? 0));

  return {
    hits,
    highlightFootprintIds: hits.map((h) => h.footprintId),
    isClean: hits.length === 0,
    supportsAreaOverlap,
  };
}
