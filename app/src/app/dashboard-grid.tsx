"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type { Layout } from "react-grid-layout";
import type { DashboardWidget } from "@/app/virtual-dashboard-types";
import { DASHBOARD_GRID_COLS } from "@/app/virtual-dashboard-types";
import { Pencil, Trash2 } from "lucide-react";
import { DashboardWidgetBody, type DashboardMapLayerData } from "@/app/dashboard-widget-body";
import type { DashboardTableBundle } from "@/lib/dashboard-table-bundle";
import type { VirtualColumnRow } from "@/app/virtual-table-types";
import type { VirtualRowMapSelect } from "@/app/workspace-map";
import "react-grid-layout/css/styles.css";

const GridWithWidth = dynamic(
  () =>
    import("react-grid-layout/legacy").then((m) => m.WidthProvider(m.default)),
  { ssr: false }
);

const CARD_CLASS =
  "h-full rounded-xl border border-border bg-card shadow-sm bg-gradient-to-b from-card to-muted/20";

type Props = {
  widgets: DashboardWidget[];
  editing: boolean;
  bundlesByTable: Map<string, DashboardTableBundle>;
  mapLayers: Map<string, DashboardMapLayerData>;
  mapLayersLoading?: boolean;
  highlightTableId?: string | null;
  highlightRowId?: string | null;
  columnsByTableId: Map<string, VirtualColumnRow[]>;
  tableNameById: Map<string, string>;
  onLayoutChange: Dispatch<SetStateAction<DashboardWidget[]>>;
  onEditWidget: (widget: DashboardWidget) => void;
  onRemoveWidget: (id: string) => void;
  onMapRowSelect?: (select: VirtualRowMapSelect) => void;
  onOpenSpatial?: (tableId: string) => void;
};

export function DashboardGrid({
  widgets,
  editing,
  bundlesByTable,
  mapLayers,
  mapLayersLoading = false,
  highlightTableId = null,
  highlightRowId = null,
  columnsByTableId,
  tableNameById,
  onLayoutChange,
  onEditWidget,
  onRemoveWidget,
  onMapRowSelect,
  onOpenSpatial,
}: Props) {
  const layout = useMemo(
    () =>
      widgets.map((w) => ({
        i: w.id,
        x: w.x ?? 0,
        y: w.y ?? 0,
        w: w.w ?? 3,
        h: w.h ?? 2,
        minW: 2,
        minH: 1,
        static: !editing,
      })),
    [widgets, editing]
  );

  const getBundle = (widget: DashboardWidget) => {
    const tid = (widget.config as { table_id?: string }).table_id;
    if (!tid) return null;
    return bundlesByTable.get(tid) ?? null;
  };

  const commitLayout = useCallback(
    (next: Layout) => {
      if (!editing) return;
      const byId = new Map(next.map((l) => [l.i, l]));
      onLayoutChange((prev) =>
        prev.map((w) => {
          const l = byId.get(w.id);
          if (!l) return w;
          return { ...w, x: l.x, y: l.y, w: l.w, h: l.h };
        })
      );
    },
    [editing, onLayoutChange]
  );

  if (widgets.length === 0) return null;

  return (
    <div className="dashboard-grid -mx-1 w-full">
      <GridWithWidth
        className="layout"
        layout={layout}
        cols={DASHBOARD_GRID_COLS}
        rowHeight={72}
        margin={[12, 12] as const}
        containerPadding={[4, 4] as const}
        isDraggable={editing}
        isResizable={editing}
        compactType="vertical"
        draggableCancel="button, a, input, select, textarea, .dashboard-widget-interactive"
        onDragStop={commitLayout}
        onResizeStop={commitLayout}
      >
        {widgets.map((w) => (
          <div
            key={w.id}
            className={`${CARD_CLASS} relative flex flex-col overflow-hidden p-4${
              editing ? " ring-offset-2" : ""
            }`}
          >
            {editing ? (
              <div className="absolute right-2 top-2 z-10 flex gap-1">
                <button
                  type="button"
                  className="rounded-md bg-background/80 p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditWidget(w);
                  }}
                  title="Edit widget"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded-md bg-background/80 p-0.5 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveWidget(w.id);
                  }}
                  title="Hapus widget"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
            {w.type !== "header" ? (
              <p className="mb-2 shrink-0 text-sm font-medium text-muted-foreground">
                {w.title}
              </p>
            ) : null}
            <div className="min-h-0 flex-1 overflow-auto dashboard-widget-interactive">
              <DashboardWidgetBody
                widget={w}
                bundle={getBundle(w)}
                columnsByTableId={columnsByTableId}
                tableNameById={tableNameById}
                mapLayers={mapLayers}
                mapLayersLoading={mapLayersLoading}
                editing={editing}
                highlightRowId={highlightRowId}
                highlightTableId={highlightTableId}
                onMapRowSelect={onMapRowSelect}
                onOpenSpatial={onOpenSpatial}
              />
            </div>
          </div>
        ))}
      </GridWithWidth>
    </div>
  );
}
