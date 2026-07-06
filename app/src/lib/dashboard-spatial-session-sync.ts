import type { DashboardGlobalFilterValue } from "@/app/virtual-dashboard-types";
import type { VirtualViewFilter } from "@/app/virtual-table-types";
import { emptyVirtualViewConfig } from "@/lib/virtual-view-config";
import {
  loadVirtualTableViewSession,
  saveVirtualTableViewSession,
} from "@/lib/virtual-table-view-session";
import { filterValuesForTable } from "@/lib/dashboard-global-filters";

/** Salin filter global dashboard ke sesi view tabel (dipakai saat buka tab Spasial). */
export function syncDashboardFiltersToViewSessions(
  tableIds: string[],
  globalFilterValues: DashboardGlobalFilterValue[]
): void {
  for (const tableId of tableIds) {
    const dashboardFilters = filterValuesForTable(tableId, globalFilterValues);
    if (dashboardFilters.length === 0) continue;

    const session = loadVirtualTableViewSession(tableId);
    const config = session?.config ?? emptyVirtualViewConfig();
    const existing = config.filters.filter(
      (f) =>
        !dashboardFilters.some((df) => df.column === f.column)
    );
    const merged: VirtualViewFilter[] = [
      ...existing,
      ...dashboardFilters.map((f) => ({
        column: f.column,
        operator: "eq" as const,
        value: f.value,
      })),
    ];
    saveVirtualTableViewSession(tableId, {
      activeViewId: session?.activeViewId ?? null,
      config: { ...config, filters: merged },
    });
  }
}
