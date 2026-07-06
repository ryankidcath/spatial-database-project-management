import { fetchVirtualRowsForMapAction } from "@/app/virtual-table-actions";
import type { VirtualDataRow } from "@/app/virtual-table-types";
import {
  getVirtualTableRowsCacheAllowStale,
  isVirtualTableRowsCacheEntryFresh,
  setVirtualTableRowsCache,
  virtualTableFullRowsCacheKey,
  virtualTableMapRowsCacheKey,
} from "@/lib/virtual-table-rows-cache";
import { mapColumnSlugsSignature } from "@/lib/virtual-table-map-popup";

export type FetchVirtualTableRowsForMapResult = {
  rows: VirtualDataRow[];
  error: string | null;
  fromCache: boolean;
};

function projectPayload(
  payload: Record<string, unknown>,
  columnSlugs: string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const slug of columnSlugs) {
    if (slug in payload) out[slug] = payload[slug];
  }
  return out;
}

function rowsFromFullCache(
  tableId: string,
  columnSlugs: string[]
): VirtualDataRow[] | null {
  const full = getVirtualTableRowsCacheAllowStale(
    virtualTableFullRowsCacheKey(tableId)
  );
  if (!full?.rows.length) return null;

  return full.rows.map((row) => ({
    ...row,
    payload: projectPayload(
      (row.payload ?? {}) as Record<string, unknown>,
      columnSlugs
    ),
  }));
}

function rowsFromMapCache(
  tableId: string,
  columnSlugSig: string
): VirtualDataRow[] | null {
  const cached = getVirtualTableRowsCacheAllowStale(
    virtualTableMapRowsCacheKey(tableId, columnSlugSig)
  );
  if (!cached?.rows.length) return null;
  return cached.rows;
}

/**
 * Muat baris untuk lapisan peta: proyeksi kolom saja.
 * Prioritas: cache full (slice) → cache map → RPC `fetch_virtual_rows_map_payload`.
 */
export async function fetchVirtualTableRowsForMap(
  tableId: string,
  columnSlugs: string[],
  options?: { forceNetwork?: boolean }
): Promise<FetchVirtualTableRowsForMapResult> {
  const slugs = [...new Set(columnSlugs.filter(Boolean))].sort();
  const slugSig = mapColumnSlugsSignature(slugs);
  const mapCacheKey = virtualTableMapRowsCacheKey(tableId, slugSig);

  if (!options?.forceNetwork) {
    const fromFull = rowsFromFullCache(tableId, slugs);
    if (fromFull) {
      const fullEntry = getVirtualTableRowsCacheAllowStale(
        virtualTableFullRowsCacheKey(tableId)
      );
      if (fullEntry && isVirtualTableRowsCacheEntryFresh(fullEntry)) {
        return { rows: fromFull, error: null, fromCache: true };
      }
    }

    const fromMap = rowsFromMapCache(tableId, slugSig);
    if (fromMap) {
      const mapEntry = getVirtualTableRowsCacheAllowStale(mapCacheKey);
      if (mapEntry && isVirtualTableRowsCacheEntryFresh(mapEntry)) {
        return { rows: fromMap, error: null, fromCache: true };
      }
    }

    if (fromFull?.length) {
      return { rows: fromFull, error: null, fromCache: true };
    }
    if (fromMap?.length) {
      return { rows: fromMap, error: null, fromCache: true };
    }
  }

  const result = await fetchVirtualRowsForMapAction(tableId, slugs);
  if (result.error) {
    return { rows: [], error: result.error, fromCache: false };
  }

  const rows = result.rows as VirtualDataRow[];
  setVirtualTableRowsCache(mapCacheKey, {
    rows,
    totalCount: rows.length,
  });

  return { rows, error: null, fromCache: false };
}
