"use client";

import { useEffect } from "react";
import { unlockNotificationSound } from "@/lib/notification-sound";

/** Keep AudioContext siap (autoplay policy — resume saat interaksi / tab visible). */
export function NotificationSoundUnlock() {
  useEffect(() => {
    const unlock = () => {
      void unlockNotificationSound();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") unlock();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", onVisible);
    unlock();
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
