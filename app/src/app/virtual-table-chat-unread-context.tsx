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
import { fetchVirtualTableChatUnreadCountsAction } from "./chat-actions";
import { CHAT_UNREAD_INVALIDATE_EVENT } from "@/lib/chat-unread-invalidate";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
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
  refreshEpoch: number;
  refresh: () => void;
};

const VirtualTableChatUnreadContext = createContext<ContextValue>({
  unreadByTableId: {},
  tableRoomUnreadByTableId: {},
  unreadByProjectId: {},
  refreshEpoch: 0,
  refresh: () => {},
});

const UNREAD_POLL_MS = 5000;

export function useVirtualTableChatUnread() {
  return useContext(VirtualTableChatUnreadContext);
}

type ProviderProps = {
  userId: string | null;
  tableIds: string[];
  tablesForProjectBadge?: VirtualTableChatUnreadScope[];
  children: ReactNode;
};

export function VirtualTableChatUnreadProvider({
  userId,
  tableIds,
  tablesForProjectBadge = [],
  children,
}: ProviderProps) {
  const [unreadByTableId, setUnreadByTableId] = useState<Record<string, number>>(
    {}
  );
  const [tableRoomUnreadByTableId, setTableRoomUnreadByTableId] = useState<
    Record<string, number>
  >({});
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const tableIdsKey = useMemo(() => tableIds.slice().sort().join(","), [tableIds]);
  const tableIdsRef = useRef(tableIds);
  tableIdsRef.current = tableIds;
  const fetchGenRef = useRef(0);

  const refresh = useCallback(() => {
    const ids = tableIdsRef.current;
    if (!userId || ids.length === 0) {
      setUnreadByTableId({});
      setTableRoomUnreadByTableId({});
      setRefreshEpoch((e) => e + 1);
      return;
    }
    const gen = ++fetchGenRef.current;
    void fetchVirtualTableChatUnreadCountsAction(ids).then((res) => {
      if (fetchGenRef.current !== gen) return;
      if (!res.error && res.data) {
        setUnreadByTableId(res.data.totalByTableId);
        setTableRoomUnreadByTableId(res.data.tableRoomByTableId);
      }
      setRefreshEpoch((e) => e + 1);
    });
  }, [userId, tableIdsKey]);

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
      debounce = setTimeout(() => refreshRef.current(), 300);
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
      const channelName = `vtable-chat-unread:${userId}`;
      channel = supabase
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
        )
        .subscribe((status) => {
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
  }, [userId]);

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

  const value = useMemo(
    () => ({
      unreadByTableId,
      tableRoomUnreadByTableId,
      unreadByProjectId,
      refreshEpoch,
      refresh,
    }),
    [
      unreadByTableId,
      tableRoomUnreadByTableId,
      unreadByProjectId,
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
      ariaLabel={`${n} pesan chat belum dibaca di project ini`}
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
