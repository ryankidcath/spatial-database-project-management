import type { MapFootprint } from "@/app/workspace-map";
import { computeMoveGeomOverlapPreview } from "./workspace-map-move-geom-overlap";
import type { MoveGeomSelection } from "./workspace-map-tool-types";

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
  box("vtable:row-b:geom", 108.5505, -6.741, 108.552, -6.738),
  box("vtable:row-c:geom", 108.6, -6.8, 108.601, -6.799),
];

const atOrigin = computeMoveGeomOverlapPreview(selection, 0, 0, refs);
if (!atOrigin.isClean || atOrigin.hits.length === 0) {
  throw new Error("expected overlap at origin with row-b");
}

const movedClear = computeMoveGeomOverlapPreview(selection, 0, 0.01, refs);
if (!movedClear.isClean) {
  throw new Error("expected no overlap after large translation");
}

console.log("workspace-map-move-geom-overlap.smoke: ok");
