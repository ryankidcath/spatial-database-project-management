import L from "leaflet";
import {
  DEFAULT_SNAP_PIXEL_TOLERANCE,
  type LatLngPoint,
  type LatLngSegment,
} from "@/lib/workspace-map-draw-bidang";
import {
  DEFAULT_ROTATE_SNAP_ANGLE_TOLERANCE_DEG,
} from "@/lib/workspace-map-move-geom-rotate-snap-math";
import {
  findActiveEdgeSnapPair,
  findActiveVertexSnapPair,
} from "@/lib/workspace-map-move-geom-snap";
import { applyMoveGeomTransform } from "@/lib/workspace-map-transform-geom";
import type { MoveGeomEditSubMode, MoveGeomSelection } from "@/lib/workspace-map-tool-types";
import {
  extractEditableEdgeSegments,
  extractEditableVertexPositions,
  type MoveGeomVertexEdits,
} from "@/lib/workspace-map-vertex-edit-geom";

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
  vertexPixelTolerance?: number;
  edgeAngleToleranceDeg?: number;
  edgeMaxDistancePx?: number;
};

/** Deteksi pasangan snap aktif — toleransi selaras dengan logika snap. */
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
    vertexPixelTolerance = DEFAULT_SNAP_PIXEL_TOLERANCE,
    edgeAngleToleranceDeg = DEFAULT_ROTATE_SNAP_ANGLE_TOLERANCE_DEG,
    edgeMaxDistancePx = 48,
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

  const matches: MoveGeomSnapMatch[] = [];

  const vertexPair = findActiveVertexSnapPair(
    map,
    extractEditableVertexPositions(transformed),
    referenceVertices,
    vertexPixelTolerance
  );
  if (vertexPair) {
    matches.push({ kind: "vertex", ...vertexPair });
  }

  const edgePair = findActiveEdgeSnapPair(
    map,
    extractEditableEdgeSegments(transformed),
    referenceSegments,
    edgeAngleToleranceDeg,
    edgeMaxDistancePx
  );
  if (edgePair) {
    matches.push({ kind: "edge", ...edgePair });
  }

  return matches;
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
          weight: 3,
          dashArray: "6 4",
          opacity: 0.95,
        }
      ).addTo(group);

      L.circleMarker([match.from.lat, match.from.lng], {
        ...NON_INTERACTIVE,
        radius: 7,
        color: SNAP_VERTEX_INDICATOR_COLOR,
        fillColor: "#ede9fe",
        fillOpacity: 1,
        weight: 2,
      }).addTo(group);

      L.circleMarker([match.to.lat, match.to.lng], {
        ...NON_INTERACTIVE,
        radius: 6,
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
        weight: 6,
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
        dashArray: "8 5",
        opacity: 0.9,
      }
    ).addTo(group);
  }

  group.eachLayer((layer) => {
    if (layer instanceof L.Path) {
      layer.bringToFront();
    }
  });
}
