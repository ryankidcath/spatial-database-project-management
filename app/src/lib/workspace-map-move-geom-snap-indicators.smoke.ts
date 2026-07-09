import { extractEditableEdgeSegments } from "./workspace-map-vertex-edit-geom";
import { undirectedAngleDiffDeg } from "./workspace-map-move-geom-rotate-snap-math";

const square = {
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

const edges = extractEditableEdgeSegments(square);
if (edges.length !== 4) {
  throw new Error(`expected 4 edges, got ${edges.length}`);
}

if (undirectedAngleDiffDeg(0, 180) !== 0) {
  throw new Error("parallel check failed");
}

console.log("workspace-map-move-geom-snap-indicators.smoke: ok");
