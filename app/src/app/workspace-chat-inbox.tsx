"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Building2, FolderKanban, Rows3, Search, Table2, type LucideIcon } from "lucide-react";
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
  fetchChatInboxRoomMetaAction,
  fetchChatInboxUnreadMentionKeysAction,
  resolveVirtualRowChatContextAction,
  resolveVirtualRowChatContextsBatchAction,
} from "./chat-actions";
import { ChatPanel } from "./chat-panel";
import { WORKSPACE_TAB_LIST_HEADER_CLASS } from "./workspace-tab-list-header";
import type { ChatInboxEntry, ChatInboxEntryKind } from "./workspace-chat-inbox-types";
import type { ChatMentionOption } from "./chat-types";
import type { VirtualColumnRow, VirtualTableRow } from "./virtual-table-types";
import { CHAT_UNREAD_INVALIDATE_EVENT } from "@/lib/chat-unread-invalidate";
import {
  buildChatInboxCacheKey,
  getChatInboxCache,
  setChatInboxCache,
} from "@/lib/chat-inbox-cache";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { useVirtualTableChatUnread } from "./virtual-table-chat-unread-context";
import type { RealtimeChannel } from "@supabase/supabase-js";

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
  onMobileConversationOpenChange?: (open: boolean) => void;
};

function inboxIconForKind(kind: ChatInboxEntryKind): LucideIcon {
  switch (kind) {
    case "organization":
      return Building2;
    case "project":
      return FolderKanban;
    case "virtual_table":
      return Table2;
    case "virtual_row":
      return Rows3;
  }
}

