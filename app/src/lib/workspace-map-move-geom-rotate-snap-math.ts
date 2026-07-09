export const DEFAULT_ROTATE_SNAP_ANGLE_TOLERANCE_DEG = 6;

/** Selisih sudut terpendek a→b dalam derajat, rentang (-180, 180]. */
export function shortestSignedAngleDiffDeg(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/** Selisih sudut garis tanpa arah (0–90°). */
export function undirectedAngleDiffDeg(a: number, b: number): number {
  const na = ((a % 180) + 180) % 180;
  const nb = ((b % 180) + 180) % 180;
  let d = Math.abs(na - nb);
  if (d > 90) d = 180 - d;
  return d;
}

/** Snap delta putar agar sisi geometri selaras dengan segmen referensi. */
export function snapRotationDeltaToLineBearings(
  proposedDelta: number,
  edgeBearingsAtSession: number[],
  referenceSegmentBearings: number[],
  angleToleranceDeg = DEFAULT_ROTATE_SNAP_ANGLE_TOLERANCE_DEG
): number | null {
  if (edgeBearingsAtSession.length === 0 || referenceSegmentBearings.length === 0) {
    return null;
  }

  let bestDelta: number | null = null;
  let bestDiff = angleToleranceDeg;

  for (const edgeBearing of edgeBearingsAtSession) {
    const rotatedBearing = edgeBearing + proposedDelta;
    for (const segBearing of referenceSegmentBearings) {
      const diff = undirectedAngleDiffDeg(rotatedBearing, segBearing);
      if (diff >= bestDiff) continue;

      const candidates = [
        segBearing - edgeBearing,
        segBearing - edgeBearing + 180,
        segBearing - edgeBearing - 180,
      ];
      for (const candidate of candidates) {
        const alignDiff = undirectedAngleDiffDeg(edgeBearing + candidate, segBearing);
        if (alignDiff >= angleToleranceDeg) continue;
        const snapDiff = Math.abs(shortestSignedAngleDiffDeg(proposedDelta, candidate));
        if (
          diff < bestDiff ||
          (diff === bestDiff &&
            (bestDelta == null ||
              snapDiff <
                Math.abs(shortestSignedAngleDiffDeg(proposedDelta, bestDelta))))
        ) {
          bestDiff = diff;
          bestDelta = candidate;
        }
      }
    }
  }

  return bestDelta;
}

/** Pilih delta putar terdekat agar arah drag menuju salah satu sudut referensi. */
export function snapRotationDeltaToReferenceAngles(
  mouseAngle: number,
  startAngle: number,
  referenceAnglesDeg: number[],
  angleToleranceDeg = DEFAULT_ROTATE_SNAP_ANGLE_TOLERANCE_DEG
): number | null {
  const proposedDelta = mouseAngle - startAngle;
  let bestDelta: number | null = null;
  let bestDiff = angleToleranceDeg;

  for (const refAngle of referenceAnglesDeg) {
    const angularDiff = Math.abs(shortestSignedAngleDiffDeg(mouseAngle, refAngle));
    if (angularDiff >= bestDiff) continue;
    const snappedDelta = refAngle - startAngle;
    bestDiff = angularDiff;
    bestDelta = snappedDelta;
  }

  if (bestDelta != null) return bestDelta;
  return null;
}
