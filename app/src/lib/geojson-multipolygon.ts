/** Koordinat ring → polygon → multipolygon (2D) untuk GeoJSON & WKT. */

export type Position = [number, number];
export type LinearRing = Position[];
export type PolygonCoords = LinearRing[];
export type MultiPolygonCoords = PolygonCoords[];

function closeRingIfNeeded(ring: LinearRing): LinearRing {
  if (ring.length === 0) return ring;
  const [ax, ay] = ring[0]!;
  const [bx, by] = ring[ring.length - 1]!;
  if (ax === bx && ay === by) return ring;
  return [...ring, ring[0]!];
}

function parseRing(raw: unknown): LinearRing | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const out: LinearRing = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length < 2) return null;
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push([x, y]);
  }
  return closeRingIfNeeded(out);
}

function parsePolygon(raw: unknown): PolygonCoords | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: PolygonCoords = [];
  for (const ring of raw) {
    const parsed = parseRing(ring);
    if (!parsed) return null;
    out.push(parsed);
  }
  return out;
}

export function extractMultiPolygonFromGeoJSON(input: unknown): MultiPolygonCoords | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as {
    type?: string;
    geometry?: unknown;
    coordinates?: unknown;
    features?: unknown[];
  };

  if (obj.type === "Feature") {
    return extractMultiPolygonFromGeoJSON(obj.geometry);
  }
  if (obj.type === "FeatureCollection") {
    if (!Array.isArray(obj.features) || obj.features.length === 0) return null;
    const all: MultiPolygonCoords = [];
    for (const f of obj.features) {
      const mp = extractMultiPolygonFromGeoJSON(f);
      if (!mp) continue;
      all.push(...mp);
    }
    return all.length > 0 ? all : null;
  }
  if (obj.type === "Polygon") {
    const poly = parsePolygon(obj.coordinates);
    return poly ? [poly] : null;
  }
  if (obj.type === "MultiPolygon") {
    if (!Array.isArray(obj.coordinates) || obj.coordinates.length === 0) return null;
    const out: MultiPolygonCoords = [];
    for (const poly of obj.coordinates) {
      const parsed = parsePolygon(poly);
      if (!parsed) return null;
      out.push(parsed);
    }
    return out;
  }
  return null;
}

export function multiPolygonToWKT(coords: MultiPolygonCoords): string {
  const polyText = coords
    .map((poly) => {
      const rings = poly
        .map((ring) => `(${ring.map(([x, y]) => `${x} ${y}`).join(", ")})`)
        .join(", ");
      return `(${rings})`;
    })
    .join(", ");
  return `MULTIPOLYGON(${polyText})`;
}
