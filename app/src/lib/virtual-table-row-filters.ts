import type { VirtualDataRow, VirtualViewFilter } from "@/app/virtual-table-types";

export function matchesVirtualRowFilter(
  row: VirtualDataRow,
  filter: VirtualViewFilter,
  resolveLabel?: (val: unknown) => string
): boolean {
  const val = row.payload[filter.column];
  const strVal = resolveLabel
    ? resolveLabel(val).toLowerCase()
    : val != null
      ? String(val).toLowerCase()
      : "";
  const filterVal = filter.value.toLowerCase();

  switch (filter.operator) {
    case "eq":
      return strVal === filterVal;
    case "neq":
      return strVal !== filterVal;
    case "contains":
      return strVal.includes(filterVal);
    case "not_contains":
      return !strVal.includes(filterVal);
    case "gt":
      return Number(val) > Number(filter.value);
    case "gte":
      return Number(val) >= Number(filter.value);
    case "lt":
      return Number(val) < Number(filter.value);
    case "lte":
      return Number(val) <= Number(filter.value);
    case "is_empty":
      return val == null || val === "";
    case "is_not_empty":
      return val != null && val !== "";
    default:
      return true;
  }
}

export function rowMatchesVirtualViewFilters(
  row: VirtualDataRow,
  filters: VirtualViewFilter[],
  resolveLabel?: (column: string, val: unknown) => string
): boolean {
  if (filters.length === 0) return true;
  return filters.every((f) =>
    matchesVirtualRowFilter(row, f, (val) =>
      resolveLabel ? resolveLabel(f.column, val) : String(val ?? "")
    )
  );
}
