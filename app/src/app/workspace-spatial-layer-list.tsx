"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  MapPin,
  Palette,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SPATIAL_IMPORT_PREVIEW_COLOR } from "@/lib/workspace-spatial-layer-colors";
import type {
  LayerDashStyle,
  SpatialLayerSymbolStyle,
} from "@/lib/workspace-spatial-layer-style-preference";
import type { SpatialLayerGroup } from "@/lib/workspace-spatial-layer-layout-preference";
import type { SpatialLayerRow } from "./workspace-spatial-toolbar";

type Props = {
  layerRows: SpatialLayerRow[];
  groups?: SpatialLayerGroup[];
  importPreviewCount: number;
  importPreviewVisible?: boolean;
  onImportPreviewVisibilityChange?: (visible: boolean) => void;
  onTableLayerVisibilityChange: (tableId: string, visible: boolean) => void;
  onTableLayerOpacityChange?: (tableId: string, opacity: number) => void;
  onTableLayerStyleChange?: (
    tableId: string,
    style: SpatialLayerSymbolStyle
  ) => void;
  onTableGroupChange?: (tableId: string, groupId: string | null) => void;
  onMoveLayer?: (tableId: string, direction: "up" | "down") => void;
  onZoomToLayer?: (tableId: string) => void;
  isBelowMd?: boolean;
  emptyMessage?: string;
  variant?: "rail" | "compact";
};

function LayerStyleEditor({
  tableId,
  style,
  defaultColor,
  onChange,
}: {
  tableId: string;
  style?: SpatialLayerSymbolStyle;
  defaultColor: string;
  onChange: (tableId: string, style: SpatialLayerSymbolStyle) => void;
}) {
  const fill = style?.fillColor ?? defaultColor;
  const stroke = style?.strokeColor ?? defaultColor;
  const width = style?.strokeWidth ?? 2;
  const dash = style?.dash ?? "solid";

  return (
    <div className="grid gap-2 border-t border-border/60 px-3 pb-2 pt-1.5 text-[11px]">
      <div className="flex items-center gap-2">
        <label className="w-12 shrink-0 text-muted-foreground">Isi</label>
        <input
          type="color"
          value={fill.slice(0, 7)}
          onChange={(e) =>
            onChange(tableId, { ...style, fillColor: e.target.value })
          }
          className="size-7 cursor-pointer rounded border border-border bg-transparent p-0"
          aria-label="Warna isi"
        />
        <label className="w-12 shrink-0 text-muted-foreground">Garis</label>
        <input
          type="color"
          value={stroke.slice(0, 7)}
          onChange={(e) =>
            onChange(tableId, { ...style, strokeColor: e.target.value })
          }
          className="size-7 cursor-pointer rounded border border-border bg-transparent p-0"
          aria-label="Warna garis"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="w-12 shrink-0 text-muted-foreground">Tebal</label>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={width}
          onChange={(e) =>
            onChange(tableId, {
              ...style,
              strokeWidth: Number(e.target.value),
            })
          }
          className="min-w-0 flex-1 accent-primary"
        />
        <select
          value={dash}
          onChange={(e) =>
            onChange(tableId, {
              ...style,
              dash: e.target.value as LayerDashStyle,
            })
          }
          className="rounded border border-border bg-background px-1.5 py-1 text-[10px]"
          aria-label="Gaya garis"
        >
          <option value="solid">Solid</option>
          <option value="dashed">Putus</option>
          <option value="dotted">Titik</option>
        </select>
      </div>
    </div>
  );
}

