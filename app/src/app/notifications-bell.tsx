"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./user-notifications-actions";
import type { UserNotificationRow } from "./user-notification-types";
import { formatShortDate } from "./schedule-utils";
import { viewToParam } from "./workspace-url";

type Props = {
  notifications: UserNotificationRow[];
};

export function NotificationsBell({ notifications }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const unread = useMemo(
    () => notifications.filter((n) => n.read_at == null),
    [notifications]
  );
  const sorted = useMemo(
    () =>
      [...notifications].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      ),
    [notifications]
  );

  const mapHref = useMemo(() => {
    const q = new URLSearchParams(searchParams.toString());
    q.set("view", viewToParam("Map"));
    return `/?${q.toString()}`;
  }, [searchParams]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Notifikasi"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-950 hover:bg-amber-100"
      >
        Notifikasi
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
          <div className="absolute right-0 z-50 mt-1 w-[min(22rem,calc(100vw-2rem)))] rounded-lg border border-slate-200 bg-white py-2 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 pb-2">
              <span className="text-xs font-semibold text-slate-700">
                Kotak masuk
              </span>
              {unread.length > 0 ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      await markAllNotificationsReadAction();
                      router.refresh();
                    });
                  }}
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
                  return (
                    <li
                      key={n.id}
                      className={`border-b border-slate-50 px-3 py-2 last:border-0 ${
                        isUnread ? "bg-amber-50/50" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">{n.title}</p>
                          {n.body ? (
                            <p className="mt-0.5 text-slate-600">{n.body}</p>
                          ) : null}
                          <p className="mt-1 text-[10px] text-slate-400">
                            {formatShortDate(n.created_at)}
                            {n.severity === "warning" ? " · peringatan" : null}
                          </p>
                        </div>
                        {isUnread ? (
                          <button
                            type="button"
                            disabled={pending}
                            className="shrink-0 text-[10px] text-blue-600 hover:underline disabled:opacity-50"
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("notification_id", n.id);
                              startTransition(async () => {
                                const res = await markNotificationReadAction(fd);
                                if (!res.error) router.refresh();
                              });
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
            <div className="border-t border-slate-100 px-3 pt-2">
              <Link
                href={mapHref}
                className="text-[11px] font-medium text-blue-700 hover:underline"
                onClick={() => setOpen(false)}
              >
                Buka tab Map →
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
