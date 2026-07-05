import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Calendar,
  Columns3,
  FileText,
  GanttChart,
  LayoutGrid,
  Map,
  Table2,
} from "lucide-react";

/** Jenis layout tampilan data per tabel. */
export type VirtualTableLayoutType =
  | "grid"
  | "kanban"
  | "calendar"
  | "timeline"
  | "gallery"
  | "form"
  | "map"
  | "chart";

export type VirtualTableLayoutMeta = {
  type: VirtualTableLayoutType;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** Fase 2: false = tampil di menu tapi belum bisa dipilih. */
  enabled: boolean;
};

export const VIRTUAL_TABLE_LAYOUTS: VirtualTableLayoutMeta[] = [
  { type: "grid", label: "Grid", shortLabel: "Grid", icon: Table2, enabled: true },
  {
    type: "kanban",
    label: "Kanban",
    shortLabel: "Kanban",
    icon: Columns3,
    enabled: false,
  },
  {
    type: "calendar",
    label: "Kalender",
    shortLabel: "Kalender",
    icon: Calendar,
    enabled: false,
  },
  {
    type: "timeline",
    label: "Timeline",
    shortLabel: "Timeline",
    icon: GanttChart,
    enabled: false,
  },
  {
    type: "gallery",
    label: "Galeri",
    shortLabel: "Galeri",
    icon: LayoutGrid,
    enabled: false,
  },
  { type: "form", label: "Form", shortLabel: "Form", icon: FileText, enabled: false },
  { type: "map", label: "Peta", shortLabel: "Peta", icon: Map, enabled: false },
  {
    type: "chart",
    label: "Chart",
    shortLabel: "Chart",
    icon: BarChart3,
    enabled: false,
  },
];

const LAYOUT_TYPE_SET = new Set<string>(
  VIRTUAL_TABLE_LAYOUTS.map((l) => l.type)
);

export function isVirtualTableLayoutType(
  value: string
): value is VirtualTableLayoutType {
  return LAYOUT_TYPE_SET.has(value);
}

export function layoutMetaFor(
  type: VirtualTableLayoutType
): VirtualTableLayoutMeta {
  return (
    VIRTUAL_TABLE_LAYOUTS.find((l) => l.type === type) ?? VIRTUAL_TABLE_LAYOUTS[0]!
  );
}
