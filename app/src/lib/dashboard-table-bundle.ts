import type { DashboardWidget } from "@/app/virtual-dashboard-types";

export type DashboardTableBundle = {
  totalCount: number;
  /** Key: `${filter_column}\0${filter_value}` */
  filterCounts: Record<string, number>;
  /** Semua baris untuk chart; cuplikan untuk table_preview. */
  rows: Record<string, unknown>[];
};

export function dashboardFilterCountKey(column: string, value: string): string {
  return `${column}\0${value}`;
}

export type DashboardTableBundleNeeds = {
  needsChartRows: boolean;
  previewLimit: number;
  filters: { column: string; value: string }[];
};

export function bundleNeedsFromWidgets(
  widgets: DashboardWidget[]
): Map<string, DashboardTableBundleNeeds> {
  const map = new Map<string, DashboardTableBundleNeeds>();

  for (const w of widgets) {
    const cfg = w.config as Record<string, string | undefined>;
    const tableId = cfg.table_id;
    if (!tableId) continue;

    const existing = map.get(tableId) ?? {
      needsChartRows: false,
      previewLimit: 0,
      filters: [] as { column: string; value: string }[],
    };

    if (w.type === "status_pie" || w.type === "bar_by_group") {
      existing.needsChartRows = true;
    }
    if (w.type === "table_preview") {
      const lim = Number(cfg.limit);
      existing.previewLimit = Math.max(
        existing.previewLimit,
        Number.isFinite(lim) && lim > 0 ? lim : 8
      );
    }
    if (w.type === "stat" && cfg.filter_column && cfg.filter_value) {
      const column = cfg.filter_column.trim();
      const value = cfg.filter_value.trim();
      if (
        column &&
        value &&
        !existing.filters.some(
          (f) => f.column === column && f.value === value
        )
      ) {
        existing.filters.push({ column, value });
      }
    }

    map.set(tableId, existing);
  }

  return map;
}