function LayerRowItem({
  row,
  groups,
  isRail,
  touchRow,
  styleOpen,
  onToggleStyle,
  onTableLayerVisibilityChange,
  onTableLayerOpacityChange,
  onTableLayerStyleChange,
  onTableGroupChange,
  onMoveLayer,
  onZoomToLayer,
}: {
  row: SpatialLayerRow;
  groups: SpatialLayerGroup[];
  isRail: boolean;
  touchRow?: string;
  styleOpen: boolean;
  onToggleStyle: () => void;
  onTableLayerVisibilityChange: (tableId: string, visible: boolean) => void;
  onTableLayerOpacityChange?: (tableId: string, opacity: number) => void;
  onTableLayerStyleChange?: (
    tableId: string,
    style: SpatialLayerSymbolStyle
  ) => void;
  onTableGroupChange?: (tableId: string, groupId: string | null) => void;
  onMoveLayer?: (tableId: string, direction: "up" | "down") => void;
  onZoomToLayer?: (tableId: string) => void;
}) {
  const swatchColor = row.symbolStyle?.fillColor ?? row.color;

  return (
    <li key={row.tableId} className="min-w-0">
      <div
        className={cn(
          "flex items-center gap-1.5 text-sm transition-colors",
          isRail
            ? cn(
                "rounded-lg px-2 py-2",
                row.visible ? "bg-primary/10" : "hover:bg-muted/60"
              )
            : cn("rounded-md px-2 py-2 hover:bg-muted/60", touchRow)
        )}
        data-testid="spatial-layer-rail-item"
      >
        {isRail && onMoveLayer ? (
          <div className="flex shrink-0 flex-col">
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onMoveLayer(row.tableId, "up")}
              aria-label={`Naikkan ${row.displayName}`}
            >
              <ChevronUp className="size-3.5" />
            </button>
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onMoveLayer(row.tableId, "down")}
              aria-label={`Turunkan ${row.displayName}`}
            >
              <ChevronDown className="size-3.5" />
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
            touchRow && "min-h-9 min-w-9"
          )}
          onClick={() =>
            onTableLayerVisibilityChange(row.tableId, !row.visible)
          }
          aria-label={
            row.visible ? `Sembunyikan ${row.displayName}` : `Tampilkan ${row.displayName}`
          }
        >
          {row.visible ? (
            <Eye className="size-4" />
          ) : (
            <EyeOff className="size-4 opacity-60" />
          )}
        </button>

        <span
          className={cn("shrink-0 rounded-sm", isRail ? "size-3" : "size-2.5")}
          style={{
            background: swatchColor,
            opacity: row.opacity,
            border:
              row.symbolStyle?.dash && row.symbolStyle.dash !== "solid"
                ? "1px dashed #64748b"
                : undefined,
          }}
          aria-hidden
        />

        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {row.displayName}
          {row.filterActive && row.totalFeatureCount != null ? (
            <span className="ml-1 text-[10px] font-normal text-sky-700 dark:text-sky-300">
              {row.featureCount}/{row.totalFeatureCount}
            </span>
          ) : null}
        </span>

        {isRail && onTableLayerStyleChange ? (
          <button
            type="button"
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onToggleStyle}
            aria-label={`Simbol ${row.displayName}`}
          >
            <Palette className="size-3.5" />
          </button>
        ) : null}

        {onZoomToLayer && row.featureCount > 0 ? (
          <button
            type="button"
            className="inline-flex shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => onZoomToLayer(row.tableId)}
            aria-label={`Zoom ke ${row.displayName}`}
          >
            <Target className="size-3.5" />
          </button>
        ) : null}

        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
          {row.featureCount}
        </span>
      </div>

      {isRail && onTableGroupChange && groups.length > 0 ? (
        <div className="flex items-center gap-2 px-3 pb-1">
          <span className="text-[10px] text-muted-foreground">Grup</span>
          <select
            value={row.groupId ?? ""}
            onChange={(e) =>
              onTableGroupChange(
                row.tableId,
                e.target.value.length > 0 ? e.target.value : null
              )
            }
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-[10px]"
          >
            <option value="">Tanpa grup</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {isRail && styleOpen && onTableLayerStyleChange ? (
        <LayerStyleEditor
          tableId={row.tableId}
          style={row.symbolStyle}
          defaultColor={row.color}
          onChange={onTableLayerStyleChange}
        />
      ) : null}

      {isRail && onTableLayerOpacityChange && row.visible ? (
        <div className="flex items-center gap-2 px-3 pb-2 pt-0.5">
          <span className="w-14 shrink-0 text-[10px] text-muted-foreground">
            Opacity
          </span>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={Math.round(row.opacity * 100)}
            onChange={(e) =>
              onTableLayerOpacityChange(
                row.tableId,
                Number(e.target.value) / 100
              )
            }
            className="h-1.5 min-w-0 flex-1 accent-primary"
          />
        </div>
      ) : null}
    </li>
  );
}

export function WorkspaceSpatialLayerList({
  layerRows,
  groups = [],
  importPreviewCount,
  importPreviewVisible = true,
  onImportPreviewVisibilityChange,
  onTableLayerVisibilityChange,
  onTableLayerOpacityChange,
  onTableLayerStyleChange,
  onTableGroupChange,
  onMoveLayer,
  onZoomToLayer,
  isBelowMd = false,
  emptyMessage = "Belum ada lapisan. Impor geometri ke tabel virtual.",
  variant = "compact",
}: Props) {
  const isRail = variant === "rail";
  const touchRow = isBelowMd ? "min-h-11 touch-manipulation" : undefined;
  const [styleOpenFor, setStyleOpenFor] = useState<string | null>(null);

  if (layerRows.length === 0 && importPreviewCount === 0) {
    return (
      <p className="px-2 py-4 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className={cn(isRail ? "min-w-0 space-y-0.5" : "space-y-1")}>
      {layerRows.map((row) => (
        <LayerRowItem
          key={row.tableId}
          row={row}
          groups={groups}
          isRail={isRail}
          touchRow={touchRow}
          styleOpen={styleOpenFor === row.tableId}
          onToggleStyle={() =>
            setStyleOpenFor((prev) =>
              prev === row.tableId ? null : row.tableId
            )
          }
          onTableLayerVisibilityChange={onTableLayerVisibilityChange}
          onTableLayerOpacityChange={onTableLayerOpacityChange}
          onTableLayerStyleChange={onTableLayerStyleChange}
          onTableGroupChange={onTableGroupChange}
          onMoveLayer={onMoveLayer}
          onZoomToLayer={onZoomToLayer}
        />
      ))}
      {importPreviewCount > 0 ? (
        <li className="min-w-0">
          <div
            className={cn(
              "flex items-center gap-2 text-sm text-muted-foreground",
              isRail ? "rounded-lg px-3 py-2.5" : cn("rounded-md px-2 py-2", touchRow)
            )}
          >
            {onImportPreviewVisibilityChange ? (
              <button
                type="button"
                className="rounded-md p-1 hover:bg-muted"
                onClick={() =>
                  onImportPreviewVisibilityChange(!importPreviewVisible)
                }
              >
                {importPreviewVisible ? (
                  <Eye className="size-4" />
                ) : (
                  <EyeOff className="size-4 opacity-60" />
                )}
              </button>
            ) : null}
            <MapPin className="size-3.5 shrink-0 text-teal-600" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium">
              Pratinjau impor
            </span>
            <span className="tabular-nums text-xs">{importPreviewCount}</span>
          </div>
        </li>
      ) : null}
    </ul>
  );
}
