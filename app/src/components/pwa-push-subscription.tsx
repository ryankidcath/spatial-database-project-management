"use client";

import { useEffect } from "react";
import { registerWebPushSubscription } from "@/lib/pwa-push-subscription";

type Props = {
  userId: string | null;
};

/** Minta izin push + simpan subscription setelah gestur user (production). */
export function PwaPushSubscription({ userId }: Props) {
  useEffect(() => {
    if (!userId) return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("Notification" in window) || !("PushManager" in window)) return;

    let cancelled = false;

    const subscribe = async () => {
      if (cancelled) return;
      await registerWebPushSubscription();
    };

    if (Notification.permission === "granted") {
      void subscribe();
      return () => {
        cancelled = true;
      };
    }

    if (Notification.permission === "denied") {
      return;
    }

    const onGesture = () => {
      void subscribe();
    };

    window.addEventListener("pointerdown", onGesture, { once: true, passive: true });
    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", onGesture);
    };
  }, [userId]);

  return null;
}
