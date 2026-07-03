"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchChatStaticRoomsUnreadCountClient,
  fetchVirtualTableChatUnreadCountsClient,
} from "@/lib/chat-client";
import { CHAT_UNREAD_INVALIDATE_EVENT } from "@/lib/chat-unread-invalidate";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ruangKerjaIni } from "@/lib/product-labels";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type VirtualTableChatUnreadScope = {
  id: string;
  projectId: string | null;
};

type ContextValue = {
  /** Room tabel + semua baris (badge sidebar / project). */
  unreadByTableId: Record<string, number>;
  /** Hanya room chat tingkat tabel (tombol Chat tabel). */
  tableRoomUnreadByTableId: Record<string, number>;
  unreadByProjectId: Record<string, number>;
  /** Total unread di scope inbox aktif (org + proyek + tabel/baris). */
  inboxScopeUnreadTotal: number;
  organizationRoomUnread: number;
  projectRoomUnread: number;
  refreshEpoch: number;
  refresh: () => void;
};

const VirtualTableChatUnreadContext = createContext<ContextValue>({
  unreadByTableId: {},
  tableRoomUnreadByTableId: {},
  unreadByProjectId: {},
  inboxScopeUnreadTotal: 0,
  organizationRoomUnread: 0,
  projectRoomUnread: 0,
  refreshEpoch: 0,
  refresh: () => {},
});

const UNREAD_POLL_MS = 3000;

export function useVirtualTableChatUnread() {
  return useContext(VirtualTableChatUnreadContext);
}

type ProviderProps = {
  userId: string | null;
  tableIds: string[];
  tablesForProjectBadge?: VirtualTableChatUnreadScope[];
  /** Tabel virtual dalam scope workspace aktif (untuk badge tab Obrolan). */
  scopeTableIds?: string[];
  scopeOrganizationId?: string | null;
  scopeProjectId?: string | null;
  includeOrgRoomUnread?: boolean;
  children: ReactNode;
};

export function VirtualTableChatUnreadProvider({
  userId,
  tableIds,
  tablesForProjectBadge = [],
  scopeTableIds = [],
  scopeOrganizationId = null,
  scopeProjectId = null,
  includeOrgRoomUnread = false,
  children,
}: ProviderProps) {
  const [unreadByTableId, setUnreadByTableId] = useState<Record<string, number>>(
    {}
  );
  const [tableRoomUnreadByTableId, setTableRoomUnreadByTableId] = useState<
    Record<string, number>
  >({});
  const [staticRoomsUnread, setStaticRoomsUnread] = useState({
    organizationUnread: 0,
    projectUnread: 0,
  });
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const tableIdsKey = useMemo(() => tableIds.slice().sort().join(","), [tableIds]);
  const scopeTableIdsKey = useMemo(
    () => scopeTableIds.slice().sort().join(","),
    [scopeTableIds]
  );
  const scopeOrgProjectKey = `${scopeOrganizationId ?? ""}:${scopeProjectId ?? ""}:${includeOrgRoomUnread}`;
  const tableIdsRef = useRef(tableIds);
  tableIdsRef.current = tableIds;
  const fetchGenRef = useRef(0);

  const refresh = useCallback(() => {
    const ids = tableIdsRef.current;
    const gen = ++fetchGenRef.current;

    const tablePromise =
      !userId || ids.length === 0
        ? Promise.resolve({
            error: null as string | null,
            data: {
              totalByTableId: {} as Record<string, number>,
              tableRoomByTableId: {} as Record<string, number>,
            },
          })
        : fetchVirtualTableChatUnreadCountsClient(ids);

    const staticPromise =
      !userId || !scopeOrganizationId
        ? Promise.resolve({
            error: null as string | null,
            data: { organizationUnread: 0, projectUnread: 0 },
          })
        : fetchChatStaticRoomsUnreadCountClient({
            organizationId: scopeOrganizationId,
            projectId: scopeProjectId,
          });

    void Promise.all([tablePromise, staticPromise]).then(([tableRes, staticRes]) => {
      if (fetchGenRef.current !== gen) return;

      if (!tableRes.error && tableRes.data) {
        setUnreadByTableId(tableRes.data.totalByTableId);
        setTableRoomUnreadByTableId(tableRes.data.tableRoomByTableId);
      } else if (!userId || ids.length === 0) {
        setUnreadByTableId({});
        setTableRoomUnreadByTableId({});
      }

      if (!staticRes.error && staticRes.data) {
        setStaticRoomsUnread({
          organizationUnread: includeOrgRoomUnread
            ? staticRes.data.organizationUnread
            : 0,
          projectUnread: staticRes.data.projectUnread,
        });
      } else if (!userId || !scopeOrganizationId) {
        setStaticRoomsUnread({ organizationUnread: 0, projectUnread: 0 });
      }

      setRefreshEpoch((e) => e + 1);
    });
  }, [
    userId,
    tableIdsKey,
    scopeTableIdsKey,
    scopeOrgProjectKey,
    scopeOrganizationId,
    scopeProjectId,
    includeOrgRoomUnread,
  ]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => refreshRef.current(), 150);
    };

    const onInvalidate = () => scheduleRefresh();
    window.addEventListener(CHAT_UNREAD_INVALIDATE_EVENT, onInvalidate);

    const onFocus = () => scheduleRefresh();
    window.addEventListener("focus", onFocus);

    const onVisibility = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") scheduleRefresh();
    }, UNREAD_POLL_MS);

    const supabase = getBrowserSupabaseClient();
    let channel: RealtimeChannel | null = null;

    if (supabase) {
      const channelName = `vtable-chat-unread:${userId}:${scopeOrganizationId ?? "none"}`;
      let ch = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "core_pm", table: "chat_messages" },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "core_pm",
            table: "chat_room_reads",
            filter: `user_id=eq.${userId}`,
          },
          scheduleRefresh
        );

      if (scopeOrganizationId) {
        ch = ch.on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "core_pm",
            table: "chat_rooms",
            filter: `organization_id=eq.${scopeOrganizationId}`,
          },
          scheduleRefresh
        );
      }

      channel = ch.subscribe((status) => {
        if (status === "SUBSCRIBED") return;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          scheduleRefresh();
        }
      });
    }

    return () => {
      if (debounce) clearTimeout(debounce);
      window.removeEventListener(CHAT_UNREAD_INVALIDATE_EVENT, onInvalidate);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(pollId);
      if (supabase && channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [userId, scopeOrganizationId]);

  const unreadByProjectId = useMemo(() => {
    const out: Record<string, number> = {};
    for (const vt of tablesForProjectBadge) {
      if (!vt.projectId) continue;
      const n = unreadByTableId[vt.id] ?? 0;
      if (n > 0) {
        out[vt.projectId] = (out[vt.projectId] ?? 0) + n;
      }
    }
    return out;
  }, [tablesForProjectBadge, unreadByTableId]);

  const inboxScopeUnreadTotal = useMemo(() => {
    let total =
      staticRoomsUnread.organizationUnread + staticRoomsUnread.projectUnread;
    for (const id of scopeTableIds) {
      total += unreadByTableId[id] ?? 0;
    }
    return total;
  }, [staticRoomsUnread, scopeTableIds, unreadByTableId]);

  const value = useMemo(
    () => ({
      unreadByTableId,
      tableRoomUnreadByTableId,
      unreadByProjectId,
      inboxScopeUnreadTotal,
      organizationRoomUnread: staticRoomsUnread.organizationUnread,
      projectRoomUnread: staticRoomsUnread.projectUnread,
      refreshEpoch,
      refresh,
    }),
    [
      unreadByTableId,
      tableRoomUnreadByTableId,
      unreadByProjectId,
      inboxScopeUnreadTotal,
      staticRoomsUnread,
      refreshEpoch,
      refresh,
    ]
  );

  return (
    <VirtualTableChatUnreadContext.Provider value={value}>
      {children}
    </VirtualTableChatUnreadContext.Provider>
  );
}

