"use client";

import { useEffect } from "react";
import { flushDurableCachesOnBackground } from "@/lib/client-durable-cache-flush";

/** F1 — flush cache durable saat tab/app disembunyikan. */
export function DurableCacheLifecycle() {
  useEffect(() => {
    const onBackground = () => {
      if (document.visibilityState !== "hidden") return;
      void flushDurableCachesOnBackground();
    };

    const onPageHide = () => {
      void flushDurableCachesOnBackground();
    };

    document.addEventListener("visibilitychange", onBackground);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onBackground);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return null;
}
