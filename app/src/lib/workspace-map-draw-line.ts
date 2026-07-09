import type { LatLngPoint } from "@/lib/workspace-map-draw-bidang";

export type { LatLngPoint };

/** Feature WGS84 LineString untuk impor virtual_rows. */
export function buildDrawnLineGeoJsonFeature(
  points: LatLngPoint[],
  matchKey: string,
  matchColumnSlug: string,
  label?: string | null
): GeoJSON.Feature {
  const slug = matchColumnSlug.trim();
  if (!slug) throw new Error("match_column_slug kosong");
  if (points.length < 2) {
    throw new Error("Garis tidak valid (minimal 2 titik).");
  }
  const coords = points.map(
    (p) => [p.lng, p.lat] as [number, number]
  );
  const displayLabel =
    label != null && label.trim() !== ""
      ? label.trim()
      : `Garis ${matchKey}`;
  return {
    type: "Feature",
    properties: {
      [slug]: matchKey,
      label: displayLabel,
      source: "map_draw_line",
    },
    geometry: {
      type: "LineString",
      coordinates: coords,
    },
  };
}

export function validateDrawnLine(
  points: LatLngPoint[]
): { ok: true } | { ok: false; error: string } {
  if (points.length < 2) {
    return { ok: false, error: "Minimal 2 titik untuk membentuk garis." };
  }
  const unique = new Set(points.map((p) => `${p.lng},${p.lat}`));
  if (unique.size < 2) {
    return { ok: false, error: "Minimal 2 titik unik." };
  }
  return { ok: true };
}
