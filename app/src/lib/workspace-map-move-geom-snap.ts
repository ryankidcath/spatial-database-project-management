import L from "leaflet";
import {
  DEFAULT_SNAP_PIXEL_TOLERANCE,
  type LatLngPoint,
  type LatLngSegment,
} from "@/lib/workspace-map-draw-bidang";
import {
  DEFAULT_ROTATE_SNAP_ANGLE_TOLERANCE_DEG,
  pickRotationDegAligningEdgeToSegment,
  undirectedAngleDiffDeg,
} from "@/lib/workspace-map-move-geom-rotate-snap-math";
import { applyMoveGeomTransform } from "@/lib/workspace-map-transform-geom";
import { geometryKindFromStored, translateStoredGeometry } from "@/lib/workspace-map-translate-geom";
import type { MoveGeomSelection } from "@/lib/workspace-map-tool-types";
import {
  extractEditableVertexPositions,
  type MoveGeomVertexEdits,
} from "@/lib/workspace-map-vertex-edit-geom";

export {
  DEFAULT_ROTATE_SNAP_ANGLE_TOLERANCE_DEG,
  pickRotationDegAligningEdgeToSegment,
  shortestSignedAngleDiffDeg,
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

function pixelDistanceBetween(
  map: L.Map,
  a: LatLngPoint,
  b: LatLngPoint
): number {
  const pa = map.latLngToContainerPoint(L.latLng(a.lat, a.lng));
  const pb = map.latLngToContainerPoint(L.latLng(b.lat, b.lng));
  return Math.hypot(pb.x - pa.x, pb.y - pa.y);
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

function vertexAtRotation(
  selection: MoveGeomSelection,
  deltaLng: number,
  deltaLat: number,
  rotationDeg: number,
  rotationPivotVertexIndex: number | null,
  vertexIndex: number
): LatLngPoint | null {
  const geom = applyMoveGeomTransform(selection.originalGeojson, {
    deltaLng,
    deltaLat,
    rotationDeg,
    rotationPivotVertexIndex,
    vertexEdits: {},
  });
  if (!geom) return null;
  return (
    extractEditableVertexPositions(geom).find((v) => v.index === vertexIndex) ??
    null
  );
}

/** Cari rotasi agar vertex geometri menempel ke titik referensi (bukan kursor). */
function findRotationPlacingVertexOnRef(
  map: L.Map,
  selection: MoveGeomSelection,
  deltaLng: number,
  deltaLat: number,
  rotationPivotVertexIndex: number | null,
  vertexIndex: number,
  ref: LatLngPoint,
  pivot: LatLngPoint,
  proposedRotation: number,
  pixelTolerance: number
): number | null {
  const translated = translateStoredGeometry(
    selection.originalGeojson,
    deltaLng,
    deltaLat
  );
  if (!translated) return null;
  const v0 = extractEditableVertexPositions(translated).find(
    (v) => v.index === vertexIndex
  );
  if (!v0) return null;

  const angleV = screenAngleDegFromPivot(map, pivot, v0);
  const angleRef = screenAngleDegFromPivot(map, pivot, ref);
  const seedCandidates = new Set<number>([
    angleRef - angleV,
    angleRef - angleV + 180,
    angleRef - angleV - 180,
    proposedRotation,
  ]);
  for (let offset = -20; offset <= 20; offset += 0.5) {
    seedCandidates.add(proposedRotation + offset);
  }

  let bestR: number | null = null;
  let bestDist = pixelTolerance;

  for (const candidate of seedCandidates) {
    const v = vertexAtRotation(
      selection,
      deltaLng,
      deltaLat,
      candidate,
      rotationPivotVertexIndex,
      vertexIndex
    );
    if (!v) continue;
    const dist = pixelDistanceBetween(map, v, ref);
    if (dist < bestDist) {
      bestDist = dist;
      bestR = candidate;
    }
  }

  if (bestR == null || bestDist > 1.5) return null;
  return bestR;
}

/**
 * Snap rotasi agar vertex geometri (bukan kursor) menempel ke vertex referensi.
 */
export function snapRotationDegToReferenceVertices(
  map: L.Map,
  pivot: LatLngPoint,
  selection: MoveGeomSelection,
  deltaLng: number,
  deltaLat: number,
  rotationPivotVertexIndex: number | null,
  proposedRotation: number,
  referenceVertices: LatLngPoint[],
  pixelTolerance = DEFAULT_SNAP_PIXEL_TOLERANCE
): number | null {
  if (referenceVertices.length === 0) return null;

  const geomAtProposed = applyMoveGeomTransform(selection.originalGeojson, {
    deltaLng,
    deltaLat,
    rotationDeg: proposedRotation,
    rotationPivotVertexIndex,
    vertexEdits: {},
  });
  if (!geomAtProposed) return null;

  const vertsAtProposed = extractEditableVertexPositions(geomAtProposed);
  let bestRotation: number | null = null;
  let bestDist = pixelTolerance;

  for (const mv of vertsAtProposed) {
    if (
      rotationPivotVertexIndex != null &&
      mv.index === rotationPivotVertexIndex
    ) {
      continue;
    }
    const mvPt = map.latLngToContainerPoint(L.latLng(mv.lat, mv.lng));
    for (const ref of referenceVertices) {
      const refPt = map.latLngToContainerPoint(L.latLng(ref.lat, ref.lng));
      const dist = Math.hypot(refPt.x - mvPt.x, refPt.y - mvPt.y);
      if (dist >= bestDist) continue;

      const snapped = findRotationPlacingVertexOnRef(
        map,
        selection,
        deltaLng,
        deltaLat,
        rotationPivotVertexIndex,
        mv.index,
        ref,
        pivot,
        proposedRotation,
        pixelTolerance
      );
      if (snapped == null) continue;

      bestDist = dist;
      bestRotation = snapped;
    }
  }

  return bestRotation;
}

/**
 * Snap rotasi agar sisi geometri selaras dengan garis referensi.
 */
export function snapRotationDegToReferenceLines(
  map: L.Map,
  selection: MoveGeomSelection,
  deltaLng: number,
  deltaLat: number,
  rotationPivotVertexIndex: number | null,
  proposedRotation: number,
  referenceSegments: LatLngSegment[],
  angleToleranceDeg = DEFAULT_ROTATE_SNAP_ANGLE_TOLERANCE_DEG
): number | null {
  if (referenceSegments.length === 0) return null;

  const translated = translateStoredGeometry(
    selection.originalGeojson,
    deltaLng,
    deltaLat
  );
  if (!translated) return null;

  const edgesAtZero = extractEdgeScreenBearingsDeg(map, translated);
  if (edgesAtZero.length === 0) return null;

  const geomAtProposed = applyMoveGeomTransform(selection.originalGeojson, {
    deltaLng,
    deltaLat,
    rotationDeg: proposedRotation,
    rotationPivotVertexIndex,
    vertexEdits: {},
  });
  const proposedEdges = geomAtProposed
    ? extractEdgeScreenBearingsDeg(map, geomAtProposed)
    : [];

  let bestRotation: number | null = null;
  let bestAlignDiff = angleToleranceDeg;

  for (let i = 0; i < edgesAtZero.length; i++) {
    const edgeAtZero = edgesAtZero[i]!;
    const proposedEdge = proposedEdges[i] ?? edgeAtZero + proposedRotation;

    for (const seg of referenceSegments) {
      const segBearing = screenSegmentBearingDeg(map, seg);
      const alignAtProposed = undirectedAngleDiffDeg(proposedEdge, segBearing);
      if (alignAtProposed >= angleToleranceDeg) continue;

      const candidate = pickRotationDegAligningEdgeToSegment(
        edgeAtZero,
        segBearing,
        proposedRotation,
        angleToleranceDeg
      );
      if (candidate == null) continue;

      const geomAtCandidate = applyMoveGeomTransform(
        selection.originalGeojson,
        {
          deltaLng,
          deltaLat,
          rotationDeg: candidate,
          rotationPivotVertexIndex,
          vertexEdits: {},
        }
      );
      if (!geomAtCandidate) continue;

      const verified = extractEdgeScreenBearingsDeg(map, geomAtCandidate).some(
        (bearing) => undirectedAngleDiffDeg(bearing, segBearing) < 0.5
      );
      if (!verified) continue;

      if (alignAtProposed < bestAlignDiff) {
        bestAlignDiff = alignAtProposed;
        bestRotation = candidate;
      }
    }
  }

  return bestRotation;
}

/**
 * Hitung sudut putar dengan snap pada geometri: vertex fitur ke titik referensi,
 * atau sisi fitur selaras garis referensi — bukan arah kursor mouse.
 */
export function computeSnappedRotationDeg(
  map: L.Map,
  pivot: LatLngPoint,
  mouseLatLng: LatLngPoint,
  sessionBaseRotation: number,
  startAngle: number,
  selection: MoveGeomSelection,
  deltaLng: number,
  deltaLat: number,
  rotationPivotVertexIndex: number | null,
  referenceVertices: LatLngPoint[],
  referenceSegments: LatLngSegment[],
  pixelTolerance = DEFAULT_SNAP_PIXEL_TOLERANCE,
  angleToleranceDeg = DEFAULT_ROTATE_SNAP_ANGLE_TOLERANCE_DEG
): number {
  const mouseAngle = screenAngleDegFromPivot(map, pivot, {
    lat: mouseLatLng.lat,
    lng: mouseLatLng.lng,
  });
  const proposedRotation = sessionBaseRotation + (mouseAngle - startAngle);

  const vertexSnapped = snapRotationDegToReferenceVertices(
    map,
    pivot,
    selection,
    deltaLng,
    deltaLat,
    rotationPivotVertexIndex,
    proposedRotation,
    referenceVertices,
    pixelTolerance
  );
  if (vertexSnapped != null) {
    return vertexSnapped;
  }

  const lineSnapped = snapRotationDegToReferenceLines(
    map,
    selection,
    deltaLng,
    deltaLat,
    rotationPivotVertexIndex,
    proposedRotation,
    referenceSegments,
    angleToleranceDeg
  );
  if (lineSnapped != null) {
    return lineSnapped;
  }

  return proposedRotation;
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
