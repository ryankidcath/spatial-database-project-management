"use client";

import { useEffect } from "react";
import { unlockNotificationSound } from "@/lib/notification-sound";

/** Unlock AudioContext pada interaksi pertama (kebijakan autoplay browser). */
export function NotificationSoundUnlock() {
  useEffect(() => {
    const unlock = () => {
      void unlockNotificationSound();
    };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return null;
}
