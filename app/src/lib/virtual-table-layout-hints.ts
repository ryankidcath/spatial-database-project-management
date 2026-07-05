import type { VirtualColumnDataType } from "@/app/virtual-table-types";
import type { VirtualTableLayoutType } from "@/lib/virtual-table-layout-types";
import {
  dateColumnSlugs,
  fileColumnSlugs,
  geometryColumnSlugs,
  getLayoutAvailability,
  selectColumnSlugs,
} from "@/lib/virtual-table-layout-availability";
import type { VirtualColumnRow } from "@/app/virtual-table-types";

export type LayoutColumnHint = {
  layout: VirtualTableLayoutType;
  dataType: VirtualColumnDataType;
  suggestedName: string;
  message: string;
};

export const LAYOUT_COLUMN_HINTS: LayoutColumnHint[] = [
  {
    layout: "kanban",
    dataType: "select",
    suggestedName: "Status",
    message: "Tambah kolom Status (pilihan) untuk Kanban",
  },
  {
    layout: "calendar",
    dataType: "date",
    suggestedName: "Tanggal",
    message: "Tambah kolom Tanggal untuk Kalender",
  },
  {
    layout: "timeline",
    dataType: "date",
    suggestedName: "Tanggal mulai",
    message: "Tambah kolom tanggal untuk Timeline",
  },
  {
    layout: "gallery",
    dataType: "file",
    suggestedName: "Cover",
    message: "Tambah kolom file untuk cover Galeri",
  },
  {
    layout: "map",
    dataType: "geometry",
    suggestedName: "Geometri",
    message: "Tambah kolom Geometri untuk Peta",
  },
  {
    layout: "chart",
    dataType: "select",
    suggestedName: "Kategori",
    message: "Tambah kolom pilihan untuk Chart",
  },
];

export function missingLayoutHints(
  columns: VirtualColumnRow[]
): LayoutColumnHint[] {
  const availability = getLayoutAvailability(columns);
  return LAYOUT_COLUMN_HINTS.filter((h) => !availability[h.layout]?.available);
}

export function hintForLayout(
  layout: VirtualTableLayoutType,
  columns: VirtualColumnRow[]
): LayoutColumnHint | null {
  const availability = getLayoutAvailability(columns);
  if (availability[layout]?.available) return null;
  return LAYOUT_COLUMN_HINTS.find((h) => h.layout === layout) ?? null;
}

export function numberColumnSlugs(columns: VirtualColumnRow[]): string[] {
  return columns.filter((c) => c.data_type === "number").map((c) => c.slug);
}

export { selectColumnSlugs, dateColumnSlugs, fileColumnSlugs, geometryColumnSlugs };
