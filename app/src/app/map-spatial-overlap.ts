import booleanIntersects from "@turf/boolean-intersects";
import type { Geometry } from "geojson";

function asGeometry(geojson: unknown): Geometry | null {
  if (!geojson || typeof geojson !== "object") return null;
  const g = geojson as { type?: string };
  const t = g.type;
  if (
    t === "Polygon" ||
    t === "MultiPolygon" ||
    t === "LineString" ||
    t === "MultiLineString" ||
    t === "Point" ||
    t === "MultiPoint" ||
    t === "GeometryCollection"
  ) {
    return geojson as Geometry;
  }
  return null;
}

export type MapOverlapItem =
  | { kind: "hasil_hasil"; labelA: string; labelB: string }
  | { kind: "demo_hasil"; demoLabel: string; hasilLabel: string };

/**
 * Peringatan tumpang tindih spasial (klien) — selaras §10.3 overlap + UX.
 * Membandingkan pasangan bidang hasil ukur, serta footprint demo vs hasil ukur.
 */
export function findMapOverlapWarnings(
  demoRows: { label: string; geojson: unknown }[],
  hasilRows: { label: string; geojson: unknown }[]
): MapOverlapItem[] {
  const out: MapOverlapItem[] = [];
  const demoGeoms = demoRows
    .map((r) => ({ label: r.label, geom: asGeometry(r.geojson) }))
    .filter((x): x is { label: string; geom: Geometry } => x.geom != null);
  const hasilGeoms = hasilRows
    .map((r) => ({ label: r.label, geom: asGeometry(r.geojson) }))
    .filter((x): x is { label: string; geom: Geometry } => x.geom != null);

  for (let i = 0; i < hasilGeoms.length; i++) {
    for (let j = i + 1; j < hasilGeoms.length; j++) {
      try {
        if (booleanIntersects(hasilGeoms[i].geom, hasilGeoms[j].geom)) {
          out.push({
            kind: "hasil_hasil",
            labelA: hasilGeoms[i].label,
            labelB: hasilGeoms[j].label,
          });
        }
      } catch {
        /* geometri tidak valid untuk Turf */
      }
    }
  }

  for (const d of demoGeoms) {
    for (const h of hasilGeoms) {
      try {
        if (booleanIntersects(d.geom, h.geom)) {
          out.push({
            kind: "demo_hasil",
            demoLabel: d.label,
            hasilLabel: h.label,
          });
        }
      } catch {
        /* skip */
      }
    }
  }

  return out;
}
