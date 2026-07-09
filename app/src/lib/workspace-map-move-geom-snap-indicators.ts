import L from "leaflet";
import {
  type LatLngPoint,
  type LatLngSegment,
} from "@/lib/workspace-map-draw-bidang";
import { applyMoveGeomTransform } from "@/lib/workspace-map-transform-geom";
import type { MoveGeomEditSubMode, MoveGeomSelection } from "@/lib/workspace-map-tool-types";
import {
  extractEditableEdgeSegments,
  extractEditableVertexPositions,
  type MoveGeomVertexEdits,
} from "@/lib/workspace-map-vertex-edit-geom";
import { undirectedAngleDiffDeg } from "@/lib/workspace-map-move-geom-rotate-snap-math";

/** Toleransi piksel untuk menampilkan indikator titik aktif (sedikit lebih ketat dari snap). */
export const SNAP_VERTEX_INDICATOR_MAX_PX = 2.5;

/** Jarak maksimum (px) antara sisi fitur dan garis referensi agar indikator garis tampil. */
export const SNAP_EDGE_INDICATOR_MAX_DISTANCE_PX = 36;

export type MoveGeomSnapVertexMatch = {
  kind: "vertex";
  from: LatLngPoint;
  to: LatLngPoint;
};

export type MoveGeomSnapEdgeMatch = {
  kind: "edge";
  moving: LatLngSegment;
  reference: LatLngSegment;
};

export type MoveGeomSnapMatch = MoveGeomSnapVertexMatch | MoveGeomSnapEdgeMatch;

export type ResolveMoveGeomSnapMatchesInput = {
  map: L.Map;
  selection: MoveGeomSelection;
  subMode: MoveGeomEditSubMode;
  deltaLng: number;
  deltaLat: number;
  rotationDeg: number;
  rotationPivotVertexIndex: number | null;
  vertexEdits: MoveGeomVertexEdits;
  referenceVertices: LatLngPoint[];
  referenceSegments: LatLngSegment[];
  vertexIndicatorMaxPx?: number;
  edgeAngleToleranceDeg?: number;
  edgeMaxDistancePx?: number;
};

