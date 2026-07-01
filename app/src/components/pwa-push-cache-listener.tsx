"use client";

import { useEffect } from "react";
import { initPushCacheClient } from "@/lib/push-cache-client";

/** PR-H: terapkan cache dari push SW + refresh UI saat app foreground. */
export function PwaPushCacheListener() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    return initPushCacheClient();
  }, []);

  return null;
}
