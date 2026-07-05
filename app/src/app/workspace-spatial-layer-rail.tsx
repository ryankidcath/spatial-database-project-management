"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, FolderPlus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { SpatialLayerGroup } from "@/lib/workspace-spatial-layer-layout-preference";
import type { SpatialLayerSymbolStyle } from "@/lib/workspace-spatial-layer-style-preference";
import { WORKSPACE_TAB_LIST_HEADER_CLASS } from "./workspace-tab-list-header";
import { organizeSpatialLayerRows } from "./workspace-spatial-layer-organizer";
import { WorkspaceSpatialLayerList } from "./workspace-spatial-layer-list";
import type { SpatialLayerRow } from "./workspace-spatial-toolbar";
import type { ExternalMapLayerConfig } from "@/lib/workspace-spatial-external-layers";
import { WorkspaceSpatialExternalLayerList } from "./workspace-spatial-external-layer-list";

type Props = {
  layerRows: SpatialLayerRow[];
  groups: SpatialLayerGroup[];
  importPreviewCount: number;
  importPreviewVisible: boolean;
  onImportPreviewVisibilityChange: (visible: boolean) => void;
  onTableLayerVisibilityChange: (tableId: string, visible: boolean) => void;
  onTableLayerOpacityChange?: (tableId: string, opacity: number) => void;
  onTableLayerStyleChange?: (
    tableId: string,
    style: SpatialLayerSymbolStyle
  ) => void;
  onTableGroupChange?: (tableId: string, groupId: string | null) => void;
  onMoveLayer?: (tableId: string, direction: "up" | "down") => void;
  onZoomToLayer?: (tableId: string) => void;
  onAddGroup?: () => void;
  onToggleGroupCollapsed?: (groupId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  headerLeading?: ReactNode;
  externalLayers?: ExternalMapLayerConfig[];
  onExternalLayerVisibilityChange?: (id: string, visible: boolean) => void;
  onExternalLayerOpacityChange?: (id: string, opacity: number) => void;
  onExternalLayerZoom?: (id: string) => void;
  onExternalLayerRemove?: (id: string) => void;
  onManageExternalLayers?: () => void;
};

export function WorkspaceSpatialLayerRail({
  layerRows,
  groups,
  importPreviewCount,
  importPreviewVisible,
  onImportPreviewVisibilityChange,
  onTableLayerVisibilityChange,
  onTableLayerOpacityChange,
  onTableLayerStyleChange,
  onTableGroupChange,
  onMoveLayer,
  onZoomToLayer,
  onAddGroup,
  onToggleGroupCollapsed,
  onDeleteGroup,
  headerLeading,
  externalLayers = [],
  onExternalLayerVisibilityChange,
  onExternalLayerOpacityChange,
  onExternalLayerZoom,
  onExternalLayerRemove,
  onManageExternalLayers,
}: Props) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const tableGroupId = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const row of layerRows) {
      map[row.tableId] = row.groupId ?? null;
    }
    return map;
  }, [layerRows]);

  const filteredRows = useMemo(() => {
    if (!query) return layerRows;
    return layerRows.filter((row) =>
      row.displayName.toLowerCase().includes(query)
    );
  }, [layerRows, query]);

  const sections = useMemo(
    () => organizeSpatialLayerRows(filteredRows, groups, tableGroupId),
    [filteredRows, groups, tableGroupId]
  );

  const showImportPreview =
    importPreviewCount > 0 &&
    (query.length === 0 || "pratinjau impor".includes(query));

  const visibleCount =
    filteredRows.filter((r) => r.visible).length +
    (showImportPreview && importPreviewVisible ? 1 : 0);

  const listProps = {
    groups,
    importPreviewCount: showImportPreview ? importPreviewCount : 0,
    importPreviewVisible,
    onImportPreviewVisibilityChange,
    onTableLayerVisibilityChange,
    onTableLayerOpacityChange,
    onTableLayerStyleChange,
    onTableGroupChange,
    onMoveLayer,
    onZoomToLayer,
    variant: "rail" as const,
    emptyMessage: "Belum ada lapisan ber-geometry.",
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className={cn(
          WORKSPACE_TAB_LIST_HEADER_CLASS,
          headerLeading && "gap-2"
        )}
      >
        {headerLeading}
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari lapisan…"
            aria-label="Cari lapisan"
            className="h-10 border-border bg-muted/30 pl-9"
          />
        </div>
        {onAddGroup ? (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onAddGroup}
            title="Grup lapisan baru"
            aria-label="Grup lapisan baru"
          >
            <FolderPlus className="size-4" />
          </Button>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 min-w-0 flex-1" type="scroll">
        <div className="p-2">
          {layerRows.length > 0 || importPreviewCount > 0 ? (
            <p className="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Lapisan peta
              {query.length === 0 ? (
                <span className="ml-1.5 font-normal normal-case tracking-normal">
                  · {visibleCount} aktif
                </span>
              ) : null}
            </p>
          ) : null}

          {sections.length === 0 && !showImportPreview ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {query
                ? "Tidak ada lapisan yang cocok."
                : "Belum ada lapisan ber-geometry."}
            </p>
          ) : (
            sections.map((section) => {
              if (section.kind === "group") {
                const collapsed = section.group.collapsed ?? false;
                return (
                  <div key={section.group.id} className="mb-2">
                    <div className="flex items-center gap-0.5 rounded-md px-1 hover:bg-muted/60">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1.5 text-left text-xs font-semibold text-foreground"
                        onClick={() =>
                          onToggleGroupCollapsed?.(section.group.id)
                        }
                      >
                        {collapsed ? (
                          <ChevronRight className="size-3.5 shrink-0" />
                        ) : (
                          <ChevronDown className="size-3.5 shrink-0" />
                        )}
                        <span className="truncate">{section.group.name}</span>
                        <span className="shrink-0 font-normal text-muted-foreground">
                          ({section.rows.length})
                        </span>
                      </button>
                      {onDeleteGroup ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          title={`Hapus grup ${section.group.name}`}
                          aria-label={`Hapus grup ${section.group.name}`}
                          onClick={() => onDeleteGroup(section.group.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                    {!collapsed ? (
                      <WorkspaceSpatialLayerList
                        {...listProps}
                        layerRows={section.rows}
                      />
                    ) : null}
                  </div>
                );
              }
              return (
                <div key="ungrouped" className="mb-2">
                  {groups.length > 0 ? (
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Tanpa grup
                    </p>
                  ) : null}
                  <WorkspaceSpatialLayerList
                    {...listProps}
                    layerRows={section.rows}
                  />
                </div>
              );
            })
          )}

          {showImportPreview && sections.length === 0 ? (
            <WorkspaceSpatialLayerList {...listProps} layerRows={[]} />
          ) : null}

          {onExternalLayerVisibilityChange && onExternalLayerOpacityChange ? (
            <>
              <p className="px-2 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Referensi eksternal
              </p>
              <WorkspaceSpatialExternalLayerList
                layers={externalLayers}
                onVisibilityChange={onExternalLayerVisibilityChange}
                onOpacityChange={onExternalLayerOpacityChange}
                onZoomToLayer={onExternalLayerZoom}
                onRemoveLayer={onExternalLayerRemove}
                onManageLayers={onManageExternalLayers}
              />
            </>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
