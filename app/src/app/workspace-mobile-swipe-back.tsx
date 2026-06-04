"use client";

import { useEffect, useRef, type ReactNode } from "react";

const MIN_SWIPE_PX = 72;
const MAX_VERTICAL_PX = 64;
const EDGE_START_PX = 48;

type Props = {
  enabled: boolean;
  onSwipeBack: () => void;
  children: ReactNode;
  className?: string;
};

/** Geser dari tepi kiri ke kanan = setara tombol ← Kembali (wizard mobile). */
export function WorkspaceMobileSwipeBack({
  enabled,
  onSwipeBack,
  children,
  className,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !enabled) return;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || t.clientX > EDGE_START_PX) return;
      touchRef.current = { x: t.clientX, y: t.clientY };
    };

    const onEnd = (e: TouchEvent) => {
      const start = touchRef.current;
      touchRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      if (dx >= MIN_SWIPE_PX && dy <= MAX_VERTICAL_PX) {
        onSwipeBack();
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", () => {
      touchRef.current = null;
    });

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", () => {
        touchRef.current = null;
      });
    };
  }, [enabled, onSwipeBack]);

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  );
}
