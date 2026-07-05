"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { WORKSPACE_TAB_LIST_HEADER_CLASS } from "./workspace-tab-list-header";
import { WorkspaceSpatialLayerList } from "./workspace-spatial-layer-list";
import type { SpatialLayerRow } from "./workspace-spatial-toolbar";

type Props = {
  layerRows: SpatialLayerRow[];
  importPreviewCount: number;
  importPreviewVisible: boolean;
  onImportPreviewVisibilityChange: (visible: boolean) => void;
  onTableLayerVisibilityChange: (tableId: string, visible: boolean) => void;
  headerLeading?: ReactNode;
};

export function WorkspaceSpatialLayerRail({
  layerRows,
  importPreviewCount,
  importPreviewVisible,
  onImportPreviewVisibilityChange,
  onTableLayerVisibilityChange,
  headerLeading,
}: Props) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    if (!query) return layerRows;
    return layerRows.filter((row) =>
      row.displayName.toLowerCase().includes(query)
    );
  }, [layerRows, query]);

  const showImportPreview =
    importPreviewCount > 0 &&
    (query.length === 0 || "pratinjau impor".includes(query));

  const visibleCount =
    filteredRows.filter((r) => r.visible).length +
    (showImportPreview && importPreviewVisible ? 1 : 0);

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
            data-testid="spatial-layer-rail-search"
            className="h-10 border-border bg-muted/30 pl-9"
          />
        </div>
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
          {filteredRows.length === 0 && !showImportPreview ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {query
                ? "Tidak ada lapisan yang cocok."
                : "Belum ada lapisan ber-geometry."}
            </p>
          ) : (
            <WorkspaceSpatialLayerList
              variant="rail"
              layerRows={filteredRows}
              importPreviewCount={showImportPreview ? importPreviewCount : 0}
              importPreviewVisible={importPreviewVisible}
              onImportPreviewVisibilityChange={onImportPreviewVisibilityChange}
              onTableLayerVisibilityChange={onTableLayerVisibilityChange}
              emptyMessage="Belum ada lapisan ber-geometry."
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
