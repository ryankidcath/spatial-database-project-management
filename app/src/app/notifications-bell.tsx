"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./user-notifications-actions";
import type { UserNotificationRow } from "./user-notification-types";
import { formatShortDate } from "./schedule-utils";
import { viewToParam } from "./workspace-url";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsBelowMd } from "@/lib/use-media-query";

const MAX_NOTIFICATIONS = 50;

type Props = {
  userId: string | null;
  notifications: UserNotificationRow[];
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

export function NotificationsBell({
  userId,
  notifications,
  onNavigate,
  compact = false,
}: Props) {
  const isBelowMd = useIsBelowMd();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<UserNotificationRow[]>(notifications);

  useEffect(() => {
    setItems(notifications);
  }, [notifications]);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
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

  const unread = useMemo(
    () => items.filter((n) => n.read_at == null),
    [items]
  );

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [items]
  );

  const hrefForNotification = useCallback((n: UserNotificationRow) => {
    const q = new URLSearchParams();
    if (n.organization_id) q.set("org", n.organization_id);
    const projectId = projectIdForNotification(n);
    if (projectId) q.set("project", projectId);
    if (n.kind === "chat_mention") {
      const payload = n.payload as Record<string, unknown> | null;
      if (payload?.virtual_row_id) {
        q.set("view", viewToParam("Map"));
      }
    } else {
      q.set("view", viewToParam("Map"));
    }
    return `/?${q.toString()}`;
  }, []);

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
        setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
      }
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Notifikasi"
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) void fetchNotifications();
            return next;
          });
        }}
        className={cn(
          "relative shrink-0",
          compact
            ? "inline-flex size-11 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-muted active:bg-muted/80"
            : "rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-950 hover:bg-amber-100"
        )}
      >
        {compact ? (
          <Bell className="size-5" aria-hidden />
        ) : (
          "Notifikasi"
        )}
        {unread.length > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-bold text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Tutup"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              "z-50 rounded-lg border border-slate-200 bg-white py-2 shadow-lg",
              isBelowMd
                ? "fixed inset-x-2 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] max-h-[min(55dvh,22rem)] w-auto overflow-hidden"
                : "absolute right-0 mt-1 w-[min(22rem,calc(100vw-2rem))]"
            )}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-3 pb-2">
              <span className="text-xs font-semibold text-slate-700">
                Kotak masuk
                {unread.length > 0 ? (
                  <span className="ml-1 font-normal text-amber-700">
                    ({unread.length} baru)
                  </span>
                ) : null}
              </span>
              {unread.length > 0 ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={markAllRead}
                  className="text-[10px] text-blue-600 hover:underline disabled:opacity-50"
                >
                  Tandai semua dibaca
                </button>
              ) : null}
            </div>
            <ul className="max-h-72 overflow-y-auto text-xs">
              {sorted.length === 0 ? (
                <li className="px-3 py-4 text-slate-500">Tidak ada notifikasi.</li>
              ) : (
                sorted.map((n) => {
                  const isUnread = n.read_at == null;
                  const isChat = n.kind === "chat_mention";
                  return (
                    <li
                      key={n.id}
                      className={`border-b border-slate-50 px-3 py-2 last:border-0 ${
                        isUnread ? "bg-amber-50/50" : ""
                      }`}
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
                          <p className="font-medium text-slate-900">
                            {n.title}
                            {isChat ? (
                              <span className="ml-1 font-normal text-slate-500">
                                · chat
                              </span>
                            ) : null}
                          </p>
                          {n.body ? (
                            <p className="mt-0.5 line-clamp-3 text-slate-600">
                              {n.body}
                            </p>
                          ) : null}
                          <p className="mt-1 text-[10px] text-slate-400">
                            {formatShortDate(n.created_at)}
                            {n.severity === "warning" ? " · peringatan" : null}
                          </p>
                        </Link>
                        {isUnread ? (
                          <button
                            type="button"
                            disabled={pending}
                            className="shrink-0 text-[10px] text-blue-600 hover:underline disabled:opacity-50"
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
          </div>
        </>
      ) : null}
    </div>
  );
}
