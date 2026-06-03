import type { VirtualDataRow } from "@/app/virtual-table-types";

export type VirtualTableRowsCacheEntry = {
  rows: VirtualDataRow[];
  totalCount: number;
};

const cache = new Map<string, VirtualTableRowsCacheEntry>();

export function virtualTableRowsCacheKey(
  tableId: string,
  pageIndex: number,
  pageSize: number | null
): string {
  return `${tableId}:${pageSize ?? "all"}:${pageIndex}`;
}

export function getVirtualTableRowsCache(
  key: string
): VirtualTableRowsCacheEntry | undefined {
  return cache.get(key);
}

export function setVirtualTableRowsCache(
  key: string,
  entry: VirtualTableRowsCacheEntry
): void {
  cache.set(key, entry);
}

export function invalidateVirtualTableRowsCache(tableId?: string): void {
  if (!tableId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${tableId}:`)) cache.delete(key);
  }
}
