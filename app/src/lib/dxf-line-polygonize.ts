import polygonize from "@turf/polygonize";
import { featureCollection, lineString } from "@turf/helpers";
import type { LinearRing } from "@/lib/dxf-import-utils";

export type LineSegment = [[number, number], [number, number]];

export type DxfPolygonizeOptions = {
  /** Toleransi snap ujung garis, dalam satuan CRS sumber (meter untuk UTM/TM-3). */
  snapTolerance: number;
  /** Buang poligon dengan luas di bawah nilai ini (satuan² CRS sumber). */
  minArea?: number;
  /** Buang face terluar (poligon dengan luas terbesar) bila ada lebih dari satu. */
  dropLargestFace?: boolean;
};

export type DxfPolygonizeResult = {
  rings: LinearRing[];
  segmentCount: number;
  nodedSegmentCount: number;
  polygonCountBeforeFilter: number;
  warnings: string[];
};

const DEFAULT_MIN_AREA_PROJECTED = 0.25;
const DEFAULT_MIN_AREA_GEOGRAPHIC = 1e-12;

/** Toleransi snap default (meter) untuk CRS terproyeksi UTM/TM-3 Indonesia. */
export const DEFAULT_DXF_POLYGONIZE_SNAP_METERS = 0.05;

/** SRID geografis (derajat) — toleransi kecil setara ~5 cm di khatulistiwa. */
const GEOGRAPHIC_SNAP_TOLERANCE = 5e-7;

export function isGeographicSrid(srid: number): boolean {
  return srid === 4326;
}

export function defaultSnapToleranceForSrid(srid: number): number {
  return isGeographicSrid(srid)
    ? GEOGRAPHIC_SNAP_TOLERANCE
    : DEFAULT_DXF_POLYGONIZE_SNAP_METERS;
}

export function defaultMinAreaForSrid(srid: number): number {
  return isGeographicSrid(srid)
    ? DEFAULT_MIN_AREA_GEOGRAPHIC
    : DEFAULT_MIN_AREA_PROJECTED;
}

function dist2(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pointsEqual(
  a: [number, number],
  b: [number, number],
  tol: number
): boolean {
  return dist(a, b) <= tol;
}

function segmentInteriorIntersection(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number],
  tol: number
): [number, number] | null {
  const x1 = a1[0];
  const y1 = a1[1];
  const x2 = a2[0];
  const y2 = a2[1];
  const x3 = b1[0];
  const y3 = b1[1];
  const x4 = b2[0];
  const y4 = b2[1];

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-20) return null;

  const t =
    ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u =
    ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / denom;

  const eps = tol * 1e-3;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;

  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

function snapEndpoints(
  segments: LineSegment[],
  tolerance: number
): LineSegment[] {
  const canonical: [number, number][] = [];

  const snap = (p: [number, number]): [number, number] => {
    const tol2 = tolerance * tolerance;
    for (const c of canonical) {
      if (dist2(p, c) <= tol2) return c;
    }
    canonical.push(p);
    return p;
  };

  return segments.map(([a, b]) => [snap(a), snap(b)] as LineSegment);
}

function dedupeSegments(
  segments: LineSegment[],
  tolerance: number
): LineSegment[] {
  const seen = new Set<string>();
  const out: LineSegment[] = [];

  const keyFor = (a: [number, number], b: [number, number]): string => {
    const da = `${a[0].toFixed(9)},${a[1].toFixed(9)}`;
    const db = `${b[0].toFixed(9)},${b[1].toFixed(9)}`;
    return da < db ? `${da}|${db}` : `${db}|${da}`;
  };

  for (const [a, b] of segments) {
    if (pointsEqual(a, b, tolerance)) continue;
    const k = keyFor(a, b);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([a, b]);
  }
  return out;
}

function splitSegmentAtPoints(
  a: [number, number],
  b: [number, number],
  points: [number, number][],
  tolerance: number
): LineSegment[] {
  const len = dist(a, b);
  if (len < tolerance) return [];

  const withT: Array<{ t: number; p: [number, number] }> = [{ t: 0, p: a }];
  for (const p of points) {
    if (pointsEqual(p, a, tolerance) || pointsEqual(p, b, tolerance)) continue;
    const ap = dist(a, p);
    const t = ap / len;
    if (t > 1e-9 && t < 1 - 1e-9) {
      withT.push({ t, p });
    }
  }
  withT.push({ t: 1, p: b });
  withT.sort((x, y) => x.t - y.t);

  const parts: LineSegment[] = [];
  for (let i = 0; i < withT.length - 1; i++) {
    const p0 = withT[i]!.p;
    const p1 = withT[i + 1]!.p;
    if (!pointsEqual(p0, p1, tolerance)) {
      parts.push([p0, p1]);
    }
  }
  return parts;
}

