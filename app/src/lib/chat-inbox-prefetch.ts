import type { VirtualTableRow } from "@/app/virtual-table-types";
import { resolveVirtualRowChatContextsBatchAction } from "@/app/chat-actions";
import {
  activeRowRoomsToContextSeeds,
  buildChatInboxEntriesFromActiveRows,
} from "@/lib/chat-inbox-row-context";
import {
  shouldAllowBackgroundPrefetch,
  shouldAllowBackgroundPrefetchAsync,
} from "@/lib/client-background-cache-policy";
import {
  DEFAULT_DURABLE_CACHE_TTL_MS,
  isDurableSnapshotFresh,
} from "@/lib/client-durable-storage";
import {
  buildChatInboxCacheKey,
  CHAT_INBOX_ROW_PAGE_SIZE,
  getChatInboxCache,
  setChatInboxCache,
} from "@/lib/chat-inbox-cache";
import {
  fetchChatInboxActiveRowRoomsClient,
  fetchChatInboxRoomMetaClient,
  fetchChatInboxUnreadMentionKeysClient,
} from "@/lib/chat-client";

const PREFETCH_IDLE_TIMEOUT_MS = 4000;
const PREFETCH_FALLBACK_DELAY_MS = 800;

export function tableIdsInChatInboxScope(
  virtualTables: VirtualTableRow[],
  organizationId: string,
  projectId: string | null
): string[] {
  return virtualTables
    .filter((t) => {
      if (t.organization_id === organizationId && !t.project_id) return true;
      if (projectId && t.project_id === projectId) return true;
      return false;
    })
    .map((t) => t.id);
}

let prefetchInFlight: Promise<void> | null = null;

/** F2 — prefetch inbox saat cache belum ada / sudah kedaluwarsa. */
export async function prefetchChatInboxIfNeeded(input: {
  organizationId: string;
  projectId: string | null;
  tableIds: string[];
  virtualTables: VirtualTableRow[];
  userId: string;
}): Promise<void> {
  if (!input.organizationId || !input.userId || input.tableIds.length === 0) {
    return;
  }
  if (!shouldAllowBackgroundPrefetch()) return;
  if (!(await shouldAllowBackgroundPrefetchAsync())) return;

  const cacheKey = buildChatInboxCacheKey({
    organizationId: input.organizationId,
    projectId: input.projectId,
    tableIds: input.tableIds,
  });
  const cached = getChatInboxCache(cacheKey);
  if (cached && isDurableSnapshotFresh(cached, DEFAULT_DURABLE_CACHE_TTL_MS)) {
    return;
  }

  if (prefetchInFlight) return prefetchInFlight;

  prefetchInFlight = (async () => {
    const tablesInScope = input.virtualTables.filter((t) =>
      input.tableIds.includes(t.id)
    );

    const [rowsRes, metaRes, mentionRes] = await Promise.all([
      fetchChatInboxActiveRowRoomsClient({
        tableIds: input.tableIds,
        limit: CHAT_INBOX_ROW_PAGE_SIZE,
        offset: 0,
      }),
      fetchChatInboxRoomMetaClient({ organizationId: input.organizationId }),
      fetchChatInboxUnreadMentionKeysClient({
        organizationId: input.organizationId,
      }),
    ]);

    if (rowsRes.error || !rowsRes.data) return;

    const ctxRes = await resolveVirtualRowChatContextsBatchAction(
      activeRowRoomsToContextSeeds(rowsRes.data.rows)
    );
    const ctxByRowId = ctxRes.error ? {} : (ctxRes.data ?? {});

    const rowEntries = buildChatInboxEntriesFromActiveRows(
      rowsRes.data.rows,
      ctxByRowId,
      input.organizationId,
      tablesInScope
    );

    setChatInboxCache(cacheKey, {
      rowEntries,
      rowTotalCount: rowsRes.data.totalCount,
      roomMetaByKey: metaRes.error ? {} : (metaRes.data ?? {}),
      mentionKeys: mentionRes.error ? [] : (mentionRes.data ?? []),
    });
  })().finally(() => {
    prefetchInFlight = null;
  });

  return prefetchInFlight;
}

/** Jadwalkan prefetch saat browser idle (Dashboard). */
export function scheduleDashboardChatInboxPrefetch(input: {
  organizationId: string;
  projectId: string | null;
  tableIds: string[];
  virtualTables: VirtualTableRow[];
  userId: string;
}): () => void {
  let cancelled = false;
  const run = () => {
    if (cancelled) return;
    void prefetchChatInboxIfNeeded(input);
  };

  if (typeof requestIdleCallback !== "undefined") {
    const id = requestIdleCallback(run, { timeout: PREFETCH_IDLE_TIMEOUT_MS });
    return () => {
      cancelled = true;
      cancelIdleCallback(id);
    };
  }

  const timer = window.setTimeout(run, PREFETCH_FALLBACK_DELAY_MS);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
