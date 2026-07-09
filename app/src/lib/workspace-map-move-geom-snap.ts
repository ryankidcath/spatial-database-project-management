import L from "leaflet";
import {
  DEFAULT_SNAP_PIXEL_TOLERANCE,
  type LatLngPoint,
} from "@/lib/workspace-map-draw-bidang";
import { applyMoveGeomTransform } from "@/lib/workspace-map-transform-geom";
import type { MoveGeomSelection } from "@/lib/workspace-map-tool-types";
import {
  extractEditableVertexPositions,
  type MoveGeomVertexEdits,
} from "@/lib/workspace-map-vertex-edit-geom";

/** Snap posisi vertex ke vertex referensi terdekat (bukan kursor). */
export function snapVertexToReferences(
  map: L.Map,
  proposed: LatLngPoint,
  referenceVertices: LatLngPoint[],
  pixelTolerance = DEFAULT_SNAP_PIXEL_TOLERANCE
): LatLngPoint {
  if (referenceVertices.length === 0) return proposed;
  const proposedPt = map.latLngToContainerPoint(
    L.latLng(proposed.lat, proposed.lng)
  );
  let best: LatLngPoint | null = null;
  let bestDist = pixelTolerance;
  for (const ref of referenceVertices) {
    const refPt = map.latLngToContainerPoint(L.latLng(ref.lat, ref.lng));
    const d = Math.hypot(refPt.x - proposedPt.x, refPt.y - proposedPt.y);
    if (d < bestDist) {
      bestDist = d;
      best = ref;
    }
  }
  return best ?? proposed;
}

/**
 * Geser seluruh geometri: sesuaikan delta agar vertex fitur yang digeser
 * menempel ke vertex referensi — bukan menempelkan kursor mouse.
 */
export function computeSnappedTranslateDelta(
  map: L.Map,
  selection: MoveGeomSelection,
  sessionBase: { dLat: number; dLng: number },
  dragStart: L.LatLng,
  mouseLatLng: L.LatLng,
  rotationDeg: number,
  vertexEdits: MoveGeomVertexEdits,
  referenceVertices: LatLngPoint[],
  pixelTolerance = DEFAULT_SNAP_PIXEL_TOLERANCE
): { dLat: number; dLng: number } {
  const rawDLat = sessionBase.dLat + (mouseLatLng.lat - dragStart.lat);
  const rawDLng = sessionBase.dLng + (mouseLatLng.lng - dragStart.lng);

  if (referenceVertices.length === 0) {
    return { dLat: rawDLat, dLng: rawDLng };
  }

  const translated = applyMoveGeomTransform(selection.originalGeojson, {
    deltaLng: rawDLng,
    deltaLat: rawDLat,
    rotationDeg,
    vertexEdits,
  });
  if (!translated) {
    return { dLat: rawDLat, dLng: rawDLng };
  }

  const movingVerts = extractEditableVertexPositions(translated);
  if (movingVerts.length === 0) {
    return { dLat: rawDLat, dLng: rawDLng };
  }

  let bestAdjust: { dLat: number; dLng: number } | null = null;
  let bestDist = pixelTolerance;

  for (const mv of movingVerts) {
    const mvPt = map.latLngToContainerPoint(L.latLng(mv.lat, mv.lng));
    for (const ref of referenceVertices) {
      const refPt = map.latLngToContainerPoint(L.latLng(ref.lat, ref.lng));
      const dist = Math.hypot(mvPt.x - refPt.x, mvPt.y - refPt.y);
      if (dist >= bestDist) continue;
      bestDist = dist;
      bestAdjust = {
        dLat: rawDLat + (ref.lat - mv.lat),
        dLng: rawDLng + (ref.lng - mv.lng),
      };
    }
  }

  return bestAdjust ?? { dLat: rawDLat, dLng: rawDLng };
}
