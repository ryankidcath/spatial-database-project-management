"use client";

import { useEffect } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  playChatNotificationSound,
  playWorkspaceNotificationSound,
} from "@/lib/notification-sound";

type Props = {
  userId: string | null;
};

/** Realtime INSERT → bunyi notifikasi (chat & workspace). */
export function NotificationSoundListener({ userId }: Props) {
  useEffect(() => {
    if (!userId) return;

    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`notification-sounds:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "core_pm",
          table: "chat_messages",
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const authorId = String(row.author_id ?? "");
          if (authorId === userId) return;
          const messageId = String(row.id ?? "");
          if (!messageId) return;
          playChatNotificationSound(messageId);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "core_pm",
          table: "user_notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const notificationId = String(row.id ?? "");
          if (!notificationId) return;
          playWorkspaceNotificationSound(notificationId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return null;
}
