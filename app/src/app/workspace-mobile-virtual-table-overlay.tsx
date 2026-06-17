"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { collectRelationIdsFromVirtualPayloads } from "@/lib/virtual-table-map-popup";
import { buildChatRowPathSegments } from "@/lib/chat-row-context";
import {
  fetchVirtualRowsAction,
  resolveRelationLabelsAction,
} from "./virtual-table-actions";
import type { ChatAttachmentRef, ChatMentionOption } from "./chat-types";
import type { VirtualColumnRow, VirtualDataRow, VirtualTableRow } from "./virtual-table-types";
import { WorkspaceMobileRowList } from "./workspace-mobile-row-list";
import {
  VirtualTableRoomChatUnreadBadge,
  useVirtualTableChatUnread,
} from "./virtual-table-chat-unread-context";
import { fetchVirtualTableChatUnreadRowsClient } from "@/lib/chat-client";
import {
  VIRTUAL_TABLE_ROWS_MUTATED,
  type VirtualTableRowsMutatedDetail,
} from "@/lib/workspace-virtual-table-mutations";
import {
  getVirtualTableMobileRowsCache,
  setVirtualTableMobileRowsCache,
  virtualTableMobileRowsCacheKey,
} from "@/lib/virtual-table-mobile-rows-cache";
import { useWorkspaceRightPanel } from "./workspace-right-panel-context";
import { WORKSPACE_MOBILE_TAB_BAR_PADDING } from "./workspace-mobile-tabs";

const MOBILE_ROW_BATCH_SIZE = 50;

type Props = {
  table: VirtualTableRow;
  columns: VirtualColumnRow[];
  organizationId: string | null;
  organizationName?: string | null;
  userId: string | null;
  projectsForMention: { id: string; name: string; key?: string }[];
  memberNameByUserId: Map<string, string>;
  onBack: () => void;
};

