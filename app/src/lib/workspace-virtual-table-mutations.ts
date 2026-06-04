/** Dipancarkan setelah sel baris virtual tabel disimpan (mobile detail / grid). */
export const VIRTUAL_TABLE_ROWS_MUTATED = "workspace:virtual-table-rows-mutated";

export type VirtualTableRowsMutatedDetail = { tableId: string };

export function emitVirtualTableRowsMutated(tableId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<VirtualTableRowsMutatedDetail>(VIRTUAL_TABLE_ROWS_MUTATED, {
      detail: { tableId },
    })
  );
}
