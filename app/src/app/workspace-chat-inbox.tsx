"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { MessageSquare, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  useLockDocumentScrollWhile,
  useVisualViewportLayout,
} from "@/lib/use-visual-viewport-layout";
import { buildChatTablePathSegments } from "@/lib/chat-row-context";
import { fileAttachmentOptionsFromRowPayload } from "@/lib/chat-row-panel";
import {
  fetchChatInboxActiveRowRoomsAction,
  fetchChatInboxActivityAtAction,
  resolveVirtualRowChatContextAction,
  resolveVirtualRowChatContextsBatchAction,
} from "./chat-actions";
import { ChatPanel } from "./chat-panel";
import type { ChatInboxEntry } from "./workspace-chat-inbox-types";
import type { ChatMentionOption } from "./chat-types";
import type { VirtualColumnRow, VirtualTableRow } from "./virtual-table-types";
import { useVirtualTableChatUnread } from "./virtual-table-chat-unread-context";

type Props = {
  organizationId: string | null;
  organizationName: string | null;
  projectId: string | null;
  hasOrgStaffAccess: boolean;
  userId: string | null;
  userEmail?: string | null;
  isOrgAdmin?: boolean;
  projectsForMention: { id: string; name: string; key?: string }[];
  memberNameByUserId: Map<string, string>;
  virtualTables: VirtualTableRow[];
  virtualColumns: VirtualColumnRow[];
  mentionOptions: ChatMentionOption[];
  isBelowMd: boolean;
  onMobileChatKeyboardOpenChange?: (open: boolean) => void;
};

function sortEntries(entries: ChatInboxEntry[]): ChatInboxEntry[] {
  return [...entries].sort((a, b) => {
    const aActivity = a.lastActivityAt ?? "";
    const bActivity = b.lastActivityAt ?? "";
    if (aActivity !== bActivity) return bActivity.localeCompare(aActivity);
    if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
    return a.title.localeCompare(b.title, "id");
  });
}