function sortEntries(
  entries: ChatInboxEntry[],
  mentionKeys: Set<string>
): ChatInboxEntry[] {
  return [...entries].sort((a, b) => {
    const aMention = mentionKeys.has(a.key) ? 1 : 0;
    const bMention = mentionKeys.has(b.key) ? 1 : 0;
    if (aMention !== bMention) return bMention - aMention;
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
    entry.lastMessagePreview ?? "",
    ...(entry.pathSegments ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function formatInboxPreview(preview: string | null | undefined): string | null {
  if (!preview?.trim()) return null;
  return preview.replace(/\s+/g, " ").trim();
}

/** Tampilan satu baris di daftar obrolan — dipangkas agar tidak melebar layout. */
function inboxPreviewLine(preview: string | null | undefined): string {
  const text = formatInboxPreview(preview);
  if (!text) return "Belum ada pesan";

  const maxLen = 40;
  const maxUnbrokenLen = 22;

  if (!/\s/.test(text) && text.length > maxUnbrokenLen) {
    return `${text.slice(0, maxUnbrokenLen - 1)}…`;
  }
  if (text.length > maxLen) {
    return `${text.slice(0, maxLen - 1)}…`;
  }
  return text;
}

const ROW_INBOX_PAGE_SIZE = 25;
const INBOX_LIVE_POLL_MS = 3000;

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
  onMobileConversationOpenChange,
}: Props) {
  const {
    tableRoomUnreadByTableId,
    organizationRoomUnread,
    projectRoomUnread,
    refreshEpoch,
  } = useVirtualTableChatUnread();
  const vvLayout = useVisualViewportLayout();
  const [rowEntries, setRowEntries] = useState<ChatInboxEntry[]>([]);
  const [rowTotalCount, setRowTotalCount] = useState(0);
  const [rowLoading, setRowLoading] = useState(false);
  const [rowLoadingMore, setRowLoadingMore] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const [roomSearchQuery, setRoomSearchQuery] = useState("");
  const [roomMetaByKey, setRoomMetaByKey] = useState<
    Record<string, { lastActivityAt: string; lastMessagePreview: string | null }>
  >({});
  const [mentionKeys, setMentionKeys] = useState<Set<string>>(() => new Set());

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

  useEffect(() => {
    if (!isBelowMd) return;
    onMobileConversationOpenChange?.(mobileConversationOpen);
  }, [isBelowMd, mobileConversationOpen, onMobileConversationOpenChange]);

  useEffect(() => {
    if (!isBelowMd) {
      onMobileConversationOpenChange?.(false);
    }
  }, [isBelowMd, onMobileConversationOpenChange]);

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

  const inboxCacheKey = useMemo(() => {
    if (!organizationId) return null;
    return buildChatInboxCacheKey({
      organizationId,
      projectId,
      tableIds: tableIdsInScope,
    });
  }, [organizationId, projectId, tableIdsInScope]);

  useLayoutEffect(() => {
    if (!inboxCacheKey) {
      setRowEntries([]);
      setRowTotalCount(0);
      setRoomMetaByKey({});
      setMentionKeys(new Set());
      setRowLoading(true);
      return;
    }
    const cached = getChatInboxCache(inboxCacheKey);
    if (!cached) {
      setRowLoading(true);
      return;
    }
    setRowEntries(cached.rowEntries);
    setRowTotalCount(cached.rowTotalCount);
    setRoomMetaByKey(cached.roomMetaByKey);
    setMentionKeys(new Set(cached.mentionKeys));
    setRowLoading(cached.rowEntries.length === 0);
  }, [inboxCacheKey]);

  useEffect(() => {
    if (!inboxCacheKey) return;
    if (
      rowEntries.length === 0 &&
      Object.keys(roomMetaByKey).length === 0 &&
      mentionKeys.size === 0
    ) {
      return;
    }
    setChatInboxCache(inboxCacheKey, {
      rowEntries,
      rowTotalCount,
      roomMetaByKey,
      mentionKeys: [...mentionKeys],
    });
  }, [
    inboxCacheKey,
    rowEntries,
    rowTotalCount,
    roomMetaByKey,
    mentionKeys,
  ]);

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
        subtitle: null,
        unreadCount: organizationRoomUnread,
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
        subtitle: organizationName ?? null,
        unreadCount: projectRoomUnread,
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
    organizationRoomUnread,
    projectRoomUnread,
    projectsForMention,
    tablesInScope,
    tableRoomUnreadByTableId,
  ]);

  const loadRowEntries = useCallback(
    async (
      offset: number,
      append: boolean,
      options?: { silent?: boolean; limit?: number }
    ) => {
      if (!organizationId || !userId || tableIdsInScope.length === 0) {
        setRowEntries([]);
        setRowTotalCount(0);
        return;
      }

      const limit = options?.limit ?? ROW_INBOX_PAGE_SIZE;

      if (append) setRowLoadingMore(true);
      else if (!options?.silent) {
        const cached = inboxCacheKey ? getChatInboxCache(inboxCacheKey) : null;
        if (!cached?.rowEntries.length) setRowLoading(true);
      }

      try {
        const res = await fetchChatInboxActiveRowRoomsAction({
          tableIds: tableIdsInScope,
          limit,
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
            lastMessagePreview: row.lastMessagePreview,
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
    [organizationId, userId, tableIdsInScope, tablesInScope, inboxCacheKey]
  );

  const mobileConversationWasOpenRef = useRef(false);
  const mobileConversationOpenRef = useRef(mobileConversationOpen);
  mobileConversationOpenRef.current = mobileConversationOpen;
  const rowEntriesCountRef = useRef(0);

  useEffect(() => {
    rowEntriesCountRef.current = rowEntries.length;
  }, [rowEntries.length]);

  const loadRoomMeta = useCallback(async () => {
    if (!organizationId) {
      setRoomMetaByKey({});
      return;
    }
    const res = await fetchChatInboxRoomMetaAction({ organizationId });
    if (!res.error && res.data) setRoomMetaByKey(res.data);
  }, [organizationId]);

  const loadMentionKeys = useCallback(async () => {
    if (!organizationId) {
      setMentionKeys(new Set());
      return;
    }
    const res = await fetchChatInboxUnreadMentionKeysAction({ organizationId });
    if (!res.error && res.data) {
      setMentionKeys(new Set(res.data));
    }
  }, [organizationId]);

  const syncInboxFromServer = useCallback(() => {
    void loadRoomMeta();
    void loadMentionKeys();
    if (mobileConversationOpenRef.current) return;
    const limit = Math.max(rowEntriesCountRef.current, ROW_INBOX_PAGE_SIZE);
    void loadRowEntries(0, false, { silent: true, limit });
  }, [loadRoomMeta, loadMentionKeys, loadRowEntries]);

  useEffect(() => {
    const cached = inboxCacheKey ? getChatInboxCache(inboxCacheKey) : null;
    void loadRowEntries(0, false, {
      silent: (cached?.rowEntries.length ?? 0) > 0,
    });
  }, [loadRowEntries, inboxCacheKey]);

  useEffect(() => {
    void loadRoomMeta();
    void loadMentionKeys();
  }, [loadRoomMeta, loadMentionKeys, projectId]);

  useEffect(() => {
    if (refreshEpoch < 1) return;
    syncInboxFromServer();
  }, [refreshEpoch, syncInboxFromServer]);

  useEffect(() => {
    if (!organizationId || !userId) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => syncInboxFromServer(), 300);
    };

    window.addEventListener(CHAT_UNREAD_INVALIDATE_EVENT, schedule);

    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") schedule();
    }, INBOX_LIVE_POLL_MS);

    const supabase = getBrowserSupabaseClient();
    let channel: RealtimeChannel | null = null;
    if (supabase) {
      channel = supabase
        .channel(`chat-inbox:${userId}:${organizationId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "core_pm", table: "chat_messages" },
          schedule
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "core_pm",
            table: "chat_rooms",
            filter: `organization_id=eq.${organizationId}`,
          },
          schedule
        )
        .subscribe();
    }

    return () => {
      if (debounce) clearTimeout(debounce);
      window.removeEventListener(CHAT_UNREAD_INVALIDATE_EVENT, schedule);
      window.clearInterval(pollId);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [organizationId, userId, syncInboxFromServer]);

  useEffect(() => {
    if (mobileConversationWasOpenRef.current && !mobileConversationOpen) {
      const cached = inboxCacheKey ? getChatInboxCache(inboxCacheKey) : null;
      void loadRowEntries(0, false, {
        silent: (cached?.rowEntries.length ?? 0) > 0,
      });
      void loadRoomMeta();
      void loadMentionKeys();
    }
    mobileConversationWasOpenRef.current = mobileConversationOpen;
  }, [mobileConversationOpen, loadRowEntries, loadRoomMeta, loadMentionKeys, inboxCacheKey]);

  const handleRoomMarkedRead = useCallback((roomKey: string) => {
    setRowEntries((prev) =>
      prev.map((e) => (e.key === roomKey ? { ...e, unreadCount: 0 } : e))
    );
  }, []);

  const entries = useMemo(() => {
    const withActivity = [...staticEntries, ...rowEntries].map((entry) => {
      const meta = roomMetaByKey[entry.key];
      return {
        ...entry,
        lastActivityAt:
          entry.lastActivityAt ?? meta?.lastActivityAt ?? null,
        lastMessagePreview:
          entry.lastMessagePreview ?? meta?.lastMessagePreview ?? null,
      };
    });
    return sortEntries(withActivity, mentionKeys);
  }, [staticEntries, rowEntries, roomMetaByKey, mentionKeys]);

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
    const firstMention = entries.find((e) => mentionKeys.has(e.key));
    const firstUnread = entries.find((e) => e.unreadCount > 0);
    setSelectedKey((firstMention ?? firstUnread ?? entries[0])!.key);
  }, [entries, selectedKey, mentionKeys]);

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
        roomCacheKey={entry.key}
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
        conversationActive={!isBelowMd || mobileConversationOpen}
        onInvalidateTableUnread={() => handleRoomMarkedRead(entry.key)}
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
        "flex min-h-0 min-w-0 flex-col overflow-hidden",
        isBelowMd ? "w-full min-w-0 flex-1" : "w-full max-w-[22rem] shrink-0 border-r border-border"
      )}
    >
      <div className={WORKSPACE_TAB_LIST_HEADER_CLASS}>
        <div className="relative w-full">
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
      <ul className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-2">
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
            const hasUnreadMention = mentionKeys.has(entry.key);
            const previewText =
              formatInboxPreview(entry.lastMessagePreview) ?? "Belum ada pesan";
            const previewLine = inboxPreviewLine(entry.lastMessagePreview);
            const EntryIcon = inboxIconForKind(entry.kind);
            return (
              <li key={entry.key} className="min-w-0">
                <button
                  type="button"
                  data-testid="chat-inbox-room"
                  onClick={() => selectEntry(entry)}
                  className={cn(
                    "flex w-full min-h-[3.25rem] min-w-0 max-w-full items-start gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-left transition-colors",
                    active ? "bg-primary/10" : "hover:bg-muted/60"
                  )}
                >
                  <EntryIcon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      entry.unreadCount > 0
                        ? "text-amber-600"
                        : "text-muted-foreground"
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 basis-0 overflow-hidden">
                    <span className="flex min-w-0 items-baseline justify-between gap-2 overflow-hidden">
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                        <span className="truncate text-sm font-medium text-foreground">
                          {entry.title}
                        </span>
                        {hasUnreadMention ? (
                          <span
                            className="shrink-0 text-xs font-bold text-sky-600 dark:text-sky-400"
                            aria-label="Anda disebut, belum dibaca"
                            title="Anda disebut"
                          >
                            @
                          </span>
                        ) : null}
                      </span>
                      {entry.subtitle ? (
                        <span className="max-w-[42%] shrink-0 truncate text-[11px] text-muted-foreground">
                          {entry.subtitle}
                        </span>
                      ) : null}
                    </span>
                    <p
                      className="mt-0.5 min-w-0 max-w-full truncate break-all text-xs text-muted-foreground"
                      title={previewText}
                    >
                      {previewLine}
                    </p>
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
      <div
        className={cn(
          WORKSPACE_TAB_LIST_HEADER_CLASS,
          "z-10 gap-2 bg-background"
        )}
      >
        <button
          type="button"
          className="inline-flex min-h-10 shrink-0 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={closeMobileConversation}
          data-testid="chat-inbox-back"
        >
          ← Daftar obrolan
        </button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {selected.title}
        </h1>
      </div>
    ) : null;

    return (
      <div className="flex h-0 min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            "flex h-0 min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden",
            mobileConversationOpen && "hidden"
          )}
          aria-hidden={mobileConversationOpen}
        >
          {list}
        </div>
        {selected ? (
          mobileChatKeyboardActive ? (
            <div
              className="fixed z-[70] flex flex-col overflow-hidden bg-background max-md:left-[calc(env(safe-area-inset-left)+0.5rem)] max-md:right-[calc(env(safe-area-inset-right)+0.5rem)] md:inset-x-0"
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
            <div
              className={cn(
                "flex h-0 min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background",
                (!mobileConversationOpen || mobileChatKeyboardActive) &&
                  "hidden pointer-events-none"
              )}
              aria-hidden={!mobileConversationOpen || mobileChatKeyboardActive}
            >
              {mobileConversationOpen ? roomHeader : null}
              <div className="flex h-0 min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {chatPanelForEntry(selected)}
              </div>
            </div>
          )
        ) : null}
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
