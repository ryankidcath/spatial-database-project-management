import { fetchVirtualRowsAction } from "@/app/virtual-table-actions";
import type { VirtualDataRow } from "@/app/virtual-table-types";
import {
  getVirtualTableRowsCacheAllowStale,
  isVirtualTableRowsCacheEntryFresh,
  setVirtualTableRowsCache,
  virtualTableFullRowsCacheKey,
  virtualTableRowsCacheKey,
  VIRTUAL_TABLE_ROWS_CACHE_TTL_MS,
  type VirtualTableRowsCacheEntry,
} from "@/lib/virtual-table-rows-cache";

export {
  virtualTableRowsCacheKey,
  virtualTableFullRowsCacheKey,
  VIRTUAL_TABLE_ROWS_CACHE_TTL_MS,
};

export type FetchVirtualTableRowsWithCacheOptions = {
  limit?: number;
  offset?: number;
  /**
   * Ukuran halaman untuk kunci cache paginated (mis. 50 di tab Data).
   * `null` = fetch/cache seluruh tabel.
   */
  cachePageSize?: number | null;
  /** Paksa fetch network (abaikan cache segar). */
  forceNetwork?: boolean;
};

export type FetchVirtualTableRowsWithCacheResult = {
  rows: VirtualDataRow[];
  totalCount: number;
  error: string | null;
  fromCache: boolean;
  /** Cache masih dalam TTL — network tidak dijalankan. */
  skippedNetwork?: boolean;
};

function isFullTableFetch(options?: FetchVirtualTableRowsWithCacheOptions): boolean {
  return options?.limit == null || options.limit <= 0;
}

function cacheKeyForOptions(
  tableId: string,
  options?: FetchVirtualTableRowsWithCacheOptions
): string {
  if (isFullTableFetch(options)) {
    return virtualTableFullRowsCacheKey(tableId);
  }
  const pageSize = options?.cachePageSize ?? options!.limit!;
  return virtualTableRowsCacheKey(tableId, 0, pageSize);
}

function readEntry(
  key: string,
  allowStale: boolean
): VirtualTableRowsCacheEntry | undefined {
  const entry = getVirtualTableRowsCacheAllowStale(key);
  if (!entry) return undefined;
  if (!allowStale && !isVirtualTableRowsCacheEntryFresh(entry)) return undefined;
  return entry;
}

function sliceFromEntry(
  entry: VirtualTableRowsCacheEntry,
  offset: number,
  limit: number
): VirtualDataRow[] | null {
  if (offset > entry.rows.length) return null;
  const end = offset + limit;
  if (end <= entry.rows.length) {
    return entry.rows.slice(offset, end);
  }
  if (entry.rows.length >= entry.totalCount) {
    return entry.rows.slice(offset);
  }
  return null;
}

function tryResolveFromCaches(
  tableId: string,
  options: FetchVirtualTableRowsWithCacheOptions | undefined,
  allowStale: boolean
): FetchVirtualTableRowsWithCacheResult | null {
  const offset = Math.max(0, options?.offset ?? 0);

  if (isFullTableFetch(options)) {
    const full = readEntry(virtualTableFullRowsCacheKey(tableId), allowStale);
    if (full) {
      return {
        rows: full.rows,
        totalCount: full.totalCount,
        error: null,
        fromCache: true,
        skippedNetwork: isVirtualTableRowsCacheEntryFresh(full),
      };
    }
    return null;
  }

  const limit = options!.limit!;
  const scopedKey = cacheKeyForOptions(tableId, options);
  const scoped = readEntry(scopedKey, allowStale);

  if (scoped) {
    if (offset === 0) {
      if (scoped.rows.length >= limit) {
        return {
          rows: scoped.rows.slice(0, limit),
          totalCount: scoped.totalCount,
          error: null,
          fromCache: true,
          skippedNetwork: isVirtualTableRowsCacheEntryFresh(scoped),
        };
      }
      if (scoped.rows.length >= scoped.totalCount) {
        return {
          rows: scoped.rows,
          totalCount: scoped.totalCount,
          error: null,
          fromCache: true,
          skippedNetwork: isVirtualTableRowsCacheEntryFresh(scoped),
        };
      }
    } else {
      const slice = sliceFromEntry(scoped, offset, limit);
      if (slice) {
        return {
          rows: slice,
          totalCount: scoped.totalCount,
          error: null,
          fromCache: true,
          skippedNetwork: isVirtualTableRowsCacheEntryFresh(scoped),
        };
      }
    }
  }

  const full = readEntry(virtualTableFullRowsCacheKey(tableId), allowStale);
  if (full) {
    const slice = sliceFromEntry(full, offset, limit);
    if (slice) {
      if (offset === 0) {
        setVirtualTableRowsCache(scopedKey, {
          rows: full.rows.slice(0, Math.min(full.rows.length, limit)),
          totalCount: full.totalCount,
        });
      }
      return {
        rows: slice,
        totalCount: full.totalCount,
        error: null,
        fromCache: true,
        skippedNetwork: isVirtualTableRowsCacheEntryFresh(full),
      };
    }
  }

  return null;
}

