import { reprojectLinearRingTo4326 } from "@/lib/crs-reproject";
import type { LinearRing } from "@/lib/dxf-import-utils";
import type { SurveyPoint } from "@/lib/points-to-polygon-import";
import {
  surveyPointMatchKey,
  SURVEY_POINT_MATCH_COLUMN_SLUG,
  SURVEY_POINT_NAMA_SLUG,
  SURVEY_POINT_NO_BIDANG_SLUG,
  SURVEY_POINT_URUTAN_SLUG,
} from "@/lib/virtual-table-survey-points-bootstrap";

export { VIRTUAL_TABLE_POINTS_SOURCE_SRID_OPTIONS as SURVEY_POINTS_ARCHIVE_SOURCE_SRID_OPTIONS } from "@/lib/virtual-table-points-import";
export { parseVirtualTablePointsSourceSrid as parseSurveyPointsArchiveSourceSrid } from "@/lib/virtual-table-points-import";

/** FeatureCollection WGS84 — satu baris = satu titik (tanpa membentuk poligon). */
export function buildSurveyPointsArchiveFeatureCollection(
  points: SurveyPoint[],
  matchColumnSlug: string,
  sourceEpsg: number,
  columnSlugs?: {
    noBidang?: string;
    urutan?: string;
    namaTitik?: string;
  }
): GeoJSON.FeatureCollection {
  const matchSlug = matchColumnSlug.trim() || SURVEY_POINT_MATCH_COLUMN_SLUG;
  const noBidangSlug = columnSlugs?.noBidang?.trim() || SURVEY_POINT_NO_BIDANG_SLUG;
  const urutanSlug = columnSlugs?.urutan?.trim() || SURVEY_POINT_URUTAN_SLUG;
  const namaSlug = columnSlugs?.namaTitik?.trim() || SURVEY_POINT_NAMA_SLUG;

  const features: GeoJSON.Feature[] = [];
  for (const p of points) {
    const ring: LinearRing = [[p.x, p.y]];
    const ll = reprojectLinearRingTo4326(ring, sourceEpsg);
    const pt = ll[0];
    if (!pt) {
      throw new Error(
        `Titik ${p.bidangKey} #${p.urutan}: koordinat tidak valid setelah proyeksi.`
      );
    }
    const [lng, lat] = pt;
    const kode = surveyPointMatchKey(p.bidangKey, p.urutan);
    const nama =
      p.namaTitik?.trim() ||
      `T${Number.isFinite(p.urutan) ? Math.trunc(p.urutan) + 1 : features.length + 1}`;
    features.push({
      type: "Feature",
      properties: {
        [matchSlug]: kode,
        [noBidangSlug]: p.bidangKey,
        [urutanSlug]: p.urutan,
        [namaSlug]: nama,
        label: `${p.bidangKey} · ${nama}`,
        source: "survey_points_archive",
      },
      geometry: {
        type: "Point",
        coordinates: [lng, lat],
      },
    });
  }
  return { type: "FeatureCollection", features };
}

/** FeatureCollection titik lapangan mentah — label T1,T2… (cocok sketsa kertas). */
export function buildFieldPointsArchiveFeatureCollection(
  points: SurveyPoint[],
  matchColumnSlug: string,
  sourceEpsg: number,
  columnSlugs?: {
    noBidang?: string;
    urutan?: string;
    namaTitik?: string;
  }
): GeoJSON.FeatureCollection {
  const matchSlug = matchColumnSlug.trim() || SURVEY_POINT_MATCH_COLUMN_SLUG;
  const noBidangSlug = columnSlugs?.noBidang?.trim() || SURVEY_POINT_NO_BIDANG_SLUG;
  const urutanSlug = columnSlugs?.urutan?.trim() || SURVEY_POINT_URUTAN_SLUG;
  const namaSlug = columnSlugs?.namaTitik?.trim() || SURVEY_POINT_NAMA_SLUG;

  const features: GeoJSON.Feature[] = [];
  for (const p of points) {
    const ring: LinearRing = [[p.x, p.y]];
    const ll = reprojectLinearRingTo4326(ring, sourceEpsg);
    const pt = ll[0];
    if (!pt) {
      throw new Error(
        `Titik #${p.urutan}: koordinat tidak valid setelah proyeksi.`
      );
    }
    const [lng, lat] = pt;
    const kode = surveyPointMatchKey(p.bidangKey, p.urutan);
    const nama =
      p.namaTitik?.trim() ||
      `T${Number.isFinite(p.urutan) ? Math.trunc(p.urutan) : features.length + 1}`;
    features.push({
      type: "Feature",
      properties: {
        [matchSlug]: kode,
        [noBidangSlug]: p.bidangKey,
        [urutanSlug]: p.urutan,
        [namaSlug]: nama,
        label: nama,
        source: "field_points",
      },
      geometry: {
        type: "Point",
        coordinates: [lng, lat],
      },
    });
  }
  return { type: "FeatureCollection", features };
}