export function WorkspaceMobileVirtualTableOverlay({
  table,
  columns,
  organizationId,
  organizationName = null,
  userId,
  projectsForMention,
  memberNameByUserId,
  onBack,
}: Props) {
  const {
    openTableChat,
    openRowPanel,
    closePanel,
    isTableChatOpen,
    isRowPanelOpen,
  } = useWorkspaceRightPanel();
  const { refreshEpoch } = useVirtualTableChatUnread();
  const cacheKey = useMemo(
    () => virtualTableMobileRowsCacheKey(table.id),
    [table.id]
  );
  const initialCache = useMemo(
    () => getVirtualTableMobileRowsCache(cacheKey),
    [cacheKey]
  );

  const [rows, setRows] = useState<VirtualDataRow[]>(initialCache?.rows ?? []);
  const [totalCount, setTotalCount] = useState(initialCache?.totalCount ?? 0);
  const [loading, setLoading] = useState(
    (initialCache?.rows.length ?? 0) === 0
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [relationLabels, setRelationLabels] = useState<Record<string, string>>(
    initialCache?.relationLabels ?? {}
  );
  const [unreadRowIds, setUnreadRowIds] = useState<Set<string>>(() => new Set());
  const rowsLengthRef = useRef(0);
  rowsLengthRef.current = rows.length;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const totalCountRef = useRef(totalCount);
  totalCountRef.current = totalCount;
  const relationLabelsRef = useRef(relationLabels);
  relationLabelsRef.current = relationLabels;

  const hasMore = rows.length < totalCount;

  useEffect(() => {
    const cached = getVirtualTableMobileRowsCache(cacheKey);
    setRows(cached?.rows ?? []);
    setTotalCount(cached?.totalCount ?? 0);
    setRelationLabels(cached?.relationLabels ?? {});
    setLoading((cached?.rows.length ?? 0) === 0);
  }, [cacheKey]);

  useEffect(() => {
    setVirtualTableMobileRowsCache(cacheKey, {
      rows: rowsRef.current,
      totalCount: totalCountRef.current,
      relationLabels: relationLabelsRef.current,
    });
  }, [cacheKey, rows, totalCount, relationLabels]);

  const mapCols = useMemo(
    () =>
      columns.map((c) => ({
        slug: c.slug,
        display_name: c.display_name,
        data_type: c.data_type,
        position: c.position,
      })),
    [columns]
  );

  const mergeRelationLabels = useCallback(
    async (batch: VirtualDataRow[]) => {
      const relationIds = collectRelationIdsFromVirtualPayloads(
        batch.map((r) => ({ payload: r.payload ?? {} })),
        mapCols
      );
      if (relationIds.length === 0) return;
      const resolved = await resolveRelationLabelsAction(relationIds);
      if (!resolved.error) {
        setRelationLabels((prev) => ({ ...prev, ...resolved.labels }));
      }
    },
    [mapCols]
  );

  const applyFetchResult = useCallback(
    async (
      result: Awaited<ReturnType<typeof fetchVirtualRowsAction>>,
      append: boolean
    ) => {
      if (result.error) {
        if (!append) {
          setRows([]);
          setTotalCount(0);
          setRelationLabels({});
        }
        return;
      }
      const nextRows = result.rows as VirtualDataRow[];
      setTotalCount(result.totalCount);
      setRows((prev) => (append ? [...prev, ...nextRows] : nextRows));
      if (!append && nextRows.length === 0) {
        setRelationLabels({});
      } else {
        await mergeRelationLabels(nextRows);
      }
    },
    [mergeRelationLabels]
  );

  const loadInitial = useCallback(async () => {
    const hadCache = rowsLengthRef.current > 0;
    if (!hadCache) setLoading(true);
    const limit = Math.max(rowsLengthRef.current, MOBILE_ROW_BATCH_SIZE);
    const result = await fetchVirtualRowsAction(table.id, {
      limit,
      offset: 0,
    });
    await applyFetchResult(result, false);
    setLoading(false);
  }, [table.id, applyFetchResult]);

  const reloadVisible = useCallback(async () => {
    const limit = Math.max(rowsLengthRef.current, MOBILE_ROW_BATCH_SIZE);
    setLoading(true);
    const result = await fetchVirtualRowsAction(table.id, {
      limit,
      offset: 0,
    });
    await applyFetchResult(result, false);
    setLoading(false);
  }, [table.id, applyFetchResult]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading) return;
    setLoadingMore(true);
    const result = await fetchVirtualRowsAction(table.id, {
      limit: MOBILE_ROW_BATCH_SIZE,
      offset: rowsLengthRef.current,
    });
    await applyFetchResult(result, true);
    setLoadingMore(false);
  }, [table.id, applyFetchResult, loadingMore, loading]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const onMutated = (e: Event) => {
      const detail = (e as CustomEvent<VirtualTableRowsMutatedDetail>).detail;
      if (detail?.tableId === table.id) void reloadVisible();
    };
    window.addEventListener(VIRTUAL_TABLE_ROWS_MUTATED, onMutated);
    return () =>
      window.removeEventListener(VIRTUAL_TABLE_ROWS_MUTATED, onMutated);
  }, [table.id, reloadVisible]);

  const refreshUnread = useCallback(async () => {
    if (!userId) {
      setUnreadRowIds(new Set());
      return;
    }
    const res = await fetchVirtualTableChatUnreadRowsClient(table.id);
    if (res.error || !res.data) return;
    setUnreadRowIds(new Set(res.data.map((r) => r.virtualRowId)));
  }, [table.id, userId]);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread, refreshEpoch]);

  const buildBaseMentionOptions = useCallback((): ChatMentionOption[] => {
    const opts: ChatMentionOption[] = [];
    for (const [uid, name] of memberNameByUserId) {
      opts.push({
        id: uid,
        label: name,
        kind: "user",
        searchText: name.toLowerCase(),
      });
    }
    for (const p of projectsForMention) {
      opts.push({
        id: p.id,
        label: p.name,
        kind: "project",
        searchText: `${p.name} ${p.key ?? ""}`.toLowerCase(),
      });
    }
    return opts;
  }, [memberNameByUserId, projectsForMention]);

  const tableChatMentionOptions = useMemo((): ChatMentionOption[] => {
    return [
      ...buildBaseMentionOptions(),
      {
        id: table.id,
        label: table.display_name,
        kind: "table",
        searchText: table.display_name.toLowerCase(),
      },
    ];
  }, [buildBaseMentionOptions, table.id, table.display_name]);

  const buildRowFileOptions = useCallback(
    (rowId: string): ChatAttachmentRef[] => {
      const row = rows.find((r) => r.id === rowId);
      if (!row?.payload) return [];
      const out: ChatAttachmentRef[] = [];
      for (const col of columns) {
        if (col.data_type !== "file") continue;
        const val = row.payload[col.slug];
        if (typeof val === "string" && val.trim()) {
          out.push({ label: col.display_name, url: val.trim() });
        } else if (val && typeof val === "object" && "url" in val) {
          const url = String((val as { url?: unknown }).url ?? "").trim();
          if (url) out.push({ label: col.display_name, url });
        }
      }
      return out;
    },
    [rows, columns]
  );

  const pathSegmentsForRow = useCallback(
    (rowTitle: string) =>
      buildChatRowPathSegments({
        projectName: table.project_id
          ? (projectsForMention.find((p) => p.id === table.project_id)?.name ??
            null)
          : null,
        organizationName: table.project_id ? null : organizationName,
        tableDisplayName: table.display_name,
        rowLabel: rowTitle,
      }),
    [table.project_id, table.display_name, projectsForMention, organizationName]
  );

  const openRow = useCallback(
    (rowId: string, rowTitle: string, tab: "detail" | "chat") => {
      const row = rows.find((r) => r.id === rowId);
      openRowPanel({
        tableId: table.id,
        rowId,
        pathSegments: pathSegmentsForRow(rowTitle),
        tab,
        closeWhenOverlayCloses: true,
        mentionOptions: [
          ...buildBaseMentionOptions(),
          { id: rowId, label: rowTitle, kind: "row" },
        ],
        fileAttachmentOptions: buildRowFileOptions(rowId),
        rowPayload: row?.payload,
        relationLabels,
      });
    },
    [
      rows,
      table.id,
      pathSegmentsForRow,
      openRowPanel,
      buildBaseMentionOptions,
      buildRowFileOptions,
      relationLabels,
    ]
  );

  return (
    <div className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-card/90 px-4 py-3 max-md:pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          className="mb-2 inline-flex min-h-10 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={onBack}
        >
          ← Daftar tabel
        </button>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {table.icon ? (
              <span className="mr-1 text-lg">{table.icon}</span>
            ) : null}
            <h2 className="truncate text-lg font-semibold text-foreground">
              {table.display_name}
            </h2>
            {table.description ? (
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                {table.description}
              </p>
            ) : null}
            {totalCount > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {rows.length < totalCount
                  ? `Menampilkan ${rows.length} dari ${totalCount} baris`
                  : `${totalCount} baris`}
              </p>
            ) : null}
          </div>
          {organizationId && userId ? (
            <Button
              type="button"
              variant={isTableChatOpen(table.id) ? "default" : "outline"}
              size="sm"
              className="h-11 shrink-0 gap-1.5 px-3"
              onClick={() => {
                if (isTableChatOpen(table.id)) {
                  closePanel();
                } else {
                  openTableChat({
                    tableId: table.id,
                    mentionOptions: tableChatMentionOptions,
                  });
                }
              }}
            >
              <MessageSquare className="size-4 shrink-0" />
              Chat
              <VirtualTableRoomChatUnreadBadge
                tableId={table.id}
                className="!ml-0"
              />
            </Button>
          ) : null}
        </div>
      </div>

      <div
        className={`min-h-0 flex-1 overflow-y-auto ${WORKSPACE_MOBILE_TAB_BAR_PADDING}`}
      >
        {loading && rows.length > 0 ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <Spinner className="size-3" />
            Memperbarui…
          </div>
        ) : null}
        <WorkspaceMobileRowList
          rows={rows}
          columns={columns}
          relationLabels={relationLabels}
          memberNameByUserId={memberNameByUserId}
          unreadRowIds={unreadRowIds}
          isRowPanelOpen={isRowPanelOpen}
          onOpenRow={(rowId, title) => openRow(rowId, title, "detail")}
          onOpenRowChat={(rowId, title) => openRow(rowId, title, "chat")}
          loading={loading && rows.length === 0}
        />

        {hasMore ? (
          <div className="px-3 pb-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              disabled={loadingMore || loading}
              onClick={() => void loadMore()}
            >
              {loadingMore ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Memuat…
                </>
              ) : (
                `Muat lebih (${rows.length} dari ${totalCount})`
              )}
            </Button>
          </div>
        ) : rows.length > 0 && totalCount > 0 ? (
          <p className="px-3 pb-2 text-center text-xs text-muted-foreground">
            Semua {totalCount} baris ditampilkan
          </p>
        ) : null}
      </div>
    </div>
  );
}