function screenSegmentBearingDeg(
  map: L.Map,
  segment: LatLngSegment
): number {
  const pa = map.latLngToContainerPoint(L.latLng(segment.a.lat, segment.a.lng));
  const pb = map.latLngToContainerPoint(L.latLng(segment.b.lat, segment.b.lng));
  return (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI;
}

function vertexKey(p: LatLngPoint): string {
  return `${p.lng.toFixed(7)},${p.lat.toFixed(7)}`;
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

function pointToSegmentDistancePx(
  map: L.Map,
  point: LatLngPoint,
  segment: LatLngSegment
): number {
  const p = map.latLngToContainerPoint(L.latLng(point.lat, point.lng));
  const a = map.latLngToContainerPoint(L.latLng(segment.a.lat, segment.a.lng));
  const b = map.latLngToContainerPoint(L.latLng(segment.b.lat, segment.b.lng));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

function segmentMidpoint(segment: LatLngSegment): LatLngPoint {
  return {
    lat: (segment.a.lat + segment.b.lat) / 2,
    lng: (segment.a.lng + segment.b.lng) / 2,
  };
}

function segmentsSpatiallyClose(
  map: L.Map,
  moving: LatLngSegment,
  reference: LatLngSegment,
  maxDistancePx: number
): boolean {
  const mid = segmentMidpoint(moving);
  if (pointToSegmentDistancePx(map, mid, reference) <= maxDistancePx) {
    return true;
  }
  return (
    pointToSegmentDistancePx(map, moving.a, reference) <= maxDistancePx ||
    pointToSegmentDistancePx(map, moving.b, reference) <= maxDistancePx
  );
}

function findVertexMatches(
  map: L.Map,
  movingVertices: LatLngPoint[],
  referenceVertices: LatLngPoint[],
  maxPx: number
): MoveGeomSnapVertexMatch[] {
  const out: MoveGeomSnapVertexMatch[] = [];
  const seen = new Set<string>();

  for (const from of movingVertices) {
    for (const to of referenceVertices) {
      const dist = pixelDistanceBetween(map, from, to);
      if (dist > maxPx) continue;
      const key = `${vertexKey(from)}|${vertexKey(to)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: "vertex", from, to });
    }
  }

  return out;
}

function findEdgeMatches(
  map: L.Map,
  movingEdges: LatLngSegment[],
  referenceSegments: LatLngSegment[],
  angleToleranceDeg: number,
  maxDistancePx: number
): MoveGeomSnapEdgeMatch[] {
  const out: MoveGeomSnapEdgeMatch[] = [];
  const seen = new Set<string>();

  for (const moving of movingEdges) {
    const movingBearing = screenSegmentBearingDeg(map, moving);
    for (const reference of referenceSegments) {
      const refBearing = screenSegmentBearingDeg(map, reference);
      if (undirectedAngleDiffDeg(movingBearing, refBearing) >= angleToleranceDeg) {
        continue;
      }
      if (!segmentsSpatiallyClose(map, moving, reference, maxDistancePx)) {
        continue;
      }
      const key = [
        vertexKey(moving.a),
        vertexKey(moving.b),
        vertexKey(reference.a),
        vertexKey(reference.b),
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: "edge", moving, reference });
    }
  }

  return out;
}

/** Deteksi pasangan snap aktif pada transform geometri saat ini. */
export function resolveMoveGeomSnapMatches(
  input: ResolveMoveGeomSnapMatchesInput
): MoveGeomSnapMatch[] {
  const {
    map,
    selection,
    deltaLng,
    deltaLat,
    rotationDeg,
    rotationPivotVertexIndex,
    vertexEdits,
    referenceVertices,
    referenceSegments,
    vertexIndicatorMaxPx = SNAP_VERTEX_INDICATOR_MAX_PX,
    edgeAngleToleranceDeg = 0.5,
    edgeMaxDistancePx = SNAP_EDGE_INDICATOR_MAX_DISTANCE_PX,
  } = input;

  if (referenceVertices.length === 0 && referenceSegments.length === 0) {
    return [];
  }

  const transformed = applyMoveGeomTransform(selection.originalGeojson, {
    deltaLng,
    deltaLat,
    rotationDeg,
    rotationPivotVertexIndex,
    vertexEdits,
  });
  if (!transformed) return [];

  const movingVertices = extractEditableVertexPositions(transformed);
  const vertexMatches =
    referenceVertices.length > 0
      ? findVertexMatches(map, movingVertices, referenceVertices, vertexIndicatorMaxPx)
      : [];

  const edgeMatches =
    referenceSegments.length > 0
      ? findEdgeMatches(
          map,
          extractEditableEdgeSegments(transformed),
          referenceSegments,
          edgeAngleToleranceDeg,
          edgeMaxDistancePx
        )
      : [];

  if (vertexMatches.length > 0) {
    return vertexMatches;
  }

  return edgeMatches;
}

export const SNAP_VERTEX_INDICATOR_COLOR = "#9333ea";
export const SNAP_EDGE_INDICATOR_COLOR = "#0891b2";

const NON_INTERACTIVE = {
  interactive: false,
  bubblingMouseEvents: false,
} as const;

/** Gambar indikator snap ke layer group Leaflet. */
export function drawMoveGeomSnapIndicators(
  group: L.LayerGroup,
  matches: MoveGeomSnapMatch[]
): void {
  group.clearLayers();
  if (matches.length === 0) return;

  for (const match of matches) {
    if (match.kind === "vertex") {
      L.polyline(
        [
          [match.from.lat, match.from.lng],
          [match.to.lat, match.to.lng],
        ],
        {
          ...NON_INTERACTIVE,
          color: SNAP_VERTEX_INDICATOR_COLOR,
          weight: 2,
          dashArray: "5 4",
          opacity: 0.95,
        }
      ).addTo(group);

      L.circleMarker([match.from.lat, match.from.lng], {
        ...NON_INTERACTIVE,
        radius: 6,
        color: SNAP_VERTEX_INDICATOR_COLOR,
        fillColor: "#ede9fe",
        fillOpacity: 1,
        weight: 2,
      }).addTo(group);

      L.circleMarker([match.to.lat, match.to.lng], {
        ...NON_INTERACTIVE,
        radius: 5,
        color: SNAP_VERTEX_INDICATOR_COLOR,
        fillColor: "#ffffff",
        fillOpacity: 1,
        weight: 2,
      }).addTo(group);
      continue;
    }

    L.polyline(
      [
        [match.moving.a.lat, match.moving.a.lng],
        [match.moving.b.lat, match.moving.b.lng],
      ],
      {
        ...NON_INTERACTIVE,
        color: SNAP_EDGE_INDICATOR_COLOR,
        weight: 5,
        opacity: 0.95,
      }
    ).addTo(group);

    L.polyline(
      [
        [match.reference.a.lat, match.reference.a.lng],
        [match.reference.b.lat, match.reference.b.lng],
      ],
      {
        ...NON_INTERACTIVE,
        color: SNAP_EDGE_INDICATOR_COLOR,
        weight: 3,
        dashArray: "7 5",
        opacity: 0.9,
      }
    ).addTo(group);
  }
}
