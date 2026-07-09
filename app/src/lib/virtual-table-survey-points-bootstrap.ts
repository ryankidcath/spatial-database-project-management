/** Skema tabel virtual untuk arsip titik ukur lapangan. */

/** Grup placeholder saat impor titik mentah (satu file, tanpa no_bidang per baris). */
export const FIELD_SURVEY_GROUP_KEY = "LAPANGAN";

export const SURVEY_POINT_NO_BIDANG_SLUG = "no_bidang";
export const SURVEY_POINT_MATCH_COLUMN_SLUG = "kode_titik";
export const SURVEY_POINT_URUTAN_SLUG = "urutan";
export const SURVEY_POINT_NAMA_SLUG = "nama_titik";
export const SURVEY_POINT_GEOM_SLUG = "geom";

export const SURVEY_POINT_COLUMN_DEFS = [
  {
    slug: SURVEY_POINT_NO_BIDANG_SLUG,
    display_name: "No. bidang",
    data_type: "text" as const,
    position: 0,
    is_required: true,
  },
  {
    slug: SURVEY_POINT_MATCH_COLUMN_SLUG,
    display_name: "Kode titik",
    data_type: "text" as const,
    position: 1,
    is_required: true,
  },
  {
    slug: SURVEY_POINT_URUTAN_SLUG,
    display_name: "Urutan",
    data_type: "number" as const,
    position: 2,
    is_required: true,
  },
  {
    slug: SURVEY_POINT_NAMA_SLUG,
    display_name: "Nama titik",
    data_type: "text" as const,
    position: 3,
    is_required: false,
  },
  {
    slug: SURVEY_POINT_GEOM_SLUG,
    display_name: "Koordinat titik",
    data_type: "geometry" as const,
    position: 4,
    is_required: true,
  },
];

export function surveyPointMatchKey(noBidang: string, urutan: number): string {
  const key = noBidang.trim();
  const ord = Number.isFinite(urutan) ? Math.trunc(urutan) : 0;
  return `${key}::${ord}`;
}

export function defaultSurveyPointTableName(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `Titik ukur (${date})`;
}

export function defaultFieldPointTableName(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `Titik lapangan (${date})`;
}

/** Label titik untuk cocokkan sketsa kertas (T1, T2, …). */
export function fieldPointDisplayLabel(urutan1Based: number): string {
  const n = Number.isFinite(urutan1Based) ? Math.trunc(urutan1Based) : 0;
  return `T${Math.max(1, n)}`;
}
