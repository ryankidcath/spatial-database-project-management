"use client";

import { useEffect } from "react";
import { registerPwaServiceWorker } from "@/lib/pwa-service-worker-client";

/** Registrasi SW asset-only (production); toast saat build baru menunggu aktivasi. */
export function PwaServiceWorker() {
  useEffect(() => {
    void registerPwaServiceWorker();
  }, []);

  return null;
}
