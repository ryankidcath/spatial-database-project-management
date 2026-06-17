import type { VirtualDataRow } from "@/app/virtual-table-types";

export type VirtualTableMobileRowsCacheEntry = {
  rows: VirtualDataRow[];
  totalCount: number;
  relationLabels: Record<string, string>;
  updatedAt: number;
};

const STORAGE_KEY = "pm-vtable-mobile-rows-cache-v1";
const MAX_TABLES = 24;
const memory = new Map<string, VirtualTableMobileRowsCacheEntry>();

export function virtualTableMobileRowsCacheKey(tableId: string): string {
  return `table:${tableId}`;
}

function readStorage(): Record<string, VirtualTableMobileRowsCacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, VirtualTableMobileRowsCacheEntry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(data: Record<string, VirtualTableMobileRowsCacheEntry>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota errors; memory cache still works.
  }
}

function persist(cacheKey: string, entry: VirtualTableMobileRowsCacheEntry) {
  const all = readStorage();
  all[cacheKey] = entry;
  const keys = Object.keys(all).sort(
    (a, b) => (all[b]?.updatedAt ?? 0) - (all[a]?.updatedAt ?? 0)
  );
  for (const key of keys.slice(MAX_TABLES)) {
    delete all[key];
  }
  writeStorage(all);
}

export function getVirtualTableMobileRowsCache(
  cacheKey: string
): VirtualTableMobileRowsCacheEntry | null {
  const mem = memory.get(cacheKey);
  if (mem) return mem;
  const stored = readStorage()[cacheKey];
  if (!stored) return null;
  memory.set(cacheKey, stored);
  return stored;
}

export function setVirtualTableMobileRowsCache(
  cacheKey: string,
  entry: Omit<VirtualTableMobileRowsCacheEntry, "updatedAt"> & { updatedAt?: number }
) {
  const next: VirtualTableMobileRowsCacheEntry = {
    rows: entry.rows,
    totalCount: entry.totalCount,
    relationLabels: entry.relationLabels,
    updatedAt: entry.updatedAt ?? Date.now(),
  };
  memory.set(cacheKey, next);
  persist(cacheKey, next);
}

export function invalidateVirtualTableMobileRowsCache(tableId?: string) {
  if (!tableId) {
    memory.clear();
    writeStorage({});
    return;
  }
  const cacheKey = virtualTableMobileRowsCacheKey(tableId);
  memory.delete(cacheKey);
  const all = readStorage();
  delete all[cacheKey];
  writeStorage(all);
}
