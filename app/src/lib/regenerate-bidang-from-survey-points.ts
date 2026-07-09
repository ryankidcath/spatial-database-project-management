import { ringHasSelfIntersection } from "@/lib/points-to-polygon-import";
import { closeLatLngRing, latLngRingToLinearRing } from "@/lib/workspace-map-draw-bidang";

export type ArchivedSurveyPointRow = {
  urutan: number;
  lng: number;
  lat: number;
  rowId?: string;
};

/** Ambil koordinat WGS84 dari nilai kolom geometry (Feature/Point). */
export function extractWgs84PointFromStoredGeometry(
  geo: unknown
): { lng: number; lat: number } | null {
  if (!geo || typeof geo !== "object") return null;
  const g = geo as {
    type?: string;
    geometry?: { type?: string; coordinates?: unknown };
    coordinates?: unknown;
  };
  let coords: unknown = null;
  if (g.type === "Feature" && g.geometry?.type === "Point") {
    coords = g.geometry.coordinates;
  } else if (g.type === "Point") {
    coords = g.coordinates;
  }
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

export function groupArchivedPointsByBidang(
  rows: {
    payload: Record<string, unknown>;
    rowId?: string;
  }[],
  noBidangSlug: string,
  urutanSlug: string,
  geometrySlug: string
): Map<string, ArchivedSurveyPointRow[]> {
  const byBidang = new Map<string, ArchivedSurveyPointRow[]>();
  for (const row of rows) {
    const noBidang = String(row.payload[noBidangSlug] ?? "").trim();
    if (!noBidang) continue;
    const pt = extractWgs84PointFromStoredGeometry(row.payload[geometrySlug]);
    if (!pt) continue;
    const urutanRaw = row.payload[urutanSlug];
    const urutan =
      typeof urutanRaw === "number"
        ? urutanRaw
        : Number(String(urutanRaw ?? "").trim());
    const ord = Number.isFinite(urutan) ? Math.trunc(urutan) : 0;
    const list = byBidang.get(noBidang) ?? [];
    list.push({
      urutan: ord,
      lng: pt.lng,
      lat: pt.lat,
      ...(row.rowId ? { rowId: row.rowId } : {}),
    });
    byBidang.set(noBidang, list);
  }
  for (const list of byBidang.values()) {
    list.sort((a, b) => a.urutan - b.urutan || a.lng - b.lng);
  }
  return byBidang;
}

export function buildPolygonRingFromArchivedPoints(
  points: ArchivedSurveyPointRow[]
): { ok: true; ring: [number, number][] } | { ok: false; error: string } {
  if (points.length < 3) {
    return {
      ok: false,
      error: `Minimal 3 titik (ada ${points.length}).`,
    };
  }
  const latLng = points.map((p) => ({ lat: p.lat, lng: p.lng }));
  const unique = new Set(latLng.map((p) => `${p.lng},${p.lat}`));
  if (unique.size < 3) {
    return { ok: false, error: "Minimal 3 titik unik untuk membentuk bidang." };
  }
  const ring = latLngRingToLinearRing(latLng);
  if (ringHasSelfIntersection(ring)) {
    return { ok: false, error: "Poligon self-intersect — periksa urutan titik." };
  }
  const closed = closeLatLngRing(latLng);
  if (closed.length < 4) {
    return { ok: false, error: "Ring poligon tidak valid." };
  }
  return { ok: true, ring };
}
