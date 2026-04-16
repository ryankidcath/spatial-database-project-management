import area from "@turf/area";
import intersect from "@turf/intersect";
import { feature, featureCollection } from "@turf/helpers";
import type { Geometry, MultiPolygon, Polygon } from "geojson";

/** Luas irisan di bawah ini dianggap noise numerik (m², WGS84 seperti @turf/area). */
const MIN_OVERLAP_AREA_SQ_M = 1e-4;

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

function isPolygonalGeometry(g: Geometry): boolean {
  return g.type === "Polygon" || g.type === "MultiPolygon";
}

/**
 * True hanya bila ada **irisan berupa luasan 2D** (bukan sekadar titik/garis batas).
 * Catatan: `@turf/boolean-overlap` untuk Polygon memakai `lineIntersect` antar segmen
 * sehingga sentuhan ujung garis / batas ikut `true` — tidak cocok untuk QC overlap.
 */
function hasPolygonAreaOverlap(a: Geometry, b: Geometry): boolean {
  if (!isPolygonalGeometry(a) || !isPolygonalGeometry(b)) return false;
  try {
    const fc = featureCollection([
      feature(a as Polygon | MultiPolygon),
      feature(b as Polygon | MultiPolygon),
    ]);
    const ix = intersect(fc);
    if (ix == null) return false;
    return area(ix) > MIN_OVERLAP_AREA_SQ_M;
  } catch {
    return false;
  }
}

export type MapOverlapItem =
  | { kind: "hasil_hasil"; labelA: string; labelB: string }
  | { kind: "demo_hasil"; demoLabel: string; hasilLabel: string };

/**
 * Peringatan tumpang tindih spasial (klien) — selaras §10.3 overlap + UX.
 * Hanya pasangan dengan **irisan poligonal berluasan** (bukan sekadar titik/garis sentuh).
 * Membandingkan poligon «hasil» (hasil ukur + geometri task), serta footprint
 * demo vs setiap poligon «hasil».
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
      const gi = hasilGeoms[i].geom;
      const gj = hasilGeoms[j].geom;
      if (!isPolygonalGeometry(gi) || !isPolygonalGeometry(gj)) continue;
      try {
        if (hasPolygonAreaOverlap(gi, gj)) {
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
      if (!isPolygonalGeometry(d.geom) || !isPolygonalGeometry(h.geom)) continue;
      try {
        if (hasPolygonAreaOverlap(d.geom, h.geom)) {
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
