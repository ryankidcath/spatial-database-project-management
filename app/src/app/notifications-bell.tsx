"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./user-notifications-actions";
import { flushDueCellNotificationsAction } from "./user-notification-preferences-actions";
import { NotificationPreferencesPanel } from "./notification-preferences-panel";
import type { UserNotificationRow } from "./user-notification-types";
import { formatShortDate } from "./schedule-utils";
import { viewToParam } from "./workspace-url";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MAX_NOTIFICATIONS = 50;

type Props = {
  userId: string | null;
  notifications: UserNotificationRow[];
  scopeOrganizationId?: string | null;
  scopeProjectId?: string | null;
  /** Sinkron scope + tab dengan workspace (hindari Link yang tidak memicu state). */
  onNavigate?: (n: UserNotificationRow) => void;
  /** Ikon lonceng saja (header mobile ringkas). */
  compact?: boolean;
};

function rowFromRealtimeRecord(
  record: Record<string, unknown>
): UserNotificationRow | null {
  const id = String(record.id ?? "");
  if (!id) return null;
  return {
    id,
    user_id: String(record.user_id ?? ""),
    organization_id: String(record.organization_id ?? ""),
    project_id: record.project_id != null ? String(record.project_id) : null,
    kind: String(record.kind ?? "system"),
    severity: String(record.severity ?? "info"),
    title: String(record.title ?? ""),
    body: record.body != null ? String(record.body) : null,
    payload: record.payload ?? {},
    read_at: record.read_at != null ? String(record.read_at) : null,
    created_at: String(record.created_at ?? new Date().toISOString()),
  };
}

function mergeNotification(
  list: UserNotificationRow[],
  row: UserNotificationRow
): UserNotificationRow[] {
  const without = list.filter((n) => n.id !== row.id);
  return [row, ...without]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_NOTIFICATIONS);
}

function projectIdForNotification(n: UserNotificationRow): string | null {
  if (n.project_id) return n.project_id;
  const payload = n.payload as Record<string, unknown> | null;
  const fromPayload = payload?.project_id;
  return typeof fromPayload === "string" ? fromPayload : null;
}

function notificationInScope(
  n: UserNotificationRow,
  scopeOrganizationId: string | null | undefined,
  scopeProjectId: string | null | undefined
): boolean {
  if (!scopeOrganizationId) return true;
  if (n.organization_id !== scopeOrganizationId) return false;
  if (!scopeProjectId) return true;
  if (!n.project_id) return true;
  return n.project_id === scopeProjectId;
}

function hrefForWorkspaceNotification(n: UserNotificationRow): string {
  const q = new URLSearchParams();
  if (n.organization_id) q.set("org", n.organization_id);
  const projectId = projectIdForNotification(n);
  if (projectId) q.set("project", projectId);

  const payload = (n.payload ?? {}) as Record<string, unknown>;
  const eventId =
    typeof payload.event_id === "string" ? payload.event_id : "";

  if (
    n.kind === "virtual_table" ||
    n.kind === "virtual_import" ||
    n.kind === "virtual_column" ||
    n.kind === "virtual_row" ||
    eventId.startsWith("vtable.") ||
    eventId.startsWith("vrow.")
  ) {
    q.set("view", viewToParam("Tabel"));
  } else if (
    n.kind === "workspace_member" ||
    n.kind === "workspace_project"
  ) {
    q.set("view", viewToParam("Tabel"));
  } else if (n.kind === "chat_mention") {
    q.set("view", viewToParam("Chat"));
  } else {
    q.set("view", viewToParam("Tabel"));
  }

  return `/?${q.toString()}`;
}

