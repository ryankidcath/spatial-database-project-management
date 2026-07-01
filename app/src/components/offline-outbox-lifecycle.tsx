"use client";

import { useEffect } from "react";
import { drainOfflineOutbox } from "@/lib/client-offline-outbox-drain";

/** PR-I: drain outbox saat online / Background Sync dari service worker. */
export function OfflineOutboxLifecycle() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    const runDrain = () => {
      void drainOfflineOutbox();
    };

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "DRAIN_OFFLINE_OUTBOX") {
        runDrain();
      }
    };

    window.addEventListener("online", runDrain);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    runDrain();

    return () => {
      window.removeEventListener("online", runDrain);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, []);

  return null;
}
