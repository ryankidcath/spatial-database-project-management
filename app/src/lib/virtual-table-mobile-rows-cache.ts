import type { VirtualDataRow } from "@/app/virtual-table-types";
import {
  DEFAULT_DURABLE_CACHE_TTL_MS,
  isDurableSnapshotFresh,
} from "@/lib/client-durable-storage";
import {
  hydrateIndexedDbRecordEntry,
  invalidateIndexedDbRecordNamespace,
  persistIndexedDbRecordEntry,
  readIndexedDbRecordMapSync,
  flushIndexedDbRecordMemory,
} from "@/lib/client-durable-record-storage";

export type VirtualTableMobileRowsCacheEntry = {
  rows: VirtualDataRow[];
  totalCount: number;
  relationLabels: Record<string, string>;
  updatedAt: number;
};

const STORAGE_KEY = "pm-vtable-mobile-rows-cache-v1";
const MAX_TABLES = 24;
const CACHE_TTL_MS = DEFAULT_DURABLE_CACHE_TTL_MS;

const storeConfig = {
  namespace: "vtable-mobile-rows-v1",
  maxEntries: MAX_TABLES,
  ttlMs: CACHE_TTL_MS,
  legacySessionStorageKey: STORAGE_KEY,
};

const memory = new Map<string, VirtualTableMobileRowsCacheEntry>();

export function virtualTableMobileRowsCacheKey(tableId: string): string {
  return `table:${tableId}`;
}

export function getVirtualTableMobileRowsCache(
  cacheKey: string
): VirtualTableMobileRowsCacheEntry | null {
  const mem = memory.get(cacheKey);
  if (mem) {
    if (!isDurableSnapshotFresh(mem, CACHE_TTL_MS)) {
      memory.delete(cacheKey);
    } else {
      return mem;
    }
  }
  const stored =
    readIndexedDbRecordMapSync<VirtualTableMobileRowsCacheEntry>(storeConfig)[
      cacheKey
    ];
  if (!stored || !isDurableSnapshotFresh(stored, CACHE_TTL_MS)) {
    return null;
  }
  memory.set(cacheKey, stored);
  return stored;
}

export async function hydrateVirtualTableMobileRowsCache(
  cacheKey: string
): Promise<VirtualTableMobileRowsCacheEntry | null> {
  return hydrateIndexedDbRecordEntry(storeConfig, cacheKey, memory);
}

export function setVirtualTableMobileRowsCache(
  cacheKey: string,
  entry: Omit<VirtualTableMobileRowsCacheEntry, "updatedAt"> & {
    updatedAt?: number;
  }
) {
  const next: VirtualTableMobileRowsCacheEntry = {
    rows: entry.rows,
    totalCount: entry.totalCount,
    relationLabels: entry.relationLabels,
    updatedAt: entry.updatedAt ?? Date.now(),
  };
  memory.set(cacheKey, next);
  void persistIndexedDbRecordEntry(storeConfig, cacheKey, next, memory);
}

export function invalidateVirtualTableMobileRowsCache(tableId?: string) {
  if (!tableId) {
    void invalidateIndexedDbRecordNamespace(storeConfig, memory);
    return;
  }
  void invalidateIndexedDbRecordNamespace(
    storeConfig,
    memory,
    virtualTableMobileRowsCacheKey(tableId)
  );
}

export async function flushVirtualTableMobileRowsMemoryToStorage(): Promise<void> {
  await flushIndexedDbRecordMemory(storeConfig, memory);
}