function ChatUnreadCountBadge({
  count,
  ariaLabel,
  className = "",
}: {
  count: number;
  ariaLabel: string;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={`ml-auto shrink-0 rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white ${className}`.trim()}
      aria-label={ariaLabel}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function VirtualTableChatUnreadBadge({
  tableId,
  className = "",
}: {
  tableId: string;
  className?: string;
}) {
  const { unreadByTableId } = useVirtualTableChatUnread();
  const n = unreadByTableId[tableId] ?? 0;
  return (
    <ChatUnreadCountBadge
      count={n}
      ariaLabel={`${n} pesan chat belum dibaca`}
      className={className}
    />
  );
}

export function ProjectChatUnreadBadge({
  projectId,
  className = "",
}: {
  projectId: string;
  className?: string;
}) {
  const { unreadByProjectId } = useVirtualTableChatUnread();
  const n = unreadByProjectId[projectId] ?? 0;
  return (
    <ChatUnreadCountBadge
      count={n}
      ariaLabel={`${n} pesan chat belum dibaca di ${ruangKerjaIni}`}
      className={className}
    />
  );
}

export function VirtualTableRoomChatUnreadBadge({
  tableId,
  className = "",
}: {
  tableId: string;
  className?: string;
}) {
  const { tableRoomUnreadByTableId } = useVirtualTableChatUnread();
  const n = tableRoomUnreadByTableId[tableId] ?? 0;
  return (
    <ChatUnreadCountBadge
      count={n}
      ariaLabel={`${n} pesan chat tabel belum dibaca`}
      className={className}
    />
  );
}

/** Label tab Chat desktop dengan badge unread. */
export function ChatTabLabel({ label = "Chat" }: { label?: string }) {
  const { inboxScopeUnreadTotal } = useVirtualTableChatUnread();
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {inboxScopeUnreadTotal > 0 ? (
        <span
          className="rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
          aria-label={`${inboxScopeUnreadTotal} obrolan belum dibaca`}
        >
          {inboxScopeUnreadTotal > 9 ? "9+" : inboxScopeUnreadTotal}
        </span>
      ) : null}
    </span>
  );
}

/** Badge unread total scope inbox (tab Obrolan). */
export function ChatInboxScopeUnreadBadge({
  className = "",
  position = "inline",
}: {
  className?: string;
  /** `tab` = overlay di pojok ikon tab mobile. */
  position?: "inline" | "tab";
}) {
  const { inboxScopeUnreadTotal } = useVirtualTableChatUnread();
  if (inboxScopeUnreadTotal <= 0) return null;

  const label = `${inboxScopeUnreadTotal} obrolan belum dibaca`;
  const text = inboxScopeUnreadTotal > 9 ? "9+" : String(inboxScopeUnreadTotal);

  if (position === "tab") {
    return (
      <span
        className={cn(
          "absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-0.5 text-[9px] font-bold leading-none text-white",
          className
        )}
        aria-label={label}
      >
        {text}
      </span>
    );
  }

  return (
    <ChatUnreadCountBadge
      count={inboxScopeUnreadTotal}
      ariaLabel={label}
      className={className}
    />
  );
}
