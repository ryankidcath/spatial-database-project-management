import type { VirtualDataRow } from "@/app/virtual-table-types";
import { fetchVirtualRowsAction } from "@/app/virtual-table-actions";
import {
  shouldAllowBackgroundPrefetch,
  shouldAllowBackgroundPrefetchAsync,
} from "@/lib/client-background-cache-policy";
import {
  DEFAULT_DURABLE_CACHE_TTL_MS,
  isDurableSnapshotFresh,
} from "@/lib/client-durable-storage";
import {
  getVirtualTableMobileRowsCache,
  setVirtualTableMobileRowsCache,
  virtualTableMobileRowsCacheKey,
  VIRTUAL_TABLE_MOBILE_ROW_PAGE_SIZE,
} from "@/lib/virtual-table-mobile-rows-cache";

const WARMUP_ROW_BATCH = VIRTUAL_TABLE_MOBILE_ROW_PAGE_SIZE;

const inFlightByTable = new Map<string, Promise<void>>();

/** Halaman pertama baris tabel mobile → IndexedDB (PR-G2-6). */
export async function prefetchVirtualTableMobileRowsIfNeeded(
  tableId: string
): Promise<void> {
  if (!tableId) return;
  if (!shouldAllowBackgroundPrefetch()) return;
  if (!(await shouldAllowBackgroundPrefetchAsync())) return;

  const cacheKey = virtualTableMobileRowsCacheKey(tableId);
  const cached = getVirtualTableMobileRowsCache(cacheKey);
  if (cached && isDurableSnapshotFresh(cached, DEFAULT_DURABLE_CACHE_TTL_MS)) {
    return;
  }

  const existing = inFlightByTable.get(tableId);
  if (existing) return existing;

  const run = (async () => {
    const result = await fetchVirtualRowsAction(tableId, {
      limit: WARMUP_ROW_BATCH,
      offset: 0,
    });
    if (result.error) return;
    setVirtualTableMobileRowsCache(cacheKey, {
      rows: result.rows as VirtualDataRow[],
      totalCount: result.totalCount,
      relationLabels: {},
    });
  })().finally(() => {
    inFlightByTable.delete(tableId);
  });

  inFlightByTable.set(tableId, run);
  return run;
}
