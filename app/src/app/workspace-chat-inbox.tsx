"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { MessageSquare } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  useLockDocumentScrollWhile,
  useVisualViewportLayout,
} from "@/lib/use-visual-viewport-layout";
import { buildChatTablePathSegments } from "@/lib/chat-row-context";
import { fileAttachmentOptionsFromRowPayload } from "@/lib/chat-row-panel";
import {
  fetchVirtualTableChatUnreadRowsAction,
  resolveVirtualRowChatContextAction,
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
    if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
    return a.title.localeCompare(b.title, "id");
  });
}

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
  const { unreadByTableId, tableRoomUnreadByTableId, unreadByProjectId, refresh } =
    useVirtualTableChatUnread();
  const vvLayout = useVisualViewportLayout();
  const [rowEntries, setRowEntries] = useState<ChatInboxEntry[]>([]);
  const [rowLoading, setRowLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);

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

  useEffect(() => {
    if (!organizationId || !userId) {
      setRowEntries([]);
      return;
    }
    const tablesWithRowUnread = tablesInScope.filter(
      (t) => (unreadByTableId[t.id] ?? 0) > (tableRoomUnreadByTableId[t.id] ?? 0)
    );
    if (tablesWithRowUnread.length === 0) {
      setRowEntries([]);
      return;
    }

    let cancelled = false;
    setRowLoading(true);

    void (async () => {
      const next: ChatInboxEntry[] = [];
      for (const table of tablesWithRowUnread) {
        const res = await fetchVirtualTableChatUnreadRowsAction(table.id);
        if (cancelled || res.error || !res.data) continue;
        const tblProjectName = table.project_id
          ? (projectsForMention.find((p) => p.id === table.project_id)?.name ??
            null)
          : null;
        for (const row of res.data) {
          let rowTitle = "Baris";
          let pathSegments: string[] | undefined;
          const ctx = await resolveVirtualRowChatContextAction(row.virtualRowId);
          let rowPayload: Record<string, unknown> | undefined;
          if (!ctx.error && ctx.data) {
            pathSegments = ctx.data.pathSegments;
            rowPayload = ctx.data.rowPayload;
            rowTitle =
              ctx.data.pathSegments[ctx.data.pathSegments.length - 1] ?? rowTitle;
          }
          next.push({
            key: `row:${row.virtualRowId}`,
            kind: "virtual_row",
            scopeType: "virtual_row",
            title: rowTitle,
            subtitle: table.display_name,
            unreadCount: row.unreadCount,
            organizationId,
            projectId: table.project_id,
            virtualTableId: null,
            virtualRowId: row.virtualRowId,
            tableIdForRow: table.id,
            pathSegments,
            rowPayload,
          });
        }
      }
      if (!cancelled) {
        setRowEntries(sortEntries(next));
        setRowLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    organizationId,
    userId,
    tablesInScope,
    unreadByTableId,
    tableRoomUnreadByTableId,
    projectsForMention,
    refresh,
  ]);

  const entries = useMemo(
    () => sortEntries([...staticEntries, ...rowEntries]),
    [staticEntries, rowEntries]
  );

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
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-foreground">Obrolan</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {organizationName ?? "Organisasi"}
          {projectId
            ? ` · ${projectsForMention.find((p) => p.id === projectId)?.name ?? "Proyek"}`
            : ""}
        </p>
      </div>
      <ul className="min-h-0 flex-1 overflow-auto p-2">
        {rowLoading && entries.length === staticEntries.length ? (
          <li className="flex justify-center py-6">
            <Spinner className="size-5" />
          </li>
        ) : null}
        {entries.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">
            Belum ada room obrolan di scope ini.
          </li>
        ) : (
          entries.map((entry) => {
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
