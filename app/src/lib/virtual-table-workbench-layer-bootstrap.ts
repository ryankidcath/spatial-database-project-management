/** Skema tabel virtual workbench kosong untuk digitasi per layer (CAD-style). */

import { LAYER_COLUMN_DEFS } from "./virtual-table-layer-bootstrap";

export type WorkbenchLayerKind = "bidang" | "jalan" | "saluran";

export const LINE_LAYER_TITLE_COLUMN_SLUG = "title";
export const LINE_LAYER_MATCH_COLUMN_SLUG = "no_garis";
export const LINE_LAYER_GEOMETRY_COLUMN_SLUG = "geom";

export const LINE_LAYER_COLUMN_DEFS = [
  {
    slug: LINE_LAYER_TITLE_COLUMN_SLUG,
    display_name: "Judul",
    data_type: "text" as const,
    position: 0,
    is_required: true,
  },
  {
    slug: LINE_LAYER_MATCH_COLUMN_SLUG,
    display_name: "No. garis",
    data_type: "text" as const,
    position: 1,
    is_required: true,
  },
  {
    slug: LINE_LAYER_GEOMETRY_COLUMN_SLUG,
    display_name: "Geometri",
    data_type: "geometry" as const,
    position: 2,
    is_required: true,
  },
];

export const WORKBENCH_LAYER_KIND_LABELS: Record<WorkbenchLayerKind, string> = {
  bidang: "Bidang",
  jalan: "Jalan",
  saluran: "Saluran",
};

export const WORKBENCH_LAYER_KIND_ICONS: Record<WorkbenchLayerKind, string> = {
  bidang: "📐",
  jalan: "🛣️",
  saluran: "💧",
};

export function workbenchLayerColumnDefs(kind: WorkbenchLayerKind) {
  return kind === "bidang" ? LAYER_COLUMN_DEFS : LINE_LAYER_COLUMN_DEFS;
}

export function defaultWorkbenchLayerTableName(kind: WorkbenchLayerKind): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${WORKBENCH_LAYER_KIND_LABELS[kind]} (${date})`;
}

export function workbenchLayerKindDescription(kind: WorkbenchLayerKind): string {
  switch (kind) {
    case "bidang":
      return "Digitasi poligon bidang (Alat → Gambar bidang). Kunci upsert: no_bidang.";
    case "jalan":
      return "Digitasi garis jalan (Alat → Gambar garis). Kunci upsert: no_garis.";
    case "saluran":
      return "Digitasi garis saluran/irigasi (Alat → Gambar garis). Kunci upsert: no_garis.";
  }
}

export function parseWorkbenchLayerKind(raw: string): WorkbenchLayerKind | null {
  const k = raw.trim().toLowerCase();
  if (k === "bidang" || k === "jalan" || k === "saluran") return k;
  return null;
}