function nodeSegments(
  segments: LineSegment[],
  tolerance: number
): LineSegment[] {
  let current = segments;
  let changed = true;
  let guard = 0;

  while (changed && guard < 32) {
    guard++;
    changed = false;
    const next: LineSegment[] = [];

    for (let i = 0; i < current.length; i++) {
      const [a1, a2] = current[i]!;
      const splits: [number, number][] = [];

      for (let j = 0; j < current.length; j++) {
        if (i === j) continue;
        const [b1, b2] = current[j]!;
        const hit = segmentInteriorIntersection(a1, a2, b1, b2, tolerance);
        if (hit) {
          splits.push(hit);
          changed = true;
        }
      }

      for (const [b1, b2] of current) {
        for (const endpoint of [b1, b2] as const) {
          if (pointsEqual(endpoint, a1, tolerance) || pointsEqual(endpoint, a2, tolerance)) {
            continue;
          }
          const len = dist(a1, a2);
          if (len < tolerance) continue;
          const ap = dist(a1, endpoint);
          const bp = dist(a2, endpoint);
          const perp = Math.abs(ap + bp - len);
          if (perp <= tolerance && ap > tolerance && bp > tolerance) {
            splits.push(endpoint);
            changed = true;
          }
        }
      }

      next.push(...splitSegmentAtPoints(a1, a2, splits, tolerance));
    }

    current = dedupeSegments(next, tolerance);
  }

  return current;
}

function ringAreaAbs(ring: LinearRing): number {
  let area = 0;
  const n = ring.length;
  if (n < 3) return 0;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = ring[i]!;
    const [x1, y1] = ring[i + 1]!;
    area += x0 * y1 - x1 * y0;
  }
  const [xl, yl] = ring[n - 1]!;
  const [x0, y0] = ring[0]!;
  area += xl * y0 - x0 * yl;
  return Math.abs(area / 2);
}

function closeRing(ring: LinearRing): LinearRing {
  if (ring.length === 0) return ring;
  const [fx, fy] = ring[0]!;
  const [lx, ly] = ring[ring.length - 1]!;
  if (fx === lx && fy === ly) return ring;
  return [...ring, ring[0]!];
}

function filterPolygonRings(
  rings: LinearRing[],
  options: DxfPolygonizeOptions
): LinearRing[] {
  const minArea = options.minArea ?? DEFAULT_MIN_AREA_PROJECTED;
  let filtered = rings.filter((r) => ringAreaAbs(r) >= minArea);

  if (options.dropLargestFace !== false && filtered.length > 1) {
    let maxIdx = 0;
    let maxArea = ringAreaAbs(filtered[0]!);
    for (let i = 1; i < filtered.length; i++) {
      const a = ringAreaAbs(filtered[i]!);
      if (a > maxArea) {
        maxArea = a;
        maxIdx = i;
      }
    }
    const rest = filtered.filter((_, i) => i !== maxIdx);
    const restMax = rest.reduce(
      (m, r) => Math.max(m, ringAreaAbs(r)),
      0
    );
    if (maxArea > restMax * 3) {
      filtered = rest;
    }
  }

  return filtered;
}

/**
 * Bangun poligon tertutup dari jaringan segmen garis (snap → noding → dedup → polygonize).
 */
export function polygonizeLineSegments(
  segments: LineSegment[],
  options: DxfPolygonizeOptions
): DxfPolygonizeResult {
  const warnings: string[] = [];
  const tolerance = Math.max(options.snapTolerance, 1e-12);

  if (segments.length === 0) {
    return {
      rings: [],
      segmentCount: 0,
      nodedSegmentCount: 0,
      polygonCountBeforeFilter: 0,
      warnings: ["Tidak ada segmen garis untuk dipolygonize."],
    };
  }

  const snapped = snapEndpoints(segments, tolerance);
  const noded = nodeSegments(snapped, tolerance);
  const deduped = dedupeSegments(noded, tolerance);

  if (deduped.length === 0) {
    return {
      rings: [],
      segmentCount: segments.length,
      nodedSegmentCount: 0,
      polygonCountBeforeFilter: 0,
      warnings: ["Semua segmen terlalu pendek setelah snap/noding."],
    };
  }

  const lines = featureCollection(
    deduped.map(([a, b]) => lineString([a, b]))
  );

  let rawRings: LinearRing[] = [];
  try {
    const polyFc = polygonize(lines);
    for (const feat of polyFc.features) {
      const geom = feat.geometry;
      if (geom.type !== "Polygon") continue;
      const ring = geom.coordinates[0];
      if (!ring || ring.length < 4) continue;
      const linear: LinearRing = ring.map(
        (c) => [c[0]!, c[1]!] as [number, number]
      );
      rawRings.push(closeRing(linear));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "polygonize gagal";
    warnings.push(msg);
    return {
      rings: [],
      segmentCount: segments.length,
      nodedSegmentCount: deduped.length,
      polygonCountBeforeFilter: 0,
      warnings,
    };
  }

  const beforeFilter = rawRings.length;
  if (beforeFilter === 0) {
    warnings.push(
      "Garis tidak membentuk loop tertutup. Periksa layer, toleransi snap, atau tutup batas di CAD."
    );
  }

  const minArea =
    options.minArea ??
    (tolerance < 1e-4
      ? DEFAULT_MIN_AREA_GEOGRAPHIC
      : DEFAULT_MIN_AREA_PROJECTED);

  const rings = filterPolygonRings(rawRings, {
    ...options,
    minArea,
  });

  if (beforeFilter > 0 && rings.length === 0) {
    warnings.push(
      "Poligon terbentuk tetapi semua difilter (terlalu kecil atau face luar saja)."
    );
  } else if (beforeFilter > rings.length) {
    warnings.push(
      `${beforeFilter - rings.length} poligon dibuang (luas minimum / face luar).`
    );
  }

  return {
    rings,
    segmentCount: segments.length,
    nodedSegmentCount: deduped.length,
    polygonCountBeforeFilter: beforeFilter,
    warnings,
  };
}
