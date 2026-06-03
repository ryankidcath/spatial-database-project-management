/** Skema minimal layer QGIS-style: judul + kunci bidang + geometri. */

export const LAYER_TITLE_COLUMN_SLUG = "title";
export const LAYER_MATCH_COLUMN_SLUG = "no_bidang";
export const LAYER_GEOMETRY_COLUMN_SLUG = "geom";

export const LAYER_COLUMN_DEFS = [
  {
    slug: LAYER_TITLE_COLUMN_SLUG,
    display_name: "Judul",
    data_type: "text" as const,
    position: 0,
    is_required: true,
  },
  {
    slug: LAYER_MATCH_COLUMN_SLUG,
    display_name: "No. bidang",
    data_type: "text" as const,
    position: 1,
    is_required: true,
  },
  {
    slug: LAYER_GEOMETRY_COLUMN_SLUG,
    display_name: "Geometri",
    data_type: "geometry" as const,
    position: 2,
    is_required: true,
  },
];

export function defaultLayerDisplayNameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/i, "").trim() || "Layer";
  const date = new Date().toISOString().slice(0, 10);
  return `${base} (${date})`;
}
