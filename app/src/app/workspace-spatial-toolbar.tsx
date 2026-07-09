"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Bookmark,
  ChevronDown,
  Crosshair,
  Expand,
  GitBranch,
  Globe,
  Layers,
  Map as MapIcon,
  Maximize2,
  MoreHorizontal,
  Move,
  PencilLine,
  Pentagon,
  Ruler,
  Spline,
  Tag,
  Upload,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { buildReturnQueryValue } from "@/lib/safe-return-url";
import {
  WORKSPACE_BASEMAPS,
  type WorkspaceBasemapId,
} from "@/lib/workspace-map-basemaps";
import type { SpatialLayerGroup } from "@/lib/workspace-spatial-layer-layout-preference";
import type { SpatialLayerSymbolStyle } from "@/lib/workspace-spatial-layer-style-preference";
import { WorkspaceSpatialLayerList } from "./workspace-spatial-layer-list";
import type { ReactNode } from "react";
import type { VirtualTableRow } from "./virtual-table-types";
import { spatialLayerColorForTableIndex } from "@/lib/workspace-spatial-layer-colors";
import type { WorkspaceMapToolMode } from "@/lib/workspace-map-tool-types";

export type SpatialLayerRow = {
  tableId: string;
  displayName: string;
  /** Emoji ikon tabel virtual (selaras tab Data). */
  tableIcon?: string | null;
  description?: string | null;
  featureCount: number;
  totalFeatureCount?: number;
  filterActive?: boolean;
  groupId?: string | null;
  color: string;
  visible: boolean;
  opacity: number;
  symbolStyle?: SpatialLayerSymbolStyle;
};

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
  onOpenImportWizard: () => void;
  basemapId: WorkspaceBasemapId;
  onBasemapChange: (id: WorkspaceBasemapId) => void;
  showFeatureLabels: boolean;
  onShowFeatureLabelsChange: (show: boolean) => void;
  onFitAllLayers: () => void;
  onSaveMapBookmark: () => void;
  onRestoreMapBookmark: () => void;
  hasMapBookmark: boolean;
  toolMode: WorkspaceMapToolMode;
  onToolModeChange: (mode: WorkspaceMapToolMode) => void;
  canDrawBidang?: boolean;
  canDrawGaris?: boolean;
  onOpenGoToDialog: () => void;
  importOverlapCount?: number;
  filterSyncEnabled?: boolean;
  onFilterSyncChange?: (enabled: boolean) => void;
  selectionSyncEnabled?: boolean;
  onSelectionSyncChange?: (enabled: boolean) => void;
  onCopyMapContext?: () => void;
  onOpenAnalysisDialog?: () => void;
  onOpenEntity360ProfileDialog?: () => void;
  mapFullscreen?: boolean;
  onMapFullscreenToggle?: () => void;
  showMinimap?: boolean;
  onShowMinimapChange?: (show: boolean) => void;
  showAttributeDock?: boolean;
  onShowAttributeDockChange?: (show: boolean) => void;
  showRelationTrace?: boolean;
  onShowRelationTraceChange?: (show: boolean) => void;
  swipeCompareEnabled?: boolean;
  onSwipeCompareChange?: (enabled: boolean) => void;
  onOpenExternalLayersDialog?: () => void;
  onOpenOfflinePackDialog?: () => void;
  offlineModeActive?: boolean;
  isBelowMd: boolean;
  className?: string;
  headerLeading?: ReactNode;
  layersInRail?: boolean;
};

