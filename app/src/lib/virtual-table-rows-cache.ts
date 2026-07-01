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

export type VirtualTableRowsCacheEntry = {
  rows: VirtualDataRow[];
  totalCount: number;
  updatedAt: number;
};

const STORAGE_KEY = "pm-vtable-rows-cache-v1";
const MAX_ENTRIES = 48;
const CACHE_TTL_MS = DEFAULT_DURABLE_CACHE_TTL_MS;

const storeConfig = {
  namespace: "vtable-rows-v1",
  maxEntries: MAX_ENTRIES,
  ttlMs: CACHE_TTL_MS,
  legacySessionStorageKey: STORAGE_KEY,
};

const memory = new Map<string, VirtualTableRowsCacheEntry>();

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
  const mem = memory.get(key);
  if (mem) {
    if (!isDurableSnapshotFresh(mem, CACHE_TTL_MS)) {
      memory.delete(key);
    } else {
      return mem;
    }
  }
  const stored = readIndexedDbRecordMapSync<VirtualTableRowsCacheEntry>(
    storeConfig
  )[key];
  if (!stored || !isDurableSnapshotFresh(stored, CACHE_TTL_MS)) {
    return undefined;
  }
  memory.set(key, stored);
  return stored;
}

export async function hydrateVirtualTableRowsCache(
  key: string
): Promise<VirtualTableRowsCacheEntry | null> {
  return hydrateIndexedDbRecordEntry(storeConfig, key, memory);
}

export function setVirtualTableRowsCache(
  key: string,
  entry: Omit<VirtualTableRowsCacheEntry, "updatedAt"> & { updatedAt?: number }
): void {
  const next: VirtualTableRowsCacheEntry = {
    rows: entry.rows,
    totalCount: entry.totalCount,
    updatedAt: entry.updatedAt ?? Date.now(),
  };
  memory.set(key, next);
  void persistIndexedDbRecordEntry(storeConfig, key, next, memory);
}

export function invalidateVirtualTableRowsCache(tableId?: string): void {
  if (!tableId) {
    void invalidateIndexedDbRecordNamespace(storeConfig, memory);
    return;
  }
  void invalidateIndexedDbRecordNamespace(storeConfig, memory, `${tableId}:`);
}

export async function flushVirtualTableRowsMemoryToStorage(): Promise<void> {
  await flushIndexedDbRecordMemory(storeConfig, memory);
}