export function NotificationsBell({
  userId,
  notifications,
  scopeOrganizationId = null,
  scopeProjectId = null,
  onNavigate,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<UserNotificationRow[]>(notifications);

  useEffect(() => {
    setItems(notifications);
  }, [notifications]);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    void flushDueCellNotificationsAction();
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;

    const { data, error } = await supabase
      .schema("core_pm")
      .from("user_notifications")
      .select(
        "id, user_id, organization_id, project_id, kind, severity, title, body, payload, read_at, created_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_NOTIFICATIONS);

    if (!error && data) {
      setItems(data as UserNotificationRow[]);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;

    void fetchNotifications();

    const onFocus = () => {
      void fetchNotifications();
    };
    window.addEventListener("focus", onFocus);

    const pollId = window.setInterval(() => {
      void fetchNotifications();
    }, 4000);

    const channel = supabase
      .channel(`user-notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "core_pm",
          table: "user_notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = rowFromRealtimeRecord(
            payload.new as Record<string, unknown>
          );
          if (row) setItems((prev) => mergeNotification(prev, row));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "core_pm",
          table: "user_notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = rowFromRealtimeRecord(
            payload.new as Record<string, unknown>
          );
          if (row) setItems((prev) => mergeNotification(prev, row));
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") return;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          void fetchNotifications();
        }
      });

    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [userId, fetchNotifications]);

  useEffect(() => {
    if (open) void fetchNotifications();
  }, [open, fetchNotifications]);

  const scopedItems = useMemo(
    () =>
      items.filter((n) =>
        notificationInScope(n, scopeOrganizationId, scopeProjectId)
      ),
    [items, scopeOrganizationId, scopeProjectId]
  );

  const unread = useMemo(
    () => scopedItems.filter((n) => n.read_at == null),
    [scopedItems]
  );

  const sorted = useMemo(
    () =>
      [...scopedItems].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [scopedItems]
  );

  const hrefForNotification = useCallback(
    (n: UserNotificationRow) => hrefForWorkspaceNotification(n),
    []
  );

  const markOneRead = (notificationId: string) => {
    const fd = new FormData();
    fd.set("notification_id", notificationId);
    startTransition(async () => {
      const res = await markNotificationReadAction(fd);
      if (!res.error) {
        setItems((prev) =>
          prev.map((n) =>
            n.id === notificationId
              ? { ...n, read_at: new Date().toISOString() }
              : n
          )
        );
      }
    });
  };

  const markAllRead = () => {
    startTransition(async () => {
      const res = await markAllNotificationsReadAction();
      if (!res.error) {
        const now = new Date().toISOString();
        setItems((prev) =>
          prev.map((n) => ({ ...n, read_at: n.read_at ?? now }))
        );
      }
    });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void fetchNotifications();
  };

  const unreadBadge =
    unread.length > 0 ? (
      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-bold text-white">
        {unread.length > 9 ? "9+" : unread.length}
      </span>
    ) : null;

  const panelContent = (
    <>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold text-foreground">
          Aktivitas
          {unread.length > 0 ? (
            <span className="ml-1 font-normal text-amber-700 dark:text-amber-500">
              ({unread.length} baru)
            </span>
          ) : null}
        </span>
        {unread.length > 0 ? (
          <button
            type="button"
            disabled={pending}
            onClick={markAllRead}
            className="text-[10px] text-primary hover:underline disabled:opacity-50"
          >
            Tandai semua dibaca
          </button>
        ) : null}
      </div>
      <ul className="max-h-72 overflow-y-auto text-xs">
        {sorted.length === 0 ? (
          <li className="px-3 py-4 text-muted-foreground">
            Tidak ada aktivitas di scope ini.
          </li>
        ) : (
          sorted.map((n) => {
            const isUnread = n.read_at == null;
            const isLegacyChat = n.kind === "chat_mention";
            return (
              <li
                key={n.id}
                className={cn(
                  "border-b border-border/60 px-3 py-2 last:border-0",
                  isUnread && "bg-amber-50/50 dark:bg-amber-950/20"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={hrefForNotification(n)}
                    className="min-w-0 flex-1 hover:underline"
                    onClick={(e) => {
                      if (onNavigate) {
                        e.preventDefault();
                        onNavigate(n);
                      }
                      if (isUnread) markOneRead(n.id);
                      setOpen(false);
                    }}
                  >
                    <p className="font-medium text-foreground">
                      {n.title}
                      {isLegacyChat ? (
                        <span className="ml-1 font-normal text-muted-foreground">
                          · obrolan
                        </span>
                      ) : null}
                    </p>
                    {n.body ? (
                      <p className="mt-0.5 line-clamp-3 text-muted-foreground">
                        {n.body}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatShortDate(n.created_at)}
                      {n.severity === "warning" ? " · peringatan" : null}
                    </p>
                  </Link>
                  {isUnread ? (
                    <button
                      type="button"
                      disabled={pending}
                      className="shrink-0 text-[10px] text-primary hover:underline disabled:opacity-50"
                      onClick={(e) => {
                        e.preventDefault();
                        markOneRead(n.id);
                      }}
                    >
                      Dibaca
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
      <p className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => setPrefsOpen(true)}
        >
          Atur notifikasi
        </button>
        {" · "}
        Default: ruang kerja/anggota & import.
      </p>
      <NotificationPreferencesPanel
        open={prefsOpen}
        onOpenChange={setPrefsOpen}
      />
    </>
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          compact ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="relative size-11 shrink-0"
              aria-label="Notifikasi aktivitas"
            >
              <Bell className="size-5" aria-hidden />
              {unreadBadge}
            </Button>
          ) : (
            <button
              type="button"
              aria-label="Notifikasi aktivitas"
              className="relative shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-950 transition-colors hover:bg-amber-100"
            >
              Aktivitas
              {unreadBadge}
            </button>
          )
        }
      />
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={4}
        className={cn(
          "gap-0 p-0",
          compact
            ? "w-[min(18rem,calc(100vw-2rem))]"
            : "w-[min(22rem,calc(100vw-2rem))]"
        )}
      >
        {panelContent}
      </PopoverContent>
    </Popover>
  );
}
