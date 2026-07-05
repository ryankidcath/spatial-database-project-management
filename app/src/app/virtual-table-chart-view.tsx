"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  averageNumberColumn,
  countByColumnValue,
  pieFromSelectColumn,
  sumNumberColumn,
  type ChartBarItem,
  type ChartPieItem,
} from "@/lib/virtual-table-chart-lib";
import type { VirtualColumnRow, VirtualDataRow } from "./virtual-table-types";

export type VirtualTableChartMode = "bar" | "pie" | "stat";

type Props = {
  rows: VirtualDataRow[];
  columns: VirtualColumnRow[];
  chartColumnSlug?: string | null;
  chartMode?: VirtualTableChartMode;
  className?: string;
};

function BarChart({ items }: { items: ChartBarItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Tidak ada data untuk diagram.</p>
    );
  }
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex justify-between gap-2 text-xs">
            <span className="truncate font-medium text-foreground">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {item.count}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/80"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function PieChart({ segments }: { segments: ChartPieItem[] }) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">Tidak ada data untuk diagram.</p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {segments.map((s) =>
          s.count > 0 ? (
            <div
              key={s.label}
              className={s.color}
              style={{ width: `${(s.count / total) * 100}%` }}
              title={`${s.label}: ${s.count}`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${s.color}`} />
            {s.label}: {s.count}
          </span>
        ))}
      </div>
    </div>
  );
}

export function VirtualTableChartView({
  rows,
  columns,
  chartColumnSlug,
  chartMode = "bar",
  className,
}: Props) {
  const columnLabel = useMemo(() => {
    if (!chartColumnSlug) return null;
    return columns.find((c) => c.slug === chartColumnSlug)?.display_name ?? chartColumnSlug;
  }, [columns, chartColumnSlug]);

  const barItems = useMemo(() => {
    if (chartMode !== "bar" || !chartColumnSlug) return [];
    return countByColumnValue(rows, chartColumnSlug);
  }, [rows, chartColumnSlug, chartMode]);

  const pieItems = useMemo(() => {
    if (chartMode !== "pie" || !chartColumnSlug) return [];
    return pieFromSelectColumn(rows, chartColumnSlug);
  }, [rows, chartColumnSlug, chartMode]);

  const statValue = useMemo(() => {
    if (chartMode !== "stat") return null;
    if (chartColumnSlug) {
      const col = columns.find((c) => c.slug === chartColumnSlug);
      if (col?.data_type === "number") {
        return {
          label: `Total ${col.display_name}`,
          value: sumNumberColumn(rows, chartColumnSlug),
        };
      }
    }
    return { label: "Total baris", value: rows.length };
  }, [rows, columns, chartColumnSlug, chartMode]);

  const statAvg = useMemo(() => {
    if (chartMode !== "stat" || !chartColumnSlug) return null;
    const col = columns.find((c) => c.slug === chartColumnSlug);
    if (col?.data_type !== "number") return null;
    return averageNumberColumn(rows, chartColumnSlug);
  }, [rows, chartColumnSlug, chartMode, columns]);

  return (
    <div className={cn("space-y-4 p-4", className)}>
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {chartMode === "stat"
            ? "Ringkasan"
            : chartMode === "pie"
              ? "Diagram pie"
              : "Diagram batang"}
        </h3>
        {columnLabel && chartMode !== "stat" ? (
          <p className="text-xs text-muted-foreground">Kolom: {columnLabel}</p>
        ) : null}
        {chartMode === "stat" && chartColumnSlug && columnLabel ? (
          <p className="text-xs text-muted-foreground">Kolom: {columnLabel}</p>
        ) : null}
      </div>

      {chartMode === "bar" ? <BarChart items={barItems} /> : null}
      {chartMode === "pie" ? <PieChart segments={pieItems} /> : null}
      {chartMode === "stat" && statValue ? (
        <div>
          <p className="text-4xl font-bold tabular-nums text-foreground">
            {typeof statValue.value === "number"
              ? statValue.value.toLocaleString("id-ID")
              : statValue.value}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{statValue.label}</p>
          {statAvg != null ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Rata-rata: {statAvg.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        Berdasarkan {rows.length} baris yang dimuat
        {rows.length > 0 ? "" : " — muat data atau longgarkan filter"}.
      </p>
    </div>
  );
}
