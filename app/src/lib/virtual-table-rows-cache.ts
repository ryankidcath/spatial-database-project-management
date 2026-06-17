import type { VirtualDataRow } from "@/app/virtual-table-types";

export type VirtualTableRowsCacheEntry = {
  rows: VirtualDataRow[];
  totalCount: number;
  updatedAt: number;
};

const STORAGE_KEY = "pm-vtable-rows-cache-v1";
const MAX_ENTRIES = 48;

const memory = new Map<string, VirtualTableRowsCacheEntry>();

export function virtualTableRowsCacheKey(
  tableId: string,
  pageIndex: number,
  pageSize: number | null
): string {
  return `${tableId}:${pageSize ?? "all"}:${pageIndex}`;
}

function readStorage(): Record<string, VirtualTableRowsCacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, VirtualTableRowsCacheEntry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(data: Record<string, VirtualTableRowsCacheEntry>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota errors; memory cache still works.
  }
}

function persist(cacheKey: string, entry: VirtualTableRowsCacheEntry) {
  const all = readStorage();
  all[cacheKey] = entry;
  const keys = Object.keys(all).sort(
    (a, b) => (all[b]?.updatedAt ?? 0) - (all[a]?.updatedAt ?? 0)
  );
  for (const key of keys.slice(MAX_ENTRIES)) {
    delete all[key];
  }
  writeStorage(all);
}

export function getVirtualTableRowsCache(
  key: string
): VirtualTableRowsCacheEntry | undefined {
  const mem = memory.get(key);
  if (mem) return mem;
  const stored = readStorage()[key];
  if (!stored) return undefined;
  memory.set(key, stored);
  return stored;
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
  persist(key, next);
}

export function invalidateVirtualTableRowsCache(tableId?: string): void {
  if (!tableId) {
    memory.clear();
    writeStorage({});
    return;
  }
  const prefix = `${tableId}:`;
  for (const key of memory.keys()) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  const all = readStorage();
  let changed = false;
  for (const key of Object.keys(all)) {
    if (key.startsWith(prefix)) {
      delete all[key];
      changed = true;
    }
  }
  if (changed) writeStorage(all);
}