function entryMatchesRoomSearch(entry: ChatInboxEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    entry.title,
    entry.subtitle ?? "",
    ...(entry.pathSegments ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

const ROW_INBOX_PAGE_SIZE = 25;

export function WorkspaceChatInbox({
  organizationId,
  organizationName,
  projectId,
  hasOrgStaffAccess,
  userId,
  userEmail = null,
  isOrgAdmin = false,
  projectsForMention,
  memberNameByUserId,
  virtualTables,
  virtualColumns,
  mentionOptions,
  isBelowMd,
  onMobileChatKeyboardOpenChange,
}: Props) {
  const { tableRoomUnreadByTableId, unreadByProjectId, refresh } =
    useVirtualTableChatUnread();
  const vvLayout = useVisualViewportLayout();
  const [rowEntries, setRowEntries] = useState<ChatInboxEntry[]>([]);
  const [rowTotalCount, setRowTotalCount] = useState(0);
  const [rowLoading, setRowLoading] = useState(false);
  const [rowLoadingMore, setRowLoadingMore] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const [roomSearchQuery, setRoomSearchQuery] = useState("");
  const [activityByKey, setActivityByKey] = useState<Record<string, string>>({});

  const mobileChatKeyboardActive =
    isBelowMd && mobileConversationOpen && vvLayout.keyboardOpen;

  useLockDocumentScrollWhile(mobileChatKeyboardActive);

  useEffect(() => {
    onMobileChatKeyboardOpenChange?.(mobileChatKeyboardActive);
  }, [mobileChatKeyboardActive, onMobileChatKeyboardOpenChange]);

  useEffect(() => {
    if (!isBelowMd || mobileConversationOpen) return;
    onMobileChatKeyboardOpenChange?.(false);
  }, [isBelowMd, mobileConversationOpen, onMobileChatKeyboardOpenChange]);

  const [rowPanelExtras, setRowPanelExtras] = useState<{
    pathSegments: string[];
    rowPayload?: Record<string, unknown>;
    fileAttachmentOptions: { label: string; url: string }[];
  } | null>(null);

  const tablesInScope = useMemo(() => {
    if (!organizationId) return [];
    return virtualTables.filter((t) => {
      if (t.organization_id === organizationId && !t.project_id) return true;
      if (projectId && t.project_id === projectId) return true;
      return false;
    });
  }, [virtualTables, organizationId, projectId]);

  const tableIdsInScope = useMemo(
    () => tablesInScope.map((t) => t.id),
    [tablesInScope]
  );

  const staticEntries = useMemo((): ChatInboxEntry[] => {
    if (!organizationId) return [];
    const out: ChatInboxEntry[] = [];
    const projectName = projectId
      ? (projectsForMention.find((p) => p.id === projectId)?.name ?? null)
      : null;

    if (hasOrgStaffAccess) {
      out.push({
        key: "org",
        kind: "organization",
        scopeType: "organization",
        title: organizationName ?? "Organisasi",
        subtitle: "Tim inti organisasi",
        unreadCount: 0,
        organizationId,
        projectId: null,
        virtualTableId: null,
        virtualRowId: null,
      });
    }

    if (projectId && projectName) {
      out.push({
        key: `project:${projectId}`,
        kind: "project",
        scopeType: "project",
        title: projectName,
        subtitle: "Diskusi proyek",
        unreadCount: unreadByProjectId[projectId] ?? 0,
        organizationId,
        projectId,
        virtualTableId: null,
        virtualRowId: null,
      });
    }

    for (const table of tablesInScope) {
      const tblProjectName = table.project_id
        ? (projectsForMention.find((p) => p.id === table.project_id)?.name ??
          null)
        : null;
      out.push({
        key: `table:${table.id}`,
        kind: "virtual_table",
        scopeType: "virtual_table",
        title: table.display_name,
        subtitle: table.project_id ? (tblProjectName ?? "Proyek") : "Organisasi",
        unreadCount: tableRoomUnreadByTableId[table.id] ?? 0,
        organizationId,
        projectId: table.project_id,
        virtualTableId: table.id,
        virtualRowId: null,
        pathSegments: buildChatTablePathSegments({
          projectName: tblProjectName,
          organizationName: table.project_id ? null : organizationName,
          tableDisplayName: table.display_name,
        }),
      });
    }

    return out;
  }, [
    organizationId,
    organizationName,
    projectId,
    hasOrgStaffAccess,
    projectsForMention,
    tablesInScope,
    unreadByProjectId,
    tableRoomUnreadByTableId,
  ]);

  const loadRowEntries = useCallback(
    async (offset: number, append: boolean) => {
      if (!organizationId || !userId || tableIdsInScope.length === 0) {
        setRowEntries([]);
        setRowTotalCount(0);
        return;
      }

      if (append) setRowLoadingMore(true);
      else setRowLoading(true);

      try {
        const res = await fetchChatInboxActiveRowRoomsAction({
          tableIds: tableIdsInScope,
          limit: ROW_INBOX_PAGE_SIZE,
          offset,
        });
        if (res.error || !res.data) {
          if (!append) {
            setRowEntries([]);
            setRowTotalCount(0);
          }
          return;
        }

        const rowIds = res.data.rows.map((r) => r.virtualRowId);
        const ctxRes = await resolveVirtualRowChatContextsBatchAction(rowIds);
        const ctxByRowId = ctxRes.error ? {} : (ctxRes.data ?? {});

        const next: ChatInboxEntry[] = res.data.rows.map((row) => {
          const ctx = ctxByRowId[row.virtualRowId];
          const table = tablesInScope.find((t) => t.id === row.virtualTableId);
          const rowTitle =
            ctx?.pathSegments[ctx.pathSegments.length - 1] ?? "Baris";
          return {
            key: `row:${row.virtualRowId}`,
            kind: "virtual_row" as const,
            scopeType: "virtual_row" as const,
            title: rowTitle,
            subtitle: row.tableDisplayName,
            unreadCount: row.unreadCount,
            lastActivityAt: row.lastMessageAt,
            organizationId,
            projectId: table?.project_id ?? null,
            virtualTableId: null,
            virtualRowId: row.virtualRowId,
            tableIdForRow: row.virtualTableId,
            pathSegments: ctx?.pathSegments,
            rowPayload: ctx?.rowPayload ?? row.rowPayload,
          };
        });

        setRowTotalCount(res.data.totalCount);
        setRowEntries((prev) => (append ? [...prev, ...next] : next));
      } finally {
        setRowLoading(false);
        setRowLoadingMore(false);
      }
    },
    [organizationId, userId, tableIdsInScope, tablesInScope]
  );

  useEffect(() => {
    void loadRowEntries(0, false);
  }, [loadRowEntries, refresh]);

  useEffect(() => {
    if (!organizationId) {
      setActivityByKey({});
      return;
    }
    let cancelled = false;
    void fetchChatInboxActivityAtAction({ organizationId }).then((res) => {
      if (cancelled || res.error || !res.data) return;
      setActivityByKey(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId, projectId, refresh, mobileConversationOpen]);

  const entries = useMemo(() => {
    const withActivity = [...staticEntries, ...rowEntries].map((entry) => ({
      ...entry,
      lastActivityAt:
        entry.lastActivityAt ?? activityByKey[entry.key] ?? null,
    }));
    return sortEntries(withActivity);
  }, [staticEntries, rowEntries, activityByKey]);

  const filteredEntries = useMemo(
    () => entries.filter((e) => entryMatchesRoomSearch(e, roomSearchQuery)),
    [entries, roomSearchQuery]
  );

  const hasMoreRowEntries = rowEntries.length < rowTotalCount;

  const loadMoreRowEntries = useCallback(() => {
    if (rowLoading || rowLoadingMore || !hasMoreRowEntries) return;
    void loadRowEntries(rowEntries.length, true);
  }, [
    rowLoading,
    rowLoadingMore,
    hasMoreRowEntries,
    loadRowEntries,
    rowEntries.length,
  ]);

  const selected = useMemo(
    () => entries.find((e) => e.key === selectedKey) ?? null,
    [entries, selectedKey]
  );

  useEffect(() => {
    if (entries.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (selectedKey && entries.some((e) => e.key === selectedKey)) return;
    const firstUnread = entries.find((e) => e.unreadCount > 0);
    setSelectedKey((firstUnread ?? entries[0])!.key);
  }, [entries, selectedKey]);

  useEffect(() => {
    if (!selected || selected.kind !== "virtual_row" || !selected.virtualRowId) {
      setRowPanelExtras(null);
      return;
    }
    let cancelled = false;
    void resolveVirtualRowChatContextAction(selected.virtualRowId).then((res) => {
      if (cancelled || res.error || !res.data) return;
      const tableCols = virtualColumns.filter(
        (c) => c.table_id === res.data!.tableId
      );
      setRowPanelExtras({
        pathSegments: res.data.pathSegments,
        rowPayload: res.data.rowPayload,
        fileAttachmentOptions: fileAttachmentOptionsFromRowPayload(
          res.data.rowPayload,
          tableCols
        ),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [selected, virtualColumns]);

  const selectEntry = useCallback(
    (entry: ChatInboxEntry) => {
      setSelectedKey(entry.key);
      if (isBelowMd) setMobileConversationOpen(true);
    },
    [isBelowMd]
  );

  const closeMobileConversation = useCallback(() => {
    setMobileConversationOpen(false);
  }, []);

  const mentionForEntry = useCallback(
    (entry: ChatInboxEntry): ChatMentionOption[] => {
      const extra: ChatMentionOption[] = [];
      if (entry.kind === "virtual_table" && entry.virtualTableId) {
        extra.push({
          id: entry.virtualTableId,
          label: entry.title,
          kind: "table",
        });
      }
      if (entry.kind === "virtual_row" && entry.virtualRowId) {
        extra.push({
          id: entry.virtualRowId,
          label:
            rowPanelExtras?.pathSegments?.[
              rowPanelExtras.pathSegments.length - 1
            ] ?? "Baris",
          kind: "row",
        });
      }
      return [...mentionOptions, ...extra];
    },
    [mentionOptions, rowPanelExtras]
  );

  const chatPanelForEntry = (entry: ChatInboxEntry) => {
    if (!organizationId || !userId) return null;
    const rowTitle =
      entry.kind === "virtual_row"
        ? (rowPanelExtras?.pathSegments?.[
            rowPanelExtras.pathSegments.length - 1
          ] ?? "Baris")
        : entry.title;

    return (
      <ChatPanel
        key={entry.key}
        scopeType={entry.scopeType}
        organizationId={organizationId}
        projectId={entry.projectId}
        virtualTableId={entry.virtualTableId}
        virtualRowId={entry.virtualRowId}
        title={rowTitle}
        contextPathSegments={
          entry.pathSegments ??
          rowPanelExtras?.pathSegments ??
          (entry.kind === "virtual_table" ? [entry.title] : undefined)
        }
        subtitle={entry.subtitle ?? undefined}
        userId={userId}
        userEmail={userEmail}
        authorNameByUserId={memberNameByUserId}
        mentionOptions={mentionForEntry(entry)}
        fileAttachmentOptions={
          entry.kind === "virtual_row" && entry.rowPayload
            ? fileAttachmentOptionsFromRowPayload(
                entry.rowPayload,
                virtualColumns.filter(
                  (c) => c.table_id === (entry.tableIdForRow ?? "")
                )
              )
            : rowPanelExtras?.fileAttachmentOptions ?? []
        }
        isOrgAdmin={isOrgAdmin}
        embedded
        onInvalidateTableUnread={refresh}
        className="min-h-0 flex-1"
      />
    );
  };

  if (!organizationId || !userId) {
    return (
      <p className="text-sm text-muted-foreground">
        Pilih organisasi dan masuk untuk melihat obrolan.
      </p>
    );
  }

  if (!projectId && !hasOrgStaffAccess) {
    return (
      <p className="text-sm text-muted-foreground">
        Pilih proyek untuk melihat chat proyek dan tabel yang Anda bisa akses.
      </p>
    );
  }

  const list = (
    <div
      className={cn(
        "flex min-h-0 flex-col",
        isBelowMd ? "flex-1" : "w-full max-w-[22rem] shrink-0 border-r border-border"
      )}
    >
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={roomSearchQuery}
            onChange={(e) => setRoomSearchQuery(e.target.value)}
            placeholder="Cari obrolan…"
            aria-label="Cari obrolan"
            data-testid="chat-inbox-search"
            className="h-10 border-border bg-muted/30 pl-9"
          />
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-auto p-2">
        {rowLoading && entries.length === staticEntries.length ? (
          <li className="flex justify-center py-6">
            <Spinner className="size-5" />
          </li>
        ) : null}
        {filteredEntries.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">
            {entries.length === 0
              ? "Belum ada room obrolan di scope ini."
              : "Tidak ada room yang cocok dengan pencarian."}
          </li>
        ) : (
          filteredEntries.map((entry) => {
            const active = entry.key === selectedKey;
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  data-testid="chat-inbox-room"
                  onClick={() => selectEntry(entry)}
                  className={cn(
                    "flex w-full min-h-[3.25rem] items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    active ? "bg-primary/10" : "hover:bg-muted/60"
                  )}
                >
                  <MessageSquare
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      entry.unreadCount > 0
                        ? "text-amber-600"
                        : "text-muted-foreground"
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {entry.title}
                    </span>
                    {entry.subtitle ? (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {entry.subtitle}
                      </span>
                    ) : null}
                  </span>
                  {entry.unreadCount > 0 ? (
                    <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white tabular-nums">
                      {entry.unreadCount > 99 ? "99+" : entry.unreadCount}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
        {hasMoreRowEntries && !roomSearchQuery.trim() ? (
          <li className="px-2 py-2">
            <button
              type="button"
              data-testid="chat-inbox-load-more"
              onClick={loadMoreRowEntries}
              disabled={rowLoadingMore}
              className={cn(
                "flex w-full items-center justify-center rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors",
                rowLoadingMore
                  ? "cursor-wait text-muted-foreground"
                  : "text-foreground hover:bg-muted/60"
              )}
            >
              {rowLoadingMore ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Memuat…
                </>
              ) : (
                `Muat lebih (${rowEntries.length} / ${rowTotalCount})`
              )}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );

  const detail = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      {selected ? (
        chatPanelForEntry(selected)
      ) : (
        <p className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          Pilih room obrolan
        </p>
      )}
    </div>
  );

  if (isBelowMd) {
    const roomHeader = selected ? (
      <div className="z-10 flex min-h-11 shrink-0 items-center gap-2 border-b border-border bg-card/95 px-3 py-2 backdrop-blur-sm">
        <button
          type="button"
          className="inline-flex shrink-0 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={closeMobileConversation}
          data-testid="chat-inbox-back"
        >
          ← Daftar obrolan
        </button>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
          {selected.title}
        </h1>
      </div>
    ) : null;

    return (
      <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
        {mobileConversationOpen && selected ? (
          mobileChatKeyboardActive ? (
            <div
              className="fixed inset-x-0 z-[70] flex flex-col overflow-hidden bg-background"
              style={{
                top: vvLayout.offsetTop,
                height: vvLayout.height,
              }}
            >
              {roomHeader}
              <div className="flex h-0 min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {chatPanelForEntry(selected)}
              </div>
            </div>
          ) : (
            <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden bg-background">
              {roomHeader}
              <div className="flex h-0 min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {chatPanelForEntry(selected)}
              </div>
            </div>
          )
        ) : (
          list
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-[min(70vh,720px)] w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {list}
      {detail}
    </div>
  );
}
