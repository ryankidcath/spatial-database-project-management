import type { VirtualColumnRow, VirtualViewFilter } from "@/app/virtual-table-types";
import { emptyVirtualViewConfig } from "@/lib/virtual-view-config";
import {
  loadVirtualTableViewSession,
  saveVirtualTableViewSession,
} from "@/lib/virtual-table-view-session";

const FILTERABLE_TYPES = new Set(["select", "text", "relation", "user"]);

export function pickSpatialFilterColumn(
  columns: VirtualColumnRow[],
  rowPayload: Record<string, unknown> | undefined
): VirtualColumnRow | null {
  if (!rowPayload) return null;
  for (const type of ["select", "text", "relation", "user"] as const) {
    const col = columns.find(
      (c) =>
        c.data_type === type &&
        FILTERABLE_TYPES.has(c.data_type) &&
        rowPayload[c.slug] != null &&
        rowPayload[c.slug] !== ""
    );
    if (col) return col;
  }
  return null;
}

export function filterValueLabel(
  col: VirtualColumnRow,
  val: unknown,
  relationLabels: Record<string, string>,
  memberNameByUserId: Map<string, string>
): string {
  if (val == null || val === "") return "";
  if (col.data_type === "relation") {
    return relationLabels[String(val)] ?? String(val);
  }
  if (col.data_type === "user") {
    return memberNameByUserId.get(String(val)) ?? String(val);
  }
  return String(val);
}

/** G-E4 — tambah filter eq dari nilai baris ke sesi view Data (dipakai tab Spasial). */
export function applySpatialFilterFromRowValue(
  tableId: string,
  columnSlug: string,
  filterValue: string
): void {
  const session = loadVirtualTableViewSession(tableId);
  const config = session?.config ?? emptyVirtualViewConfig();
  const filters = config.filters.filter((f) => f.column !== columnSlug);
  const nextFilter: VirtualViewFilter = {
    column: columnSlug,
    operator: "eq",
    value: filterValue,
  };
  saveVirtualTableViewSession(tableId, {
    activeViewId: session?.activeViewId ?? null,
    config: {
      ...config,
      filters: [...filters, nextFilter],
    },
  });
}
