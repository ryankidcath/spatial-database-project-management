import type {
  DashboardGlobalFilterDef,
  DashboardGlobalFilterValue,
} from "@/app/virtual-dashboard-types";

export function globalFilterSignature(
  filters: DashboardGlobalFilterValue[]
): string {
  const active = filters
    .filter((f) => f.value.trim())
    .map((f) => `${f.table_id}:${f.column}=${f.value.trim()}`)
    .sort();
  return active.join("|") || "_all";
}

export function globalFiltersToRpcPayload(
  filters: DashboardGlobalFilterValue[]
): { column: string; value: string }[] {
  return filters
    .filter((f) => f.column.trim() && f.value.trim())
    .map((f) => ({ column: f.column.trim(), value: f.value.trim() }));
}

export function filterValuesForTable(
  tableId: string,
  filters: DashboardGlobalFilterValue[]
): DashboardGlobalFilterValue[] {
  return filters.filter(
    (f) => f.table_id === tableId && f.column.trim() && f.value.trim()
  );
}

/** Gabung filter global + filter widget stat. */
export function mergedFiltersForTable(
  tableId: string,
  globalFilters: DashboardGlobalFilterValue[],
  widgetFilters: { column: string; value: string }[] = []
): { column: string; value: string }[] {
  const global = filterValuesForTable(tableId, globalFilters).map((f) => ({
    column: f.column,
    value: f.value,
  }));
  const seen = new Set(global.map((f) => `${f.column}\0${f.value}`));
  const out = [...global];
  for (const f of widgetFilters) {
    const key = `${f.column}\0${f.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(f);
    }
  }
  return out;
}

export function defaultGlobalFilterDefs(
  projectTableIds: string[],
  columnsByTable: Map<string, { slug: string; display_name: string; data_type: string }[]>
): DashboardGlobalFilterDef[] {
  const defs: DashboardGlobalFilterDef[] = [];
  const preferSlugs = ["desa", "kecamatan", "status", "surveyor"];

  for (const tableId of projectTableIds) {
    const cols = columnsByTable.get(tableId) ?? [];
    for (const slug of preferSlugs) {
      const col = cols.find((c) => c.slug === slug);
      if (col && (col.data_type === "select" || col.data_type === "text")) {
        defs.push({ table_id: tableId, column_slug: col.slug });
      }
    }
  }
  return defs.slice(0, 6);
}
