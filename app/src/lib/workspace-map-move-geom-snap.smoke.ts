import {
  shortestSignedAngleDiffDeg,
  snapRotationDeltaToLineBearings,
  snapRotationDeltaToReferenceAngles,
  undirectedAngleDiffDeg,
} from "./workspace-map-move-geom-rotate-snap-math";

if (shortestSignedAngleDiffDeg(10, 350) !== -20) {
  throw new Error("shortestSignedAngleDiffDeg wrap failed");
}

if (undirectedAngleDiffDeg(10, 190) !== 0) {
  throw new Error("undirectedAngleDiffDeg parallel failed");
}

const lineSnap = snapRotationDeltaToLineBearings(58, [30], [90], 10);
if (lineSnap == null || Math.abs(lineSnap - 60) > 1e-6) {
  throw new Error(`expected line snap ~60°, got ${lineSnap}`);
}

const vertexSnap = snapRotationDeltaToReferenceAngles(47, 0, [45], 5);
if (vertexSnap == null || Math.abs(vertexSnap - 45) > 1e-6) {
  throw new Error(`expected vertex angle snap 45°, got ${vertexSnap}`);
}

console.log("workspace-map-move-geom-snap.smoke: ok");
