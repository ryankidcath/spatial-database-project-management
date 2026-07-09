import type { MapFootprint } from "@/app/workspace-map";
import { applyMoveGeomTransform } from "./workspace-map-transform-geom";
import { computeMoveGeomOverlapPreview } from "./workspace-map-move-geom-overlap";
import type { MoveGeomSelection } from "./workspace-map-tool-types";

const NO_TRANSFORM = {
  deltaLng: 0,
  deltaLat: 0,
  rotationDeg: 0,
  rotationPivotVertexIndex: null,
  vertexEdits: {},
};

function box(
  id: string,
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number
): MapFootprint {
  return {
    id,
    label: id,
    layerKind: "virtual_table",
    virtualTableId: "tbl",
    virtualRowId: id,
    geojson: {
      type: "Polygon",
      coordinates: [
        [
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat],
        ],
      ],
    },
  };
}

const selection: MoveGeomSelection = {
  footprintId: "vtable:row-a:geom",
  label: "Bidang A",
  virtualTableId: "tbl",
  virtualRowId: "row-a",
  geometryColumnSlug: "geom",
  originalGeojson: {
    type: "Polygon",
    coordinates: [
      [
        [108.55, -6.74],
        [108.551, -6.74],
        [108.551, -6.739],
        [108.55, -6.739],
        [108.55, -6.74],
      ],
    ],
  },
};

const refs: MapFootprint[] = [
  box("vtable:row-b:geom", 108.5502, -6.7402, 108.5512, -6.7392),
  box("vtable:row-c:geom", 108.6, -6.8, 108.601, -6.799),
];

const atOrigin = computeMoveGeomOverlapPreview(
  selection,
  NO_TRANSFORM,
  refs
);
if (atOrigin.isClean || atOrigin.hits.length === 0) {
  throw new Error("expected overlap at origin with row-b");
}

const movedClear = computeMoveGeomOverlapPreview(
  selection,
  { deltaLng: 0, deltaLat: 0.01, rotationDeg: 0, rotationPivotVertexIndex: null, vertexEdits: {} },
  refs
);
if (!movedClear.isClean) {
  throw new Error("expected no overlap after large translation");
}

const rotated = applyMoveGeomTransform(selection.originalGeojson, {
  deltaLng: 0,
  deltaLat: 0,
  rotationDeg: 45,
  rotationPivotVertexIndex: null,
  vertexEdits: {},
});
if (!rotated) {
  throw new Error("expected rotation to succeed");
}

console.log("workspace-map-move-geom-overlap.smoke: ok");
