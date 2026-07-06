import { invalidateSpatialGeometryLayersCache } from "@/lib/workspace-spatial-geometry-layers-cache";
import { invalidateVirtualTableMobileRowsCache } from "@/lib/virtual-table-mobile-rows-cache";
import { invalidateVirtualTableRowsCache } from "@/lib/virtual-table-rows-cache";

/** Dipancarkan setelah sel baris virtual tabel disimpan (mobile detail / grid). */
export const VIRTUAL_TABLE_ROWS_MUTATED = "workspace:virtual-table-rows-mutated";

export type VirtualTableRowsMutatedDetail = { tableId: string };

export function emitVirtualTableRowsMutated(tableId: string) {
  if (typeof window === "undefined") return;
  invalidateVirtualTableRowsCache(tableId);
  invalidateVirtualTableMobileRowsCache(tableId);
  invalidateSpatialGeometryLayersCache();
  window.dispatchEvent(
    new CustomEvent<VirtualTableRowsMutatedDetail>(VIRTUAL_TABLE_ROWS_MUTATED, {
      detail: { tableId },
    })
  );
}
