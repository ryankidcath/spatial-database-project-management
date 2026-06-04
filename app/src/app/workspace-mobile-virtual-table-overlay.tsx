"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { fetchVirtualTableChatUnreadRowsAction } from "./chat-actions";
import {
  VIRTUAL_TABLE_ROWS_MUTATED,
  type VirtualTableRowsMutatedDetail,
} from "@/lib/workspace-virtual-table-mutations";
import { useWorkspaceRightPanel } from "./workspace-right-panel-context";

const MOBILE_ROW_PAGE_SIZE = 50;

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

  const [rows, setRows] = useState<VirtualDataRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [relationLabels, setRelationLabels] = useState<Record<string, string>>(
    {}
  );
  const [unreadRowIds, setUnreadRowIds] = useState<Set<string>>(() => new Set());

  const totalPages = Math.max(1, Math.ceil(totalCount / MOBILE_ROW_PAGE_SIZE));
  const pageStart =
    totalCount === 0 ? 0 : pageIndex * MOBILE_ROW_PAGE_SIZE + 1;
  const pageEnd = Math.min(totalCount, (pageIndex + 1) * MOBILE_ROW_PAGE_SIZE);

  const loadRows = useCallback(async () => {
    setLoading(true);
    const result = await fetchVirtualRowsAction(table.id, {
      limit: MOBILE_ROW_PAGE_SIZE,
      offset: pageIndex * MOBILE_ROW_PAGE_SIZE,
    });
    if (result.error) {
      setRows([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }
    const nextRows = result.rows as VirtualDataRow[];
    setRows(nextRows);
    setTotalCount(result.totalCount);

    const mapCols = columns.map((c) => ({
      slug: c.slug,
      display_name: c.display_name,
      data_type: c.data_type,
      position: c.position,
    }));
    const relationIds = collectRelationIdsFromVirtualPayloads(
      nextRows.map((r) => ({ payload: r.payload ?? {} })),
      mapCols
    );
    if (relationIds.length > 0) {
      const resolved = await resolveRelationLabelsAction(relationIds);
      if (!resolved.error) setRelationLabels(resolved.labels);
    } else {
      setRelationLabels({});
    }
    setLoading(false);
  }, [table.id, pageIndex, columns]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    const onMutated = (e: Event) => {
      const detail = (e as CustomEvent<VirtualTableRowsMutatedDetail>).detail;
      if (detail?.tableId === table.id) void loadRows();
    };
    window.addEventListener(VIRTUAL_TABLE_ROWS_MUTATED, onMutated);
    return () =>
      window.removeEventListener(VIRTUAL_TABLE_ROWS_MUTATED, onMutated);
  }, [table.id, loadRows]);

  useEffect(() => {
    setPageIndex(0);
  }, [table.id]);

  useEffect(() => {
    if (pageIndex > totalPages - 1) {
      setPageIndex(Math.max(0, totalPages - 1));
    }
  }, [pageIndex, totalPages]);

  const refreshUnread = useCallback(async () => {
    if (!userId) {
      setUnreadRowIds(new Set());
      return;
    }
    const res = await fetchVirtualTableChatUnreadRowsAction(table.id);
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
    <div className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-background max-md:pb-[env(safe-area-inset-bottom)]">
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

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {loading && rows.length > 0 ? (
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3" />
            Memuat…
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
          loading={loading}
        />
      </div>

      {totalCount > MOBILE_ROW_PAGE_SIZE ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-card/90 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10"
            disabled={pageIndex <= 0 || loading}
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
          >
            Sebelumnya
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {pageStart}–{pageEnd} dari {totalCount}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10"
            disabled={pageIndex >= totalPages - 1 || loading}
            onClick={() => setPageIndex((p) => p + 1)}
          >
            Berikutnya
          </Button>
        </div>
      ) : totalCount > 0 ? (
        <p className="shrink-0 border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
          {totalCount} baris
        </p>
      ) : null}
    </div>
  );
}
