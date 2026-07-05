"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  MapIdentifyHit,
  MapMeasureResult,
  WorkspaceMapToolMode,
} from "@/lib/workspace-map-tool-types";
import {
  formatMeasureResult,
} from "@/lib/workspace-map-measure";
import type { MeasureDraftState } from "./workspace-map-tool-controller";

type Props = {
  toolMode: WorkspaceMapToolMode;
  measureDraft: MeasureDraftState;
  measureFinished: MapMeasureResult | null;
  identifyHits: MapIdentifyHit[];
  identifyPoint: { lat: number; lng: number } | null;
  onFinishMeasure: () => void;
  onClearMeasure: () => void;
  onClearIdentify: () => void;
  onIdentifyHitSelect?: (hit: MapIdentifyHit) => void;
  onToolModeChange: (mode: WorkspaceMapToolMode) => void;
  className?: string;
};

export function WorkspaceMapToolHud({
  toolMode,
  measureDraft,
  measureFinished,
  identifyHits,
  identifyPoint,
  onFinishMeasure,
  onClearMeasure,
  onClearIdentify,
  onIdentifyHitSelect,
  onToolModeChange,
  className,
}: Props) {
  const isMeasure =
    toolMode === "measure-line" || toolMode === "measure-area";
  const showMeasureHud = isMeasure && measureDraft.pointCount > 0;
  const showIdentifyHud =
    toolMode === "identify" && identifyHits.length > 0 && identifyPoint;

  if (!showMeasureHud && !showIdentifyHud && !measureFinished) return null;

  return (
    <div
      className={cn(
        "absolute left-1/2 top-2 z-[450] w-[min(22rem,calc(100%-1rem))] -translate-x-1/2 rounded-lg border border-border bg-background/95 shadow-md backdrop-blur-sm",
        className
      )}
      data-testid="workspace-map-tool-hud"
    >
      {showMeasureHud || measureFinished ? (
        <div className="space-y-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-foreground">
                {toolMode === "measure-area" ? "Ukur luas" : "Ukur jarak"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {measureDraft.pointCount} titik
                {toolMode === "measure-area"
                  ? " · min. 3 untuk luas"
                  : " · min. 2 untuk jarak"}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                onClearMeasure();
                onToolModeChange("navigate");
              }}
              aria-label="Tutup alat ukur"
            >
              <X className="size-4" />
            </button>
          </div>
          {(measureFinished ?? measureDraft.liveResult) ? (
            <p className="font-mono text-sm font-medium text-primary">
              {formatMeasureResult(
                measureFinished ?? measureDraft.liveResult!
              )}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Klik peta untuk menambah titik.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8"
              disabled={
                toolMode === "measure-line"
                  ? measureDraft.pointCount < 2
                  : measureDraft.pointCount < 3
              }
              onClick={onFinishMeasure}
            >
              Selesai
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={onClearMeasure}
            >
              Hapus titik
            </Button>
          </div>
        </div>
      ) : null}

      {showIdentifyHud ? (
        <div className="max-h-[min(40vh,16rem)] overflow-y-auto p-2">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <p className="text-xs font-semibold text-foreground">
              Identify · {identifyHits.length} fitur
            </p>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              onClick={onClearIdentify}
              aria-label="Tutup identify"
            >
              <X className="size-4" />
            </button>
          </div>
          <ul className="space-y-1">
            {identifyHits.map((hit) => (
              <li key={hit.footprintId}>
                <button
                  type="button"
                  className="flex w-full flex-col rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => onIdentifyHitSelect?.(hit)}
                >
                  <span className="font-medium text-foreground">{hit.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {hit.layerKind === "import_preview"
                      ? "Pratinjau impor"
                      : hit.layerKind === "virtual_table"
                        ? "Tabel virtual"
                        : hit.layerKind}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
