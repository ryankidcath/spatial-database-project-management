"use client";

import { Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardWidget } from "@/app/virtual-dashboard-types";
import type { VirtualColumnRow } from "@/app/virtual-table-types";
import {
  dashboardBarByGroupKey,
  dashboardFilterCountKey,
  type DashboardTableBundle,
  type DashboardValueCountRow,
} from "@/lib/dashboard-table-bundle";
import { resolveVirtualColumnSlug } from "@/lib/dashboard-column-resolve";
import { countRows } from "@/app/virtual-dashboard-lib";
import type { VirtualDataRow } from "@/app/virtual-table-types";
import type { MapFootprint, VirtualRowMapSelect } from "@/app/workspace-map";
import { DashboardMiniMapWidget } from "@/app/dashboard-mini-map-widget";
import {
  ValueDistributionBarChart,
  ValueDistributionDonutChart,
} from "@/app/dashboard-value-distribution-chart";
import { cn } from "@/lib/utils";

export type DashboardMapLayerData = {
  tableId: string;
  geometryColumn: string;
  rows: VirtualDataRow[];
  footprints: MapFootprint[];
  featureCount: number;
  totalAreaLabel: string;
};

const PIE_COLORS = [
  "bg-sky-500",
  "bg-amber-400",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-rose-400",
  "bg-cyan-500",
  "bg-orange-400",
  "bg-lime-500",
];

function ValueDistributionChart({
  rows,
  chartType = "pie",
  centerUnit,
}: {
  rows: DashboardValueCountRow[];
  chartType?: "pie" | "bar";
  centerUnit?: string;
}) {
  if (chartType === "bar") {
    return <ValueDistributionBarChart rows={rows} />;
  }
  return (
    <ValueDistributionDonutChart rows={rows} centerUnit={centerUnit ?? "baris"} />
  );
}

