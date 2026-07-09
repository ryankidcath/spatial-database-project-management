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

/**
 * Pilih total rotasi agar sisi (bearing pada rotasi 0) selaras dengan garis referensi.
 * Hanya mengembalikan kandidat jika rotasi usulan sudah hampir selaras.
 */
export function pickRotationDegAligningEdgeToSegment(
  edgeBearingAtZero: number,
  segmentBearing: number,
  proposedRotation: number,
  angleToleranceDeg = DEFAULT_ROTATE_SNAP_ANGLE_TOLERANCE_DEG
): number | null {
  const alignAtProposed = undirectedAngleDiffDeg(
    edgeBearingAtZero + proposedRotation,
    segmentBearing
  );
  if (alignAtProposed >= angleToleranceDeg) return null;

  let bestR: number | null = null;
  let bestRotDiff = angleToleranceDeg;

  const candidates = [
    segmentBearing - edgeBearingAtZero,
    segmentBearing - edgeBearingAtZero + 180,
    segmentBearing - edgeBearingAtZero - 180,
  ];

  for (const candidate of candidates) {
    if (
      undirectedAngleDiffDeg(edgeBearingAtZero + candidate, segmentBearing) >=
      0.5
    ) {
      continue;
    }
    const rotDiff = Math.abs(
      shortestSignedAngleDiffDeg(proposedRotation, candidate)
    );
    if (rotDiff < bestRotDiff) {
      bestRotDiff = rotDiff;
      bestR = candidate;
    }
  }

  return bestR;
}
