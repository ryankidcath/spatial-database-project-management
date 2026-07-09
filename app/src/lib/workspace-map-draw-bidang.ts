import { extractMultiPolygonFromGeoJSON } from "@/lib/geojson-multipolygon";
import { ringHasSelfIntersection } from "@/lib/points-to-polygon-import";
import { extractWgs84PointFromStoredGeometry } from "@/lib/regenerate-bidang-from-survey-points";

export type LatLngPoint = { lat: number; lng: number };

export const DEFAULT_SNAP_PIXEL_TOLERANCE = 18;

/** Vertex poligon + titik Point dari lapisan aktif untuk snap (WGS84). */
export function collectSnapVerticesFromFootprints(
  footprints: { geojson: unknown }[]
): LatLngPoint[] {
  const out: LatLngPoint[] = [];
  const seen = new Set<string>();
  const add = (lat: number, lng: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const key = `${lng.toFixed(7)},${lat.toFixed(7)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ lat, lng });
  };

  for (const fp of footprints) {
    const pt = extractWgs84PointFromStoredGeometry(fp.geojson);
    if (pt) {
      add(pt.lat, pt.lng);
      continue;
    }
    const mp = extractMultiPolygonFromGeoJSON(fp.geojson);
    if (!mp) continue;
    for (const poly of mp) {
      const ring = poly[0];
      if (!ring) continue;
      for (const [lng, lat] of ring) {
        add(lat, lng);
      }
    }
  }
  return out;
}

export function closeLatLngRing(points: LatLngPoint[]): LatLngPoint[] {
  if (points.length === 0) return points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first.lat === last.lat && first.lng === last.lng) return points;
  return [...points, first];
}

export function latLngRingToLinearRing(points: LatLngPoint[]): [number, number][] {
  const closed = closeLatLngRing(points);
  return closed.map((p) => [p.lng, p.lat] as [number, number]);
}

export function validateDrawnBidangRing(
  points: LatLngPoint[]
): { ok: true } | { ok: false; error: string } {
  if (points.length < 3) {
    return { ok: false, error: "Minimal 3 sudut untuk membentuk bidang." };
  }
  const unique = new Set(points.map((p) => `${p.lng},${p.lat}`));
  if (unique.size < 3) {
    return { ok: false, error: "Minimal 3 titik unik." };
  }
  const ring = latLngRingToLinearRing(points);
  if (ringHasSelfIntersection(ring)) {
    return {
      ok: false,
      error: "Poligon self-intersect. Perbaiki urutan sudut.",
    };
  }
  return { ok: true };
}

/** Feature WGS84 untuk impor virtual_rows. */
export function buildDrawnBidangGeoJsonFeature(
  points: LatLngPoint[],
  matchKey: string,
  matchColumnSlug: string,
  label?: string | null
): GeoJSON.Feature {
  const slug = matchColumnSlug.trim();
  if (!slug) throw new Error("match_column_slug kosong");
  const ring = latLngRingToLinearRing(points);
  if (ring.length < 4) {
    throw new Error("Poligon tidak valid (terlalu sedikit titik).");
  }
  const displayLabel =
    label != null && label.trim() !== ""
      ? label.trim()
      : `Bidang ${matchKey}`;
  return {
    type: "Feature",
    properties: {
      [slug]: matchKey,
      label: displayLabel,
      source: "map_draw",
    },
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
  };
}