function SimpleStatusPie({
  todo,
  inProgress,
  done,
  other = 0,
}: {
  todo: number;
  inProgress: number;
  done: number;
  other?: number;
}) {
  const total = todo + inProgress + done + other;
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Tidak ada data status.</p>;
  }
  const segments = [
    { n: todo, color: "bg-gray-400", label: "To Do" },
    { n: inProgress, color: "bg-amber-400", label: "On Progress" },
    { n: done, color: "bg-green-500", label: "Done" },
    ...(other > 0 ? [{ n: other, color: "bg-sky-500", label: "Lainnya" }] : []),
  ];
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {segments.map((s) =>
          s.n > 0 ? (
            <div
              key={s.label}
              className={s.color}
              style={{ width: `${(s.n / total) * 100}%` }}
              title={`${s.label}: ${s.n}`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${s.color}`} />
            {s.label}: {s.n}
          </span>
        ))}
      </div>
    </div>
  );
}

function resolveStatusPieCounts(
  bundle: DashboardTableBundle | null,
  tableId: string,
  statusColumn: string,
  columnsByTableId: Map<string, VirtualColumnRow[]>
) {
  const empty = { todo: 0, inProgress: 0, done: 0, other: 0 };
  if (!bundle || !statusColumn) return empty;
  const cols = columnsByTableId.get(tableId) ?? [];
  const slug = resolveVirtualColumnSlug(cols, statusColumn);
  return (
    bundle.statusPieByColumn[slug] ??
    bundle.statusPieByColumn[statusColumn] ??
    empty
  );
}

function resolveValueDistribution(
  bundle: DashboardTableBundle | null,
  tableId: string,
  column: string,
  columnsByTableId: Map<string, VirtualColumnRow[]>
): DashboardValueCountRow[] {
  if (!bundle || !column) return [];
  const cols = columnsByTableId.get(tableId) ?? [];
  const slug = resolveVirtualColumnSlug(cols, column);
  return (
    bundle.valueCountsByColumn[slug] ??
    bundle.valueCountsByColumn[column] ??
    []
  );
}

function formatPreview(val: unknown): string {
  if (val == null || val === "") return "—";
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === "object") return "…";
  return String(val);
}

export function DashboardWidgetBody({
  widget,
  bundle,
  columnsByTableId,
  tableNameById,
  mapLayers = new Map(),
  mapLayersLoading = false,
  editing = false,
  highlightRowId = null,
  highlightTableId = null,
  onMapRowSelect,
  onOpenSpatial,
}: {
  widget: DashboardWidget;
  bundle: DashboardTableBundle | null;
  columnsByTableId: Map<string, VirtualColumnRow[]>;
  tableNameById: Map<string, string>;
  mapLayers?: Map<string, DashboardMapLayerData>;
  mapLayersLoading?: boolean;
  editing?: boolean;
  highlightRowId?: string | null;
  highlightTableId?: string | null;
  onMapRowSelect?: (select: VirtualRowMapSelect) => void;
  onOpenSpatial?: (tableId: string) => void;
}) {
  const cfg = widget.config as Record<string, string | undefined>;
  const rows = (bundle?.rows ?? []) as VirtualDataRow[];
  const tableId = String(cfg.table_id ?? "");

  if (widget.type === "header") {
    return (
      <p className="text-lg font-semibold text-foreground">
        {String(cfg.text ?? widget.title)}
      </p>
    );
  }

  if (widget.type === "stat") {
    const metric = cfg.metric ?? "count";
    const col = cfg.column?.trim();
    const filterCol = cfg.filter_column?.trim();
    const filterVal = cfg.filter_value?.trim();
    const cols = columnsByTableId.get(tableId) ?? [];
    const filterSlug = filterCol
      ? resolveVirtualColumnSlug(cols, filterCol)
      : "";
    const colSlug = col ? resolveVirtualColumnSlug(cols, col) : "";

    let n = 0;
    if (metric === "count_distinct" && colSlug && bundle) {
      n =
        bundle.distinctCounts[colSlug] ??
        bundle.distinctCounts[col ?? ""] ??
        0;
    } else if (metric === "sum" && colSlug && bundle) {
      n =
        bundle.sumByColumn[colSlug] ?? bundle.sumByColumn[col ?? ""] ?? 0;
    } else if (filterCol && filterVal && bundle) {
      n =
        bundle.filterCounts[dashboardFilterCountKey(filterCol, filterVal)] ??
        (filterSlug !== filterCol
          ? bundle.filterCounts[dashboardFilterCountKey(filterSlug, filterVal)]
          : undefined) ??
        0;
    } else {
      n = bundle?.totalCount ?? countRows(rows);
    }

    const prefix = cfg.prefix ?? "";
    const suffix = cfg.suffix ?? "";

    return (
      <div>
        <p className="text-4xl font-bold tabular-nums text-foreground">
          {prefix}
          {Number.isInteger(n) ? n.toLocaleString("id-ID") : n.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
          {suffix}
        </p>
        {filterCol && filterVal ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {filterCol} = {filterVal}
          </p>
        ) : null}
      </div>
    );
  }

  if (widget.type === "value_distribution") {
    const col = (cfg.column ?? cfg.status_column) ?? "";
    const dist = resolveValueDistribution(
      bundle,
      tableId,
      col,
      columnsByTableId
    );
    return (
      <ValueDistributionChart
        rows={dist}
        chartType={(cfg.chart_type as "pie" | "bar") ?? "pie"}
        centerUnit={cfg.center_unit?.trim() || "baris"}
      />
    );
  }

  if (widget.type === "multi_column_chart") {
    const dist = bundle?.columnSeriesByWidgetId[widget.id] ?? [];
    return (
      <ValueDistributionChart
        rows={dist}
        chartType={(cfg.chart_type as "pie" | "bar") ?? "pie"}
        centerUnit={cfg.center_unit?.trim() || "baris"}
      />
    );
  }

  if (widget.type === "status_pie") {
    const col = cfg.status_column ?? "";
    const counts = resolveStatusPieCounts(
      bundle,
      tableId,
      col,
      columnsByTableId
    );
    return (
      <SimpleStatusPie
        todo={counts.todo}
        inProgress={counts.inProgress}
        done={counts.done}
        other={counts.other}
      />
    );
  }

  if (widget.type === "bar_by_group") {
    const bars =
      bundle?.barByGroupByKey[
        dashboardBarByGroupKey(
          cfg.group_column ?? "",
          cfg.status_column ?? "",
          cfg.count_when ?? "Done"
        )
      ] ?? [];
    if (bars.length === 0) {
      return <p className="text-sm text-muted-foreground">Tidak ada data.</p>;
    }
    const max = Math.max(...bars.map((b) => b.count), 1);
    return (
      <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
        {bars.map((b) => (
          <div key={b.label} className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="truncate text-foreground">{b.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {b.count}/{b.total}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${(b.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (widget.type === "table_preview") {
    const cols = columnsByTableId.get(tableId) ?? [];
    const configured = (cfg.columns ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const showCols =
      configured.length > 0
        ? cols.filter((c) => configured.includes(c.slug))
        : cols.slice(0, 4);
    const limit = Math.min(Number(cfg.limit) || 8, 20);
    const preview = rows.slice(0, limit);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              {showCols.map((c) => (
                <th key={c.id} className="px-2 py-1 font-medium">
                  {c.display_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row) => {
              const highlighted =
                highlightTableId === tableId && highlightRowId === row.id;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border/50",
                    highlighted && "bg-primary/10 ring-1 ring-primary/30"
                  )}
                >
                  {showCols.map((c) => (
                    <td key={c.id} className="max-w-[140px] truncate px-2 py-1">
                      {formatPreview(row.payload[c.slug])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {preview.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Tabel kosong.</p>
        ) : null}
        <p className="mt-2 text-[10px] text-muted-foreground">
          {tableNameById.get(tableId) ?? "Tabel"} · {rows.length} baris
        </p>
      </div>
    );
  }

  if (widget.type === "mini_map") {
    const primary = mapLayers.get(tableId);
    const layer2Id = cfg.layer2_table_id ?? "";
    const secondary = layer2Id ? mapLayers.get(layer2Id) : undefined;
    const footprints = [
      ...(primary?.footprints ?? []),
      ...(secondary?.footprints ?? []),
    ];
    const highlight =
      highlightTableId === tableId || highlightTableId === layer2Id
        ? highlightRowId
        : null;

    return (
      <DashboardMiniMapWidget
        footprints={footprints}
        loading={mapLayersLoading}
        editing={editing}
        highlightRowId={highlight}
        onRowSelect={onMapRowSelect}
        onOpenSpatial={
          onOpenSpatial && tableId
            ? () => onOpenSpatial(tableId)
            : undefined
        }
      />
    );
  }

  if (widget.type === "spatial_summary") {
    const layer = mapLayers.get(tableId);
    const areaCol = cfg.area_column?.trim();
    let areaLabel = layer?.totalAreaLabel ?? "—";
    let featureCount = layer?.featureCount ?? 0;

    if (areaCol && bundle) {
      const cols = columnsByTableId.get(tableId) ?? [];
      const slug = resolveVirtualColumnSlug(cols, areaCol);
      const sum =
        bundle.sumByColumn[slug] ?? bundle.sumByColumn[areaCol] ?? null;
      if (sum != null) {
        areaLabel = `${sum.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
      }
    }

    if (!layer && !areaCol && !mapLayersLoading) {
      return (
        <p className="text-sm text-muted-foreground">
          Tidak ada data spasial untuk tabel ini.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Poligon terpetakan</p>
          <p className="text-3xl font-bold tabular-nums text-foreground">
            {mapLayersLoading ? "…" : featureCount.toLocaleString("id-ID")}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {areaCol ? "Total luas (kolom)" : "Total luas (geometri)"}
          </p>
          <p className="text-xl font-semibold tabular-nums text-foreground">
            {mapLayersLoading ? "…" : areaLabel}
          </p>
        </div>
        {onOpenSpatial && tableId ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSpatial(tableId);
            }}
          >
            <MapIcon className="size-3.5" />
            Buka di Spasial
          </Button>
        ) : null}
      </div>
    );
  }

  if (widget.type === "spatial_shortcut") {
    const label = cfg.label?.trim() || "Buka di tab Spasial";
    return (
      <div className="flex h-full flex-col items-start justify-center gap-2">
        <p className="text-sm text-muted-foreground">
          {tableNameById.get(tableId) ?? "Lapisan peta"} dengan filter dashboard
          saat ini.
        </p>
        {onOpenSpatial && tableId ? (
          <Button
            type="button"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSpatial(tableId);
            }}
          >
            <MapIcon className="mr-1.5 size-3.5" />
            {label}
          </Button>
        ) : null}
      </div>
    );
  }

  return null;
}
