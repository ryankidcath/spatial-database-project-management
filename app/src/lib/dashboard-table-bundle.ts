import type { DashboardWidget } from "@/app/virtual-dashboard-types";

export type DashboardStatusPieCounts = {
  todo: number;
  inProgress: number;
  done: number;
  other: number;
};

export type DashboardValueCountRow = {
  label: string;
  count: number;
};

export type DashboardBarByGroupRow = {
  label: string;
  count: number;
  total: number;
};

export type DashboardColumnSeriesSpec = {
  widgetId: string;
  series: { column: string; label?: string; match_value?: string }[];
};

export type DashboardTableBundle = {
  totalCount: number;
  filterCounts: Record<string, number>;
  distinctCounts: Record<string, number>;
  sumByColumn: Record<string, number>;
  rows: Record<string, unknown>[];
  statusPieByColumn: Record<string, DashboardStatusPieCounts>;
  valueCountsByColumn: Record<string, DashboardValueCountRow[]>;
  columnSeriesByWidgetId: Record<string, DashboardValueCountRow[]>;
  barByGroupByKey: Record<string, DashboardBarByGroupRow[]>;
};

export function dashboardFilterCountKey(column: string, value: string): string {
  return `${column}\0${value}`;
}

export function dashboardBarByGroupKey(
  groupColumn: string,
  statusColumn: string,
  countWhen: string
): string {
  return `${groupColumn}\0${statusColumn}\0${countWhen}`;
}

export type DashboardBarByGroupSpec = {
  groupColumn: string;
  statusColumn: string;
  countWhen: string;
};

export type DashboardTableBundleNeeds = {
  statusPieColumns: string[];
  valueDistributionColumns: string[];
  columnSeriesSpecs: DashboardColumnSeriesSpec[];
  distinctColumns: string[];
  sumColumns: string[];
  barByGroupSpecs: DashboardBarByGroupSpec[];
  previewLimit: number;
  filters: { column: string; value: string }[];
  /** Filter global dashboard (sudah scoped per table di action). */
  globalFilters: { column: string; value: string }[];
};

export function bundleNeedsFromWidgets(
  widgets: DashboardWidget[],
  globalFiltersForTable: { column: string; value: string }[] = []
): Map<string, DashboardTableBundleNeeds> {
  const map = new Map<string, DashboardTableBundleNeeds>();

  for (const w of widgets) {
    const cfg = w.config as Record<string, string | undefined>;
    const tableId = cfg.table_id;
    if (!tableId) continue;

    const existing = map.get(tableId) ?? {
      statusPieColumns: [] as string[],
      valueDistributionColumns: [] as string[],
      columnSeriesSpecs: [] as DashboardColumnSeriesSpec[],
      distinctColumns: [] as string[],
      sumColumns: [] as string[],
      barByGroupSpecs: [] as DashboardBarByGroupSpec[],
      previewLimit: 0,
      filters: [] as { column: string; value: string }[],
      globalFilters: globalFiltersForTable,
    };

    if (w.type === "status_pie") {
      const col = cfg.status_column?.trim();
      if (col && !existing.statusPieColumns.includes(col)) {
        existing.statusPieColumns.push(col);
      }
    }
    if (w.type === "value_distribution") {
      const col = (cfg.column ?? cfg.status_column)?.trim();
      if (col && !existing.valueDistributionColumns.includes(col)) {
        existing.valueDistributionColumns.push(col);
      }
    }
    if (w.type === "multi_column_chart") {
      const series = (
        cfg as { series?: DashboardColumnSeriesSpec["series"] }
      ).series;
      if (Array.isArray(series) && series.length > 0) {
        existing.columnSeriesSpecs.push({
          widgetId: w.id,
          series,
        });
      }
    }
    if (w.type === "bar_by_group") {
      const groupColumn = cfg.group_column?.trim();
      const statusColumn = cfg.status_column?.trim();
      const countWhen = (cfg.count_when ?? "Done").trim() || "Done";
      if (groupColumn && statusColumn) {
        const dup = existing.barByGroupSpecs.some(
          (s) =>
            s.groupColumn === groupColumn &&
            s.statusColumn === statusColumn &&
            s.countWhen === countWhen
        );
        if (!dup) {
          existing.barByGroupSpecs.push({
            groupColumn,
            statusColumn,
            countWhen,
          });
        }
      }
    }
    if (w.type === "table_preview") {
      const lim = Number(cfg.limit);
      existing.previewLimit = Math.max(
        existing.previewLimit,
        Number.isFinite(lim) && lim > 0 ? lim : 8
      );
    }
    if (w.type === "stat") {
      const metric = cfg.metric ?? "count";
      const col = cfg.column?.trim();
      if (metric === "count_distinct" && col && !existing.distinctColumns.includes(col)) {
        existing.distinctColumns.push(col);
      }
      if (metric === "sum" && col && !existing.sumColumns.includes(col)) {
        existing.sumColumns.push(col);
      }
      if (cfg.filter_column && cfg.filter_value) {
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
    }
    if (w.type === "spatial_summary") {
      const areaCol = cfg.area_column?.trim();
      if (areaCol && !existing.sumColumns.includes(areaCol)) {
        existing.sumColumns.push(areaCol);
      }
    }

    existing.globalFilters = globalFiltersForTable;
    map.set(tableId, existing);
  }

  return map;
}

/** Kumpulkan kebutuhan bundle per tabel dengan filter global per table_id. */
export function bundleNeedsFromWidgetsWithGlobalFilters(
  widgets: DashboardWidget[],
  globalFilterValues: { table_id: string; column: string; value: string }[]
): Map<string, DashboardTableBundleNeeds> {
  const tableIds = new Set<string>();
  for (const w of widgets) {
    const tid = (w.config as { table_id?: string }).table_id;
    if (tid) tableIds.add(tid);
  }

  const out = new Map<string, DashboardTableBundleNeeds>();
  for (const tableId of tableIds) {
    const gf = globalFilterValues
      .filter((f) => f.table_id === tableId && f.value.trim())
      .map((f) => ({ column: f.column, value: f.value }));
    const tableWidgets = widgets.filter(
      (w) => (w.config as { table_id?: string }).table_id === tableId
    );
    const partial = bundleNeedsFromWidgets(tableWidgets, gf);
    const needs = partial.get(tableId);
    if (needs) out.set(tableId, needs);
  }
  return out;
}
