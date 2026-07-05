"use client";

import type { Map as LeafletMap } from "leaflet";
import { cn } from "@/lib/utils";
import {
  WORKSPACE_BASEMAPS,
  type WorkspaceBasemapId,
} from "@/lib/workspace-map-basemaps";

type Props = {
  enabled: boolean;
  primaryBasemapId: WorkspaceBasemapId;
  compareBasemapId: WorkspaceBasemapId;
  swipePercent: number;
  onCompareBasemapChange: (id: WorkspaceBasemapId) => void;
  onSwipePercentChange: (percent: number) => void;
  onClose: () => void;
  map?: LeafletMap | null;
  className?: string;
};

export function WorkspaceMapBasemapSwipeControl({
  enabled,
  primaryBasemapId,
  compareBasemapId,
  swipePercent,
  onCompareBasemapChange,
  onSwipePercentChange,
  onClose,
  map,
  className,
}: Props) {
  if (!enabled) return null;

  const primary =
    WORKSPACE_BASEMAPS.find((b) => b.id === primaryBasemapId)?.label ??
    primaryBasemapId;
  const compare =
    WORKSPACE_BASEMAPS.find((b) => b.id === compareBasemapId)?.label ??
    compareBasemapId;

  const pauseMapDrag = () => {
    map?.dragging.disable();
  };
  const resumeMapDrag = () => {
    map?.dragging.enable();
  };

  return (
    <div
      className={cn(
        "pointer-events-auto absolute left-1/2 top-2 isolate z-[1000] w-[min(22rem,calc(100%-1rem))] -translate-x-1/2 rounded-lg border border-border bg-background/95 p-3 shadow-md backdrop-blur-sm",
        className
      )}
      data-testid="workspace-basemap-swipe"
      onPointerDownCapture={(e) => {
        e.stopPropagation();
        pauseMapDrag();
      }}
      onPointerUpCapture={() => resumeMapDrag()}
      onPointerCancelCapture={() => resumeMapDrag()}
      onLostPointerCapture={() => resumeMapDrag()}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">
          Bandingkan basemap
        </p>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          Tutup
        </button>
      </div>
      <div className="mb-2 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{primary}</span>
        <span>|</span>
        <select
          value={compareBasemapId}
          onChange={(e) =>
            onCompareBasemapChange(e.target.value as WorkspaceBasemapId)
          }
          className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-1 text-[10px] text-foreground"
        >
          {WORKSPACE_BASEMAPS.filter((b) => b.id !== primaryBasemapId).map(
            (b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            )
          )}
        </select>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={swipePercent}
        onChange={(e) => onSwipePercentChange(Number(e.target.value))}
        onPointerDown={(e) => e.stopPropagation()}
        className="h-2 w-full cursor-ew-resize accent-primary"
        aria-label="Posisi swipe basemap"
      />
      <p className="mt-1 text-center text-[10px] text-muted-foreground">
        Geser ke kiri = lebih banyak {primary}. Geser ke kanan = lebih banyak{" "}
        {compare}. Garis putus-putus di peta = batas pemisah.
      </p>
    </div>
  );
}
