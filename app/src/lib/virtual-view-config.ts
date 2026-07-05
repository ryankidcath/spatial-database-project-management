import {
  isVirtualTableLayoutType,
  type VirtualTableLayoutType,
} from "@/lib/virtual-table-layout-types";
import type {
  VirtualViewConfig,
  VirtualViewLayoutOptions,
} from "@/app/virtual-table-types";

export function emptyVirtualViewConfig(): VirtualViewConfig {
  return {
    filters: [],
    sorts: [],
    groupBy: null,
    visibleColumns: [],
    columnWidths: {},
    layoutType: "grid",
    layoutOptions: {},
  };
}

export function normalizeVirtualViewConfig(
  raw: Partial<VirtualViewConfig> | null | undefined
): VirtualViewConfig {
  const base = emptyVirtualViewConfig();
  if (!raw || typeof raw !== "object") return base;

  const layoutType =
    raw.layoutType && isVirtualTableLayoutType(raw.layoutType)
      ? raw.layoutType
      : base.layoutType;

  const layoutOptions: VirtualViewLayoutOptions = {
    statusColumn:
      typeof raw.layoutOptions?.statusColumn === "string"
        ? raw.layoutOptions.statusColumn
        : null,
    dateColumn:
      typeof raw.layoutOptions?.dateColumn === "string"
        ? raw.layoutOptions.dateColumn
        : null,
    endDateColumn:
      typeof raw.layoutOptions?.endDateColumn === "string"
        ? raw.layoutOptions.endDateColumn
        : null,
    coverColumn:
      typeof raw.layoutOptions?.coverColumn === "string"
        ? raw.layoutOptions.coverColumn
        : null,
    geometryColumn:
      typeof raw.layoutOptions?.geometryColumn === "string"
        ? raw.layoutOptions.geometryColumn
        : null,
    chartColumn:
      typeof raw.layoutOptions?.chartColumn === "string"
        ? raw.layoutOptions.chartColumn
        : null,
    chartMode:
      raw.layoutOptions?.chartMode === "bar" ||
      raw.layoutOptions?.chartMode === "pie" ||
      raw.layoutOptions?.chartMode === "stat"
        ? raw.layoutOptions.chartMode
        : "bar",
  };

  return {
    filters: Array.isArray(raw.filters) ? raw.filters : base.filters,
    sorts: Array.isArray(raw.sorts) ? raw.sorts : base.sorts,
    groupBy: raw.groupBy ?? base.groupBy,
    visibleColumns: Array.isArray(raw.visibleColumns)
      ? raw.visibleColumns
      : base.visibleColumns,
    columnWidths:
      raw.columnWidths && typeof raw.columnWidths === "object"
        ? raw.columnWidths
        : base.columnWidths,
    layoutType,
    layoutOptions,
  };
}

export function layoutTypeFromConfig(
  config: Partial<VirtualViewConfig> | null | undefined
): VirtualTableLayoutType {
  return normalizeVirtualViewConfig(config).layoutType ?? "grid";
}
