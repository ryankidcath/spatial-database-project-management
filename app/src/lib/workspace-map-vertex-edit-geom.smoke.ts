import { applyMoveGeomTransform } from "./workspace-map-transform-geom";
import {
  applyVertexEditsToStored,
  extractEditableVertexPositions,
} from "./workspace-map-vertex-edit-geom";

const polygon = {
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
};

const verts = extractEditableVertexPositions(polygon);
if (verts.length !== 4) {
  throw new Error(`expected 4 editable vertices, got ${verts.length}`);
}

const edited = applyVertexEditsToStored(polygon, {
  1: { lat: -6.7395, lng: 108.5505 },
});
if (!edited) {
  throw new Error("vertex edit failed");
}

const moved = applyMoveGeomTransform(polygon, {
  deltaLng: 0.001,
  deltaLat: 0,
  rotationDeg: 0,
  vertexEdits: { 0: { lat: -6.7398, lng: 108.5502 } },
});
if (!moved) {
  throw new Error("combined transform failed");
}

console.log("workspace-map-vertex-edit-geom.smoke: ok");