function persistFetchResult(
  tableId: string,
  options: FetchVirtualTableRowsWithCacheOptions | undefined,
  rows: VirtualDataRow[],
  totalCount: number
): void {
  const offset = Math.max(0, options?.offset ?? 0);

  if (isFullTableFetch(options)) {
    setVirtualTableRowsCache(virtualTableFullRowsCacheKey(tableId), {
      rows,
      totalCount,
    });
    return;
  }

  const scopedKey = cacheKeyForOptions(tableId, options);
  if (offset === 0) {
    setVirtualTableRowsCache(scopedKey, { rows, totalCount });
    if (rows.length >= totalCount) {
      setVirtualTableRowsCache(virtualTableFullRowsCacheKey(tableId), {
        rows,
        totalCount,
      });
    }
    return;
  }

  const existing = getVirtualTableRowsCacheAllowStale(scopedKey);
  if (existing) {
    const seen = new Set(existing.rows.map((r) => r.id));
    const merged = [
      ...existing.rows,
      ...rows.filter((r) => !seen.has(r.id)),
    ];
    setVirtualTableRowsCache(scopedKey, { rows: merged, totalCount });
    if (merged.length >= totalCount) {
      setVirtualTableRowsCache(virtualTableFullRowsCacheKey(tableId), {
        rows: merged,
        totalCount,
      });
    }
  } else {
    setVirtualTableRowsCache(scopedKey, { rows, totalCount });
  }
}

/**
 * Fetch baris virtual table dengan cache terpadu (tab Data ↔ Spasial).
 * Cache segar → tanpa network kecuali `forceNetwork`.
 */
export async function fetchVirtualTableRowsWithCache(
  tableId: string,
  options?: FetchVirtualTableRowsWithCacheOptions
): Promise<FetchVirtualTableRowsWithCacheResult> {
  if (!options?.forceNetwork) {
    const cached = tryResolveFromCaches(tableId, options, false);
    if (cached?.skippedNetwork) return cached;
  }

  const networkOptions = isFullTableFetch(options)
    ? undefined
    : { limit: options!.limit, offset: options?.offset ?? 0 };

  const result = await fetchVirtualRowsAction(tableId, networkOptions);
  if (result.error) {
    return { rows: [], totalCount: 0, error: result.error, fromCache: false };
  }

  const rows = result.rows as VirtualDataRow[];
  persistFetchResult(tableId, options, rows, result.totalCount);

  return {
    rows,
    totalCount: result.totalCount,
    error: null,
    fromCache: false,
  };
}

/** Cache segar (TTL) — untuk skip network di tab Data. */
export function peekVirtualTableRowsCache(
  tableId: string,
  options?: FetchVirtualTableRowsWithCacheOptions
): VirtualTableRowsCacheEntry | null {
  const resolved = tryResolveFromCaches(tableId, options, false);
  if (!resolved) return null;
  return {
    rows: resolved.rows,
    totalCount: resolved.totalCount,
    updatedAt: Date.now(),
  };
}

/** Cache ada tapi mungkin kedaluwarsa — untuk tampilkan dulu (SWR). */
export function peekStaleVirtualTableRowsCache(
  tableId: string,
  options?: FetchVirtualTableRowsWithCacheOptions
): VirtualTableRowsCacheEntry | null {
  const resolved = tryResolveFromCaches(tableId, options, true);
  if (!resolved) return null;
  return {
    rows: resolved.rows,
    totalCount: resolved.totalCount,
    updatedAt: Date.now(),
  };
}

export function isVirtualTableRowsCacheFresh(
  tableId: string,
  options?: FetchVirtualTableRowsWithCacheOptions
): boolean {
  return peekVirtualTableRowsCache(tableId, options) != null;
}
