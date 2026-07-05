"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { collectRelationIdsFromVirtualPayloads } from "@/lib/virtual-table-map-popup";
import { cn } from "@/lib/utils";
import { buildChatRowPathSegments } from "@/lib/chat-row-context";
import {
  fetchVirtualRowsAction,
  resolveRelationLabelsAction,
  createVirtualRowAction,
  updateVirtualRowCellAction,
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
  hydrateVirtualTableMobileRowsCache,
  setVirtualTableMobileRowsCache,
  virtualTableMobileRowFetchLimit,
  VIRTUAL_TABLE_MOBILE_ROW_PAGE_SIZE,
  virtualTableMobileRowsCacheKey,
} from "@/lib/virtual-table-mobile-rows-cache";
import type { VirtualRowMapSelect } from "./workspace-map";
import { useWorkspaceRightPanel } from "./workspace-right-panel-context";
import { WORKSPACE_MOBILE_TAB_BAR_PADDING } from "./workspace-mobile-tabs";
import { VirtualTableKanbanView } from "./virtual-table-kanban-view";
import { VirtualTableCalendarView } from "./virtual-table-calendar-view";
import { VirtualTableGalleryView } from "./virtual-table-gallery-view";
import { VirtualTableTimelineView } from "./virtual-table-timeline-view";
import { VirtualTableFormView } from "./virtual-table-form-view";
import { VirtualTableMapView } from "./virtual-table-map-view";
import { VirtualTableChartView } from "./virtual-table-chart-view";
import { TableViewSwitcher } from "./table-view-switcher";
import { TableLayoutOptionsToolbar } from "./table-layout-options-toolbar";
import type { VirtualTableLayoutType } from "@/lib/virtual-table-layout-types";
import { readTableLayoutPreference } from "@/lib/virtual-table-layout-preference";
import { virtualRowDisplayLabel } from "@/lib/virtual-table-row-label";
import {
  isLayoutReady,
  resolveLayoutOptions,
} from "@/lib/virtual-table-layout-availability";
import type { VirtualViewLayoutOptions } from "./virtual-table-types";

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
    panel,
    openTableChat,
    openRowPanel,
    openRowDetail: openGlobalRowDetail,
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
  const [, startTransition] = useTransition();
  const [activeLayout, setActiveLayout] =
    useState<VirtualTableLayoutType>("grid");
  const [layoutOptions, setLayoutOptions] = useState<VirtualViewLayoutOptions>(
    {}
  );

  useLayoutEffect(() => {
    const layout = readTableLayoutPreference(table.id);
    setActiveLayout(layout);
    setLayoutOptions(resolveLayoutOptions(layout, {}, columns));
  }, [table.id, columns]);

  const handleLayoutChange = useCallback(
    (layout: VirtualTableLayoutType, options: VirtualViewLayoutOptions) => {
      setActiveLayout(layout);
      setLayoutOptions(options);
    },
    []
  );

  const handleLayoutOptionsChange = useCallback(
    (patch: Partial<VirtualViewLayoutOptions>) => {
      setLayoutOptions((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  useEffect(() => {
    if (activeLayout === "grid" || activeLayout === "form") return;
    setLayoutOptions((prev) =>
      resolveLayoutOptions(activeLayout, prev, columns)
    );
  }, [columns, activeLayout]);

  const effectiveLayout = useMemo(() => {
    if (
      isLayoutReady(activeLayout, layoutOptions, columns) &&
      (activeLayout === "grid" ||
        activeLayout === "kanban" ||
        activeLayout === "calendar" ||
        activeLayout === "timeline" ||
        activeLayout === "gallery" ||
        activeLayout === "form" ||
        activeLayout === "map" ||
        activeLayout === "chart")
    ) {
      return activeLayout;
    }
    return "grid" as const;
  }, [activeLayout, layoutOptions, columns]);

  const selectOptionsBySlug = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const col of columns) {
      if (col.data_type === "select" && col.config?.options) {
        m.set(col.slug, col.config.options as string[]);
      }
    }
    return m;
  }, [columns]);
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

  useLayoutEffect(() => {
    let cancelled = false;
    void hydrateVirtualTableMobileRowsCache(cacheKey).then((cached) => {
      if (cancelled || !cached?.rows.length) return;
      setRows(cached.rows);
      setTotalCount(cached.totalCount);
      setRelationLabels(cached.relationLabels);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

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

  const resolveMobileRowFetchLimit = useCallback(() => {
    const cached = getVirtualTableMobileRowsCache(cacheKey);
    return virtualTableMobileRowFetchLimit(
      cached?.rows.length ?? 0,
      rowsLengthRef.current
    );
  }, [cacheKey]);

  const loadInitial = useCallback(async () => {
    const hadCache = rowsLengthRef.current > 0;
    if (!hadCache) setLoading(true);
    const limit = resolveMobileRowFetchLimit();
    const result = await fetchVirtualRowsAction(table.id, {
      limit,
      offset: 0,
    });
    await applyFetchResult(result, false);
    setLoading(false);
  }, [table.id, applyFetchResult, resolveMobileRowFetchLimit]);

  const reloadVisible = useCallback(async () => {
    const limit = resolveMobileRowFetchLimit();
    setLoading(true);
    const result = await fetchVirtualRowsAction(table.id, {
      limit,
      offset: 0,
    });
    await applyFetchResult(result, false);
    setLoading(false);
  }, [table.id, applyFetchResult, resolveMobileRowFetchLimit]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading) return;
    setLoadingMore(true);
    const result = await fetchVirtualRowsAction(table.id, {
      limit: VIRTUAL_TABLE_MOBILE_ROW_PAGE_SIZE,
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

  const saveCell = useCallback(
    (rowId: string, colSlug: string, value: string) => {
      const fd = new FormData();
      fd.set("row_id", rowId);
      fd.set("column_slug", colSlug);
      fd.set("value", value);
      startTransition(async () => {
        const r = await updateVirtualRowCellAction(fd);
        if (r.error) toast.error(r.error);
        else await reloadVisible();
      });
    },
    [reloadVisible]
  );

  const addRow = useCallback(() => {
    const fd = new FormData();
    fd.set("table_id", table.id);
    fd.set("payload", "{}");
    startTransition(async () => {
      const r = await createVirtualRowAction(fd);
      if (r.error) toast.error(r.error);
      else await reloadVisible();
    });
  }, [table.id, reloadVisible]);

  const handleMapVirtualRowSelect = useCallback(
    (select: VirtualRowMapSelect) => {
      if (select.tableId !== table.id) return;
      const row = rows.find((r) => r.id === select.rowId);
      openGlobalRowDetail({
        tableId: table.id,
        rowId: select.rowId,
        pathSegments: select.pathSegments,
        rowPayload:
          (row?.payload as Record<string, unknown> | undefined) ??
          select.rowPayload,
        relationLabels: select.relationLabels ?? relationLabels,
      });
    },
    [table.id, rows, openGlobalRowDetail, relationLabels]
  );

  const highlightVirtualRowId =
    panel?.kind === "row-detail" && panel.tableId === table.id
      ? panel.rowId
      : null;

  const handleMapBackgroundClick = useCallback(() => {
    if (panel?.kind === "row-detail" && panel.tableId === table.id) {
      closePanel();
    }
  }, [panel, table.id, closePanel]);

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

  const openRowById = useCallback(
    (rowId: string, tab: "detail" | "chat" = "detail") => {
      const row = rows.find((r) => r.id === rowId);
      openRow(
        rowId,
        row ? virtualRowDisplayLabel(row, columns) : "Baris",
        tab
      );
    },
    [rows, columns, openRow]
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
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <TableViewSwitcher
              tableId={table.id}
              columns={columns}
              layout={activeLayout}
              layoutOptions={layoutOptions}
              onLayoutChange={handleLayoutChange}
              className="min-h-11 touch-manipulation"
            />
            {activeLayout !== "grid" && activeLayout !== "form" ? (
              <TableLayoutOptionsToolbar
                layout={activeLayout}
                columns={columns}
                layoutOptions={layoutOptions}
                onLayoutOptionsChange={handleLayoutOptionsChange}
                touchFriendly
              />
            ) : null}
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
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 pm-mobile-scroll",
          effectiveLayout === "map"
            ? "flex flex-col overflow-hidden"
            : `overflow-y-auto ${WORKSPACE_MOBILE_TAB_BAR_PADDING}`
        )}
      >
        {loading && rows.length > 0 ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <Spinner className="size-3" />
            Memperbarui…
          </div>
        ) : null}
        {effectiveLayout === "kanban" && layoutOptions.statusColumn ? (
          <VirtualTableKanbanView
            rows={rows}
            columns={columns}
            statusColumnSlug={layoutOptions.statusColumn}
            statusOptions={
              selectOptionsBySlug.get(layoutOptions.statusColumn) ?? []
            }
            onOpenRow={(rowId) => openRowById(rowId)}
            className="px-3 pb-2"
          />
        ) : effectiveLayout === "calendar" && layoutOptions.dateColumn ? (
          <VirtualTableCalendarView
            rows={rows}
            columns={columns}
            dateColumnSlug={layoutOptions.dateColumn}
            onOpenRow={(rowId) => openRowById(rowId)}
            className="px-3 pb-2"
          />
        ) : effectiveLayout === "timeline" && layoutOptions.dateColumn ? (
          <VirtualTableTimelineView
            rows={rows}
            columns={columns}
            startDateColumnSlug={layoutOptions.dateColumn}
            endDateColumnSlug={
              layoutOptions.endDateColumn ?? layoutOptions.dateColumn
            }
            onOpenRow={(rowId) => openRowById(rowId)}
            className="px-3 pb-2"
          />
        ) : effectiveLayout === "gallery" ? (
          <VirtualTableGalleryView
            rows={rows}
            columns={columns}
            coverColumnSlug={layoutOptions.coverColumn}
            onOpenRow={(rowId) => openRowById(rowId)}
            className="px-3 pb-2"
          />
        ) : effectiveLayout === "form" ? (
          <VirtualTableFormView
            rows={rows}
            columns={columns}
            selectOptionsBySlug={selectOptionsBySlug}
            relationLabels={relationLabels}
            memberNameByUserId={memberNameByUserId}
            onSaveCell={saveCell}
            onAddRow={addRow}
            onOpenGeometry={(rowId) => openRowById(rowId, "detail")}
            className="px-1 pb-2"
          />
        ) : effectiveLayout === "map" && layoutOptions.geometryColumn ? (
          <VirtualTableMapView
            table={table}
            columns={columns}
            rows={rows}
            geometryColumnSlug={layoutOptions.geometryColumn}
            relationLabels={relationLabels}
            memberNameByUserId={memberNameByUserId}
            projectName={
              table.project_id
                ? (projectsForMention.find((p) => p.id === table.project_id)
                    ?.name ?? null)
                : null
            }
            onVirtualRowSelect={handleMapVirtualRowSelect}
            highlightVirtualRowId={highlightVirtualRowId}
            onMapBackgroundClick={handleMapBackgroundClick}
            className="min-h-0 flex-1 rounded-none border-0"
          />
        ) : effectiveLayout === "chart" ? (
          <VirtualTableChartView
            rows={rows}
            columns={columns}
            chartColumnSlug={layoutOptions.chartColumn}
            chartMode={layoutOptions.chartMode ?? "bar"}
            className="px-3 pb-2"
          />
        ) : (
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
        )}

        {hasMore && effectiveLayout !== "map" && effectiveLayout !== "chart" ? (
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
