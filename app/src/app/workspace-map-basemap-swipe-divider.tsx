"use client";

import { cn } from "@/lib/utils";

type Props = {
  enabled: boolean;
  /** 0 = garis di kanan (seluruh primary), 100 = garis di kiri (seluruh compare). */
  swipePercent: number;
  className?: string;
};

/** Garis vertikal pemisah basemap kiri/kanan — supaya efek swipe terlihat jelas. */
export function WorkspaceMapBasemapSwipeDivider({
  enabled,
  swipePercent,
  className,
}: Props) {
  if (!enabled) return null;

  const dividerLeft = 100 - swipePercent;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-y-0 z-[395] w-0 border-l-2 border-dashed border-primary shadow-[0_0_0_1px_rgba(255,255,255,0.85)]",
        className
      )}
      style={{ left: `${dividerLeft}%` }}
      aria-hidden
      data-testid="workspace-basemap-swipe-divider"
    />
  );
}
