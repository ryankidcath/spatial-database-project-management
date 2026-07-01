"use client";

import { useEffect } from "react";
import {
  isRetryablePushSubscriptionFailure,
  registerWebPushSubscription,
} from "@/lib/pwa-push-subscription";

type Props = {
  userId: string | null;
};

const RETRY_DELAYS_MS = [0, 3_000, 10_000, 30_000];

/** Minta izin push + simpan subscription; retry jika gagal sementara (SW/VAPID belum siap). */
export function PwaPushSubscription({ userId }: Props) {
  useEffect(() => {
    if (!userId) return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("Notification" in window) || !("PushManager" in window)) return;

    let cancelled = false;
    let retryIndex = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const clearRetryTimer = () => {
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
    };

    const scheduleRetry = () => {
      if (cancelled || retryIndex >= RETRY_DELAYS_MS.length - 1) return;
      retryIndex += 1;
      clearRetryTimer();
      retryTimer = setTimeout(() => {
        void runSubscribe();
      }, RETRY_DELAYS_MS[retryIndex]);
    };

    const runSubscribe = async () => {
      if (cancelled) return;

      const result = await registerWebPushSubscription();
      if (cancelled) return;

      if (result.ok) {
        retryIndex = 0;
        clearRetryTimer();
        return;
      }

      if (!isRetryablePushSubscriptionFailure(result.reason)) return;
      scheduleRetry();
    };

    const onGesture = () => {
      void runSubscribe();
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Notification.permission !== "granted") return;
      retryIndex = 0;
      void runSubscribe();
    };

    if (Notification.permission === "granted") {
      void runSubscribe();
    } else if (Notification.permission !== "denied") {
      window.addEventListener("pointerdown", onGesture, { passive: true });
    }

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearRetryTimer();
      window.removeEventListener("pointerdown", onGesture);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  return null;
}