export function WorkspaceSpatialToolbar({
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
  onOpenImportWizard,
  basemapId,
  onBasemapChange,
  showFeatureLabels,
  onShowFeatureLabelsChange,
  onFitAllLayers,
  onSaveMapBookmark,
  onRestoreMapBookmark,
  hasMapBookmark,
  toolMode,
  onToolModeChange,
  canDrawBidang = true,
  canDrawGaris = true,
  onOpenGoToDialog,
  importOverlapCount = 0,
  filterSyncEnabled = true,
  onFilterSyncChange,
  selectionSyncEnabled = true,
  onSelectionSyncChange,
  onCopyMapContext,
  onOpenAnalysisDialog,
  onOpenEntity360ProfileDialog,
  mapFullscreen = false,
  onMapFullscreenToggle,
  showMinimap = false,
  onShowMinimapChange,
  showAttributeDock = false,
  onShowAttributeDockChange,
  showRelationTrace = true,
  onShowRelationTraceChange,
  swipeCompareEnabled = false,
  onSwipeCompareChange,
  onOpenExternalLayersDialog,
  onOpenOfflinePackDialog,
  offlineModeActive = false,
  isBelowMd,
  className,
  headerLeading,
  layersInRail = false,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const spatialHelpHref = useMemo(() => {
    const ret = buildReturnQueryValue(pathname, searchParams.toString());
    return `/help/spatial-import?return=${ret}`;
  }, [pathname, searchParams]);

  const [layersOpen, setLayersOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [basemapOpen, setBasemapOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  const activeBasemap =
    WORKSPACE_BASEMAPS.find((b) => b.id === basemapId) ?? WORKSPACE_BASEMAPS[0]!;

  const visibleLayerCount = useMemo(
    () =>
      layerRows.filter((r) => r.visible).length +
      (importPreviewCount > 0 && importPreviewVisible ? 1 : 0),
    [layerRows, importPreviewCount, importPreviewVisible]
  );

  const touchBtn = isBelowMd ? "min-h-11 touch-manipulation" : undefined;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-3 py-2",
        className
      )}
      data-testid="spatial-toolbar"
    >
      <div className="flex min-w-0 items-center gap-2">
        {headerLeading}
        <p className="text-xs text-muted-foreground">
          {visibleLayerCount > 0 ? (
            <>
              <span className="font-medium text-foreground">
                {visibleLayerCount}
              </span>{" "}
              lapisan aktif
              {filterSyncEnabled ? (
                <span className="ml-1 text-sky-700 dark:text-sky-300">
                  · filter Data
                </span>
              ) : null}
              {selectionSyncEnabled ? (
                <span className="ml-1 text-orange-700 dark:text-orange-300">
                  · seleksi
                </span>
              ) : null}
              {importPreviewCount > 0 ? (
                <span className="ml-1 text-teal-700 dark:text-teal-300">
                  · pratinjau {importPreviewCount}
                  {importOverlapCount > 0 ? (
                    <span className="text-amber-700 dark:text-amber-300">
                      {" "}
                      · {importOverlapCount} tumpang
                    </span>
                  ) : null}
                </span>
              ) : null}
            </>
          ) : (
            "Tidak ada lapisan aktif"
          )}
        </p>
      </div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          touchBtn && "[&_button]:min-h-11"
        )}
      >
        {!layersInRail ? (
          <Popover open={layersOpen} onOpenChange={setLayersOpen}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 font-normal"
                  data-testid="spatial-layers-trigger"
                >
                  <Layers className="size-3.5 shrink-0" aria-hidden />
                  Lapisan
                  <ChevronDown className="size-3.5 opacity-60" aria-hidden />
                </Button>
              }
            />
            <PopoverContent align="end" className="w-[min(20rem,92vw)] p-0">
              <div className="border-b border-border px-3 py-2">
                <p className="text-sm font-medium text-foreground">
                  Lapisan peta
                </p>
                <p className="text-xs text-muted-foreground">
                  Tabel virtual ber-geometry di ruang kerja ini
                </p>
              </div>
              <div className="max-h-[min(50vh,16rem)] overflow-y-auto p-2">
                <WorkspaceSpatialLayerList
                  layerRows={layerRows}
                  groups={groups}
                  importPreviewCount={importPreviewCount}
                  importPreviewVisible={importPreviewVisible}
                  onImportPreviewVisibilityChange={
                    onImportPreviewVisibilityChange
                  }
                  onTableLayerVisibilityChange={onTableLayerVisibilityChange}
                  onTableLayerOpacityChange={onTableLayerOpacityChange}
                  onTableLayerStyleChange={onTableLayerStyleChange}
                  onTableGroupChange={onTableGroupChange}
                  onMoveLayer={onMoveLayer}
                  onZoomToLayer={(id) => {
                    onZoomToLayer?.(id);
                    setLayersOpen(false);
                  }}
                  isBelowMd={isBelowMd}
                  variant="compact"
                />
              </div>
            </PopoverContent>
          </Popover>
        ) : null}

        <Popover open={basemapOpen} onOpenChange={setBasemapOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 font-normal"
                data-testid="spatial-basemap-trigger"
              >
                <MapIcon className="size-3.5 shrink-0" aria-hidden />
                <span className="max-w-[5.5rem] truncate sm:max-w-none">
                  {activeBasemap.label}
                </span>
                <ChevronDown className="size-3.5 opacity-60" aria-hidden />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-52 p-1">
            {WORKSPACE_BASEMAPS.map((b) => (
              <button
                key={b.id}
                type="button"
                className={cn(
                  "flex w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                  b.id === basemapId && "bg-muted font-medium"
                )}
                onClick={() => {
                  onBasemapChange(b.id);
                  setBasemapOpen(false);
                }}
              >
                {b.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <Popover open={toolsOpen} onOpenChange={setToolsOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant={
                  toolMode !== "navigate" ? "secondary" : "outline"
                }
                size="sm"
                className="gap-1.5 font-normal"
                data-testid="spatial-tools-trigger"
              >
                <Crosshair className="size-3.5 shrink-0" aria-hidden />
                Alat
                <ChevronDown className="size-3.5 opacity-60" aria-hidden />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-52 p-1">
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                toolMode === "measure-line" && "bg-muted font-medium"
              )}
              onClick={() => {
                onToolModeChange(
                  toolMode === "measure-line" ? "navigate" : "measure-line"
                );
                setToolsOpen(false);
              }}
            >
              <Ruler className="size-4 shrink-0" aria-hidden />
              Ukur jarak
            </button>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                toolMode === "measure-area" && "bg-muted font-medium"
              )}
              onClick={() => {
                onToolModeChange(
                  toolMode === "measure-area" ? "navigate" : "measure-area"
                );
                setToolsOpen(false);
              }}
            >
              <Pentagon className="size-4 shrink-0" aria-hidden />
              Ukur luas
            </button>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                toolMode === "identify" && "bg-muted font-medium"
              )}
              onClick={() => {
                onToolModeChange(
                  toolMode === "identify" ? "navigate" : "identify"
                );
                setToolsOpen(false);
              }}
            >
              <Crosshair className="size-4 shrink-0" aria-hidden />
              Identify titik
            </button>
            <button
              type="button"
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2.5 text-sm hover:bg-muted",
                toolMode === "move-geom" && "bg-muted font-medium"
              )}
              onClick={() => {
                onToolModeChange(
                  toolMode === "move-geom" ? "navigate" : "move-geom"
                );
                setToolsOpen(false);
              }}
            >
              <Move className="size-4 shrink-0" aria-hidden />
              Edit geometri
            </button>
            <button
              type="button"
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2.5 text-sm hover:bg-muted",
                toolMode === "draw-bidang" && "bg-muted font-medium"
              )}
              disabled={!canDrawBidang}
              title={
                canDrawBidang
                  ? undefined
                  : "Buat tabel ber-geometri dulu untuk menyimpan bidang"
              }
              onClick={() => {
                onToolModeChange(
                  toolMode === "draw-bidang" ? "navigate" : "draw-bidang"
                );
                setToolsOpen(false);
              }}
            >
              <PencilLine className="size-4 shrink-0" aria-hidden />
              Gambar bidang
            </button>
            <button
              type="button"
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2.5 text-sm hover:bg-muted",
                toolMode === "draw-garis" && "bg-muted font-medium"
              )}
              disabled={!canDrawGaris}
              title={
                canDrawGaris
                  ? undefined
                  : "Buat tabel ber-geometri dulu untuk menyimpan garis"
              }
              onClick={() => {
                onToolModeChange(
                  toolMode === "draw-garis" ? "navigate" : "draw-garis"
                );
                setToolsOpen(false);
              }}
            >
              <Spline className="size-4 shrink-0" aria-hidden />
              Gambar garis
            </button>
            <button
              type="button"
              className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2.5 text-sm hover:bg-muted"
              onClick={() => {
                onOpenGoToDialog();
                setToolsOpen(false);
              }}
            >
              <MapIcon className="size-4 shrink-0" aria-hidden />
              Go to XY
            </button>
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 font-normal"
          onClick={onFitAllLayers}
          title="Zoom ke semua lapisan (F)"
          data-testid="spatial-fit-all"
        >
          <Maximize2 className="size-3.5 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Semua</span>
        </Button>

        {onMapFullscreenToggle ? (
          <Button
            type="button"
            variant={mapFullscreen ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5 font-normal"
            onClick={onMapFullscreenToggle}
            title="Layar penuh peta"
            data-testid="spatial-fullscreen-toggle"
          >
            <Expand className="size-3.5 shrink-0" aria-hidden />
            <span className="hidden sm:inline">
              {mapFullscreen ? "Keluar" : "Penuh"}
            </span>
          </Button>
        ) : null}

        <Button
          type="button"
          variant={showFeatureLabels ? "secondary" : "outline"}
          size="sm"
          className="gap-1.5 font-normal"
          onClick={() => onShowFeatureLabelsChange(!showFeatureLabels)}
          title="Label bidang di peta"
          data-testid="spatial-labels-toggle"
        >
          <Tag className="size-3.5 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Label</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 font-normal"
          onClick={onOpenImportWizard}
          data-testid="spatial-import-trigger"
        >
          <Upload className="size-3.5 shrink-0" aria-hidden />
          Impor
        </Button>

        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="px-2"
                aria-label="Opsi lain"
                data-testid="spatial-more-trigger"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-56 p-2">
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                filterSyncEnabled && "bg-muted/60 font-medium"
              )}
              onClick={() => {
                onFilterSyncChange?.(!filterSyncEnabled);
                setMoreOpen(false);
              }}
            >
              Ikuti filter tab Data
            </button>
            {onOpenAnalysisDialog ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                onClick={() => {
                  onOpenAnalysisDialog();
                  setMoreOpen(false);
                }}
              >
                <BarChart3 className="size-4 shrink-0" aria-hidden />
                Analisis spasial…
              </button>
            ) : null}
            {onOpenEntity360ProfileDialog ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                onClick={() => {
                  onOpenEntity360ProfileDialog();
                  setMoreOpen(false);
                }}
              >
                <Layers className="size-4 shrink-0" aria-hidden />
                Relasi peta & panel 360°…
              </button>
            ) : null}
            {onCopyMapContext ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                onClick={() => {
                  onCopyMapContext();
                  setMoreOpen(false);
                }}
              >
                <MapIcon className="size-4 shrink-0" aria-hidden />
                Salin konteks peta
              </button>
            ) : null}
            {onSelectionSyncChange ? (
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                  selectionSyncEnabled && "bg-muted/60 font-medium"
                )}
                onClick={() => {
                  onSelectionSyncChange(!selectionSyncEnabled);
                  setMoreOpen(false);
                }}
              >
                Sinkron seleksi Data ↔ Spasial
              </button>
            ) : null}
            {onShowRelationTraceChange ? (
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                  showRelationTrace && "bg-muted/60 font-medium"
                )}
                onClick={() => {
                  onShowRelationTraceChange(!showRelationTrace);
                  setMoreOpen(false);
                }}
              >
                <GitBranch className="size-4 shrink-0" aria-hidden />
                Trace relasi di peta
              </button>
            ) : null}
            {onShowMinimapChange ? (
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                  showMinimap && "bg-muted/60 font-medium"
                )}
                onClick={() => {
                  onShowMinimapChange(!showMinimap);
                  setMoreOpen(false);
                }}
              >
                Mini-map overview
              </button>
            ) : null}
            {onShowAttributeDockChange ? (
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                  showAttributeDock && "bg-muted/60 font-medium"
                )}
                onClick={() => {
                  onShowAttributeDockChange(!showAttributeDock);
                  setMoreOpen(false);
                }}
              >
                Tabel atribut (dock)
              </button>
            ) : null}
            {onSwipeCompareChange ? (
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                  swipeCompareEnabled && "bg-muted/60 font-medium"
                )}
                onClick={() => {
                  onSwipeCompareChange(!swipeCompareEnabled);
                  setMoreOpen(false);
                }}
              >
                Bandingkan basemap (swipe)
              </button>
            ) : null}
            {onOpenExternalLayersDialog ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                onClick={() => {
                  onOpenExternalLayersDialog();
                  setMoreOpen(false);
                }}
              >
                <Globe className="size-4 shrink-0 opacity-70" />
                Lapisan referensi eksternal…
              </button>
            ) : null}
            {onOpenOfflinePackDialog ? (
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted",
                  offlineModeActive && "bg-muted/60 font-medium"
                )}
                onClick={() => {
                  onOpenOfflinePackDialog();
                  setMoreOpen(false);
                }}
              >
                <WifiOff className="size-4 shrink-0 opacity-70" />
                Basemap offline…
              </button>
            ) : null}
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
              onClick={() => {
                onSaveMapBookmark();
                setMoreOpen(false);
              }}
            >
              <Bookmark className="size-4 shrink-0" aria-hidden />
              Simpan tampilan peta
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
              disabled={!hasMapBookmark}
              onClick={() => {
                onRestoreMapBookmark();
                setMoreOpen(false);
              }}
            >
              <Bookmark className="size-4 shrink-0 rotate-180" aria-hidden />
              Pulihkan tampilan tersimpan
            </button>
            <div className="my-1 border-t border-border" />
            <Link
              href={spatialHelpHref}
              className="block rounded-md px-2 py-2 text-sm text-foreground hover:bg-muted"
              onClick={() => setMoreOpen(false)}
            >
              Bantuan impor spasial
            </Link>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export function buildSpatialLayerRows(
  vtablesWithGeometry: VirtualTableRow[],
  featureCountByTableId: Map<string, number>,
  totalCountByTableId: Map<string, number>,
  visibility: Record<string, boolean>,
  opacity: Record<string, number>,
  styles: Record<string, SpatialLayerSymbolStyle>,
  tableOrder: string[],
  tableGroupId: Record<string, string | null>,
  filterActiveByTable: Record<string, boolean>
): SpatialLayerRow[] {
  const order = tableOrder.length
    ? tableOrder
    : vtablesWithGeometry.map((vt) => vt.id);
  const byId = new Map(vtablesWithGeometry.map((vt, index) => [vt.id, { vt, index }]));
  const rows: SpatialLayerRow[] = [];

  for (const tableId of order) {
    const entry = byId.get(tableId);
    if (!entry) continue;
    const { vt, index } = entry;
    const total = totalCountByTableId.get(vt.id) ?? featureCountByTableId.get(vt.id) ?? 0;
    const shown = featureCountByTableId.get(vt.id) ?? 0;
    rows.push({
      tableId: vt.id,
      displayName: vt.display_name,
      tableIcon: vt.icon ?? null,
      description: vt.description ?? null,
      featureCount: shown,
      totalFeatureCount: total !== shown ? total : undefined,
      filterActive: filterActiveByTable[vt.id] ?? false,
      groupId: tableGroupId[vt.id] ?? null,
      color: spatialLayerColorForTableIndex(index),
      visible: visibility[vt.id] !== false,
      opacity: opacity[vt.id] ?? 1,
      symbolStyle: styles[vt.id],
    });
  }

  for (const [tableId, { vt, index }] of byId) {
    if (rows.some((r) => r.tableId === tableId)) continue;
    const total = totalCountByTableId.get(vt.id) ?? 0;
    const shown = featureCountByTableId.get(vt.id) ?? 0;
    rows.push({
      tableId: vt.id,
      displayName: vt.display_name,
      tableIcon: vt.icon ?? null,
      description: vt.description ?? null,
      featureCount: shown,
      totalFeatureCount: total !== shown ? total : undefined,
      filterActive: filterActiveByTable[vt.id] ?? false,
      groupId: tableGroupId[vt.id] ?? null,
      color: spatialLayerColorForTableIndex(index),
      visible: visibility[vt.id] !== false,
      opacity: opacity[vt.id] ?? 1,
      symbolStyle: styles[vt.id],
    });
  }

  return rows;
}
