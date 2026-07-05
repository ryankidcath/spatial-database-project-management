"use client";

import { Eye, EyeOff, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPATIAL_IMPORT_PREVIEW_COLOR } from "@/lib/workspace-spatial-layer-colors";
import type { SpatialLayerRow } from "./workspace-spatial-toolbar";

type Props = {
  layerRows: SpatialLayerRow[];
  importPreviewCount: number;
  importPreviewVisible?: boolean;
  onImportPreviewVisibilityChange?: (visible: boolean) => void;
  onTableLayerVisibilityChange: (tableId: string, visible: boolean) => void;
  isBelowMd?: boolean;
  emptyMessage?: string;
  /** `rail` = daftar utama di panel kiri; `compact` = popover toolbar. */
  variant?: "rail" | "compact";
};

export function WorkspaceSpatialLayerList({
  layerRows,
  importPreviewCount,
  importPreviewVisible = true,
  onImportPreviewVisibilityChange,
  onTableLayerVisibilityChange,
  isBelowMd = false,
  emptyMessage = "Belum ada lapisan. Impor geometri ke tabel virtual.",
  variant = "compact",
}: Props) {
  const isRail = variant === "rail";
  const touchRow = isBelowMd && "min-h-11 touch-manipulation";

  if (layerRows.length === 0 && importPreviewCount === 0) {
    return (
      <p className="px-2 py-4 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  const renderVisibilityToggle = (
    visible: boolean,
    onChange: (next: boolean) => void,
    label: string
  ) => {
    if (isRail) {
      return (
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            touchRow && "min-h-9 min-w-9"
          )}
          onClick={(e) => {
            e.preventDefault();
            onChange(!visible);
          }}
          aria-label={visible ? `Sembunyikan ${label}` : `Tampilkan ${label}`}
          aria-pressed={visible}
          data-testid={`spatial-layer-visibility-${label}`}
        >
          {visible ? (
            <Eye className="size-4" aria-hidden />
          ) : (
            <EyeOff className="size-4 opacity-60" aria-hidden />
          )}
        </button>
      );
    }

    return (
      <input
        type="checkbox"
        className="size-4 shrink-0 rounded border-border"
        checked={visible}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={visible ? `Sembunyikan ${label}` : `Tampilkan ${label}`}
      />
    );
  };

  return (
    <ul className={cn(isRail ? "min-w-0 space-y-0.5" : "space-y-1")}>
      {layerRows.map((row) => (
        <li key={row.tableId} className="min-w-0">
          <div
            className={cn(
              "flex items-center gap-2 text-sm transition-colors",
              isRail
                ? cn(
                    "rounded-lg px-3 py-2.5",
                    row.visible ? "bg-primary/10" : "hover:bg-muted/60"
                  )
                : cn("rounded-md px-2 py-2 hover:bg-muted/60", touchRow)
            )}
            data-testid="spatial-layer-rail-item"
            data-layer-visible={row.visible ? "true" : "false"}
          >
            {renderVisibilityToggle(row.visible, (next) =>
              onTableLayerVisibilityChange(row.tableId, next), row.displayName)}
            <span
              className={cn(
                "shrink-0 rounded-sm",
                isRail ? "size-3" : "size-2.5"
              )}
              style={{ background: row.color }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {row.displayName}
            </span>
            <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
              {row.featureCount}
            </span>
          </div>
        </li>
      ))}
      {importPreviewCount > 0 ? (
        <li className="min-w-0">
          <div
            className={cn(
              "flex items-center gap-2 text-sm text-muted-foreground transition-colors",
              isRail
                ? cn(
                    "rounded-lg px-3 py-2.5",
                    importPreviewVisible
                      ? "bg-teal-500/10 text-foreground"
                      : "hover:bg-muted/60"
                  )
                : cn("rounded-md px-2 py-2", touchRow)
            )}
            data-testid="spatial-layer-import-preview"
          >
            {onImportPreviewVisibilityChange
              ? renderVisibilityToggle(
                  importPreviewVisible,
                  onImportPreviewVisibilityChange,
                  "Pratinjau impor"
                )
              : null}
            <MapPin
              className="size-3.5 shrink-0 text-teal-600 dark:text-teal-400"
              aria-hidden
            />
            <span
              className={cn(
                "shrink-0 rounded-sm border border-teal-700",
                isRail ? "size-3" : "size-2.5"
              )}
              style={{
                background: SPATIAL_IMPORT_PREVIEW_COLOR,
                borderStyle: "dashed",
              }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate font-medium">
              Pratinjau impor
            </span>
            <span className="shrink-0 tabular-nums text-xs">
              {importPreviewCount}
            </span>
          </div>
        </li>
      ) : null}
    </ul>
  );
}
