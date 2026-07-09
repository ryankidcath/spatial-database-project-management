import L from "leaflet";
import {
  DEFAULT_SNAP_PIXEL_TOLERANCE,
  type LatLngPoint,
  type LatLngSegment,
} from "@/lib/workspace-map-draw-bidang";
import {
  DEFAULT_ROTATE_SNAP_ANGLE_TOLERANCE_DEG,
  snapRotationDeltaToLineBearings,
  snapRotationDeltaToReferenceAngles,
} from "@/lib/workspace-map-move-geom-rotate-snap-math";
import { applyMoveGeomTransform } from "@/lib/workspace-map-transform-geom";
import { geometryKindFromStored } from "@/lib/workspace-map-translate-geom";
import type { MoveGeomSelection } from "@/lib/workspace-map-tool-types";
import {
  extractEditableVertexPositions,
  type MoveGeomVertexEdits,
} from "@/lib/workspace-map-vertex-edit-geom";

export {
  DEFAULT_ROTATE_SNAP_ANGLE_TOLERANCE_DEG,
  shortestSignedAngleDiffDeg,
  snapRotationDeltaToLineBearings,
  undirectedAngleDiffDeg,
} from "@/lib/workspace-map-move-geom-rotate-snap-math";

/** Sudut layar (derajat) dari pivot ke titik — 0° = timur, CCW positif. */
export function screenAngleDegFromPivot(
  map: L.Map,
  pivot: LatLngPoint,
  point: LatLngPoint
): number {
  const p = map.latLngToContainerPoint(L.latLng(pivot.lat, pivot.lng));
  const t = map.latLngToContainerPoint(L.latLng(point.lat, point.lng));
  return (Math.atan2(t.y - p.y, t.x - p.x) * 180) / Math.PI;
}

export function screenSegmentBearingDeg(
  map: L.Map,
  segment: LatLngSegment
): number {
  return screenAngleDegFromPivot(map, segment.a, segment.b);
}

function extractEdgeScreenBearingsDeg(
  map: L.Map,
  stored: unknown
): number[] {
  const kind = geometryKindFromStored(stored);
  const verts = extractEditableVertexPositions(stored);
  if (verts.length < 2) return [];
  const out: number[] = [];
  if (kind === "polygon") {
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i]!;
      const b = verts[(i + 1) % verts.length]!;
      out.push(screenAngleDegFromPivot(map, a, b));
    }
    return out;
  }
  if (kind === "linestring") {
    for (let i = 0; i < verts.length - 1; i++) {
      out.push(
        screenAngleDegFromPivot(map, verts[i]!, verts[i + 1]!)
      );
    }
  }
  return out;
}

/** Snap delta putar agar arah drag menuju vertex referensi terdekat dari pivot. */
export function snapRotationDeltaToVertexAngles(
  mouseAngle: number,
  startAngle: number,
  pivot: LatLngPoint,
  map: L.Map,
  referenceVertices: LatLngPoint[],
  angleToleranceDeg = DEFAULT_ROTATE_SNAP_ANGLE_TOLERANCE_DEG
): number | null {
  const refAngles = referenceVertices.map((ref) =>
    screenAngleDegFromPivot(map, pivot, ref)
  );
  return snapRotationDeltaToReferenceAngles(
    mouseAngle,
    startAngle,
    refAngles,
    angleToleranceDeg
  );
}

/**
 * Hitung sudut putar dengan snap: arah drag ke vertex referensi, atau
 * sisi geometri selaras dengan garis referensi.
 */
export function computeSnappedRotationDeg(
  map: L.Map,
  pivot: LatLngPoint,
  mouseLatLng: LatLngPoint,
  sessionBaseRotation: number,
  startAngle: number,
  geometryAtSessionRotation: unknown,
  referenceVertices: LatLngPoint[],
  referenceSegments: LatLngSegment[],
  angleToleranceDeg = DEFAULT_ROTATE_SNAP_ANGLE_TOLERANCE_DEG
): number {
  const mouseAngle = screenAngleDegFromPivot(map, pivot, {
    lat: mouseLatLng.lat,
    lng: mouseLatLng.lng,
  });
  const proposedDelta = mouseAngle - startAngle;

  const vertexSnappedDelta = snapRotationDeltaToVertexAngles(
    mouseAngle,
    startAngle,
    pivot,
    map,
    referenceVertices,
    angleToleranceDeg
  );
  if (vertexSnappedDelta != null) {
    return sessionBaseRotation + vertexSnappedDelta;
  }

  const edgeBearings = extractEdgeScreenBearingsDeg(
    map,
    geometryAtSessionRotation
  );
  const refBearings = referenceSegments.map((seg) =>
    screenSegmentBearingDeg(map, seg)
  );
  const lineSnappedDelta = snapRotationDeltaToLineBearings(
    proposedDelta,
    edgeBearings,
    refBearings,
    angleToleranceDeg
  );
  if (lineSnappedDelta != null) {
    return sessionBaseRotation + lineSnappedDelta;
  }

  return sessionBaseRotation + proposedDelta;
}

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
  rotationPivotVertexIndex: number | null = null,
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
    rotationPivotVertexIndex,
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
