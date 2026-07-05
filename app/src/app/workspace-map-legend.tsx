"use client";

import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
import type { SpatialLayerRow } from "./workspace-spatial-toolbar";
import { SPATIAL_IMPORT_PREVIEW_COLOR } from "@/lib/workspace-spatial-layer-colors";

type Props = {
  layerRows: SpatialLayerRow[];
  importPreviewVisible: boolean;
  importPreviewCount: number;
  importOverlapCount?: number;
  className?: string;
  style?: CSSProperties;
};

/** G-A3 — legenda lapisan aktif di overlay peta. */
export function WorkspaceMapLegend({
  layerRows,
  importPreviewVisible,
  importPreviewCount,
  importOverlapCount = 0,
  className,
  style,
}: Props) {
  const visibleRows = layerRows.filter((r) => r.visible);
  const showPreview = importPreviewCount > 0 && importPreviewVisible;

  if (visibleRows.length === 0 && !showPreview) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-[400] max-w-[min(14rem,45vw)] rounded-md border border-border/80 bg-background/92 px-2.5 py-2 text-xs shadow-sm backdrop-blur-sm",
        className
      )}
      style={style}
      data-testid="workspace-map-legend"
      aria-label="Legenda peta"
    >
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Legenda
      </p>
      <ul className="space-y-1">
        {visibleRows.map((row) => (
          <li
            key={row.tableId}
            className="flex min-w-0 items-center gap-2 text-foreground"
          >
            <span
              className="size-2.5 shrink-0 rounded-sm border border-black/10"
              style={{ background: row.color, opacity: row.opacity }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{row.displayName}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {row.featureCount}
            </span>
          </li>
        ))}
        {showPreview ? (
          <li className="flex min-w-0 items-center gap-2 text-foreground">
            <span
              className="size-2.5 shrink-0 rounded-sm border border-dashed border-teal-700"
              style={{ background: SPATIAL_IMPORT_PREVIEW_COLOR }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">Pratinjau impor</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {importPreviewCount}
            </span>
          </li>
        ) : null}
        {importOverlapCount > 0 ? (
          <li className="flex min-w-0 items-center gap-2 text-foreground">
            <span
              className="size-2.5 shrink-0 rounded-sm border border-red-700"
              style={{ background: "#f87171" }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">Tumpang existing</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {importOverlapCount}
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
