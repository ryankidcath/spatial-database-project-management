import {
  pickRotationDegAligningEdgeToSegment,
  shortestSignedAngleDiffDeg,
  undirectedAngleDiffDeg,
} from "./workspace-map-move-geom-rotate-snap-math";

if (shortestSignedAngleDiffDeg(10, 350) !== -20) {
  throw new Error("shortestSignedAngleDiffDeg wrap failed");
}

if (undirectedAngleDiffDeg(10, 190) !== 0) {
  throw new Error("undirectedAngleDiffDeg parallel failed");
}

const lineSnap = pickRotationDegAligningEdgeToSegment(30, 90, 58, 10);
if (lineSnap == null || Math.abs(lineSnap - 60) > 1e-6) {
  throw new Error(`expected line snap ~60°, got ${lineSnap}`);
}

if (pickRotationDegAligningEdgeToSegment(30, 90, 10, 10) !== null) {
  throw new Error("expected no line snap when proposed rotation is far");
}

console.log("workspace-map-move-geom-snap.smoke: ok");
