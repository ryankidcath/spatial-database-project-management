"use client";

import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { VirtualTableLayoutType } from "@/lib/virtual-table-layout-types";
import {
  chartColumnsOrdered,
  dateColumnsOrdered,
  fileColumnsOrdered,
  geometryColumnsOrdered,
  selectColumnsOrdered,
} from "@/lib/virtual-table-layout-availability";
import type {
  VirtualColumnRow,
  VirtualViewLayoutOptions,
} from "./virtual-table-types";

type Props = {
  layout: VirtualTableLayoutType;
  columns: VirtualColumnRow[];
  layoutOptions: VirtualViewLayoutOptions;
  onLayoutOptionsChange: (patch: Partial<VirtualViewLayoutOptions>) => void;
  className?: string;
  touchFriendly?: boolean;
};

type ColumnOption = { slug: string; display_name: string };

function resolveActiveSlug(
  slug: string | null | undefined,
  candidates: ColumnOption[]
): string {
  if (slug && candidates.some((c) => c.slug === slug)) return slug;
  return candidates[0]?.slug ?? "";
}

function LayoutInlineSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  testId,
  touchFriendly = false,
  title,
}: {
  label: string;
  value: string;
  options: ColumnOption[];
  onChange: (slug: string) => void;
  disabled?: boolean;
  testId: string;
  touchFriendly?: boolean;
  title?: string;
}) {
  if (options.length === 0) return null;

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="inline-flex shrink-0 items-center text-xs font-normal text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || options.length <= 1}
        data-testid={testId}
        className={cn(
          "max-w-[10rem] truncate rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-xs",
          touchFriendly ? "min-h-11 py-2" : "h-8"
        )}
        aria-label={label}
        title={title ?? label}
      >
        {options.map((col) => (
          <option key={col.slug} value={col.slug}>
            {col.display_name}
          </option>
        ))}
      </select>
    </div>
  );
}

const CHART_MODE_LABELS: Record<
  NonNullable<VirtualViewLayoutOptions["chartMode"]>,
  string
> = {
  bar: "Batang",
  pie: "Pie",
  stat: "Ringkasan",
};

export function TableLayoutOptionsToolbar({
  layout,
  columns,
  layoutOptions,
  onLayoutOptionsChange,
  className,
  touchFriendly = false,
}: Props) {
  const selectColumns = useMemo(
    () =>
      selectColumnsOrdered(columns).map((c) => ({
        slug: c.slug,
        display_name: c.display_name,
      })),
    [columns]
  );
  const dateColumns = useMemo(
    () =>
      dateColumnsOrdered(columns).map((c) => ({
        slug: c.slug,
        display_name: c.display_name,
      })),
    [columns]
  );
  const fileColumns = useMemo(
    () =>
      fileColumnsOrdered(columns).map((c) => ({
        slug: c.slug,
        display_name: c.display_name,
      })),
    [columns]
  );
  const geometryColumns = useMemo(
    () =>
      geometryColumnsOrdered(columns).map((c) => ({
        slug: c.slug,
        display_name: c.display_name,
      })),
    [columns]
  );
  const chartColumns = useMemo(
    () =>
      chartColumnsOrdered(columns).map((c) => ({
        slug: c.slug,
        display_name: c.display_name,
      })),
    [columns]
  );

  const chartColumn = columns.find((c) => c.slug === layoutOptions.chartColumn);
  const chartModeOptions = useMemo((): NonNullable<
    VirtualViewLayoutOptions["chartMode"]
  >[] => {
    if (chartColumn?.data_type === "number") return ["stat"];
    if (chartColumn?.data_type === "select") return ["bar", "pie"];
    return ["bar", "pie", "stat"];
  }, [chartColumn?.data_type]);

  if (layout === "grid" || layout === "form") return null;

  const pickers: ReactNode[] = [];

  if (layout === "kanban") {
    pickers.push(
      <LayoutInlineSelect
        key="kanban-status"
        label="Kolom status"
        value={resolveActiveSlug(layoutOptions.statusColumn, selectColumns)}
        options={selectColumns}
        onChange={(slug) => onLayoutOptionsChange({ statusColumn: slug })}
        testId="kanban-status-column-picker"
        touchFriendly={touchFriendly}
      />
    );
  }

  if (layout === "calendar") {
    pickers.push(
      <LayoutInlineSelect
        key="calendar-date"
        label="Kolom tanggal"
        value={resolveActiveSlug(layoutOptions.dateColumn, dateColumns)}
        options={dateColumns}
        onChange={(slug) => onLayoutOptionsChange({ dateColumn: slug })}
        testId="calendar-date-column-picker"
        touchFriendly={touchFriendly}
      />
    );
  }

  if (layout === "timeline") {
    const startSlug = resolveActiveSlug(layoutOptions.dateColumn, dateColumns);
    const endCandidates = dateColumns.filter((c) => c.slug !== startSlug);
    pickers.push(
      <LayoutInlineSelect
        key="timeline-start"
        label="Kolom mulai"
        value={startSlug}
        options={dateColumns}
        onChange={(slug) => {
          const patch: Partial<VirtualViewLayoutOptions> = { dateColumn: slug };
          if (layoutOptions.endDateColumn === slug) {
            patch.endDateColumn =
              dateColumns.find((c) => c.slug !== slug)?.slug ?? null;
          }
          onLayoutOptionsChange(patch);
        }}
        testId="timeline-start-date-column-picker"
        touchFriendly={touchFriendly}
      />
    );
    if (endCandidates.length > 0) {
      pickers.push(
        <LayoutInlineSelect
          key="timeline-end"
          label="Kolom akhir"
          value={resolveActiveSlug(
            layoutOptions.endDateColumn ?? startSlug,
            endCandidates.length > 0
              ? endCandidates
              : dateColumns
          )}
          options={endCandidates.length > 0 ? endCandidates : dateColumns}
          onChange={(slug) => onLayoutOptionsChange({ endDateColumn: slug })}
          disabled={endCandidates.length <= 1}
          testId="timeline-end-date-column-picker"
          touchFriendly={touchFriendly}
          title={
            endCandidates.length <= 1
              ? "Hanya satu kolom tanggal selain mulai"
              : "Kolom tanggal akhir (opsional)"
          }
        />
      );
    }
  }

  if (layout === "gallery" && fileColumns.length > 0) {
    pickers.push(
      <LayoutInlineSelect
        key="gallery-cover"
        label="Kolom cover"
        value={resolveActiveSlug(layoutOptions.coverColumn, fileColumns)}
        options={fileColumns}
        onChange={(slug) => onLayoutOptionsChange({ coverColumn: slug })}
        testId="gallery-cover-column-picker"
        touchFriendly={touchFriendly}
      />
    );
  }

  if (layout === "map") {
    pickers.push(
      <LayoutInlineSelect
        key="map-geometry"
        label="Kolom peta"
        value={resolveActiveSlug(layoutOptions.geometryColumn, geometryColumns)}
        options={geometryColumns}
        onChange={(slug) => onLayoutOptionsChange({ geometryColumn: slug })}
        testId="map-geometry-column-picker"
        touchFriendly={touchFriendly}
      />
    );
  }

  if (layout === "chart") {
    const activeChartSlug = resolveActiveSlug(
      layoutOptions.chartColumn,
      chartColumns
    );
    pickers.push(
      <LayoutInlineSelect
        key="chart-column"
        label="Kolom data"
        value={activeChartSlug}
        options={chartColumns}
        onChange={(slug) => {
          const col = columns.find((c) => c.slug === slug);
          const patch: Partial<VirtualViewLayoutOptions> = {
            chartColumn: slug,
          };
          if (col?.data_type === "number") {
            patch.chartMode = "stat";
          } else if (col?.data_type === "select") {
            patch.chartMode =
              layoutOptions.chartMode === "pie" ? "pie" : "bar";
          }
          onLayoutOptionsChange(patch);
        }}
        testId="chart-data-column-picker"
        touchFriendly={touchFriendly}
      />
    );
    if (chartModeOptions.length > 1) {
      const activeMode =
        layoutOptions.chartMode &&
        chartModeOptions.includes(layoutOptions.chartMode)
          ? layoutOptions.chartMode
          : chartModeOptions[0]!;
      pickers.push(
        <div key="chart-mode" className="inline-flex items-center gap-1.5">
          <span className="inline-flex shrink-0 items-center text-xs font-normal text-muted-foreground">
            Tampilan
          </span>
          <select
            value={activeMode}
            onChange={(e) =>
              onLayoutOptionsChange({
                chartMode: e.target.value as VirtualViewLayoutOptions["chartMode"],
              })
            }
            data-testid="chart-mode-picker"
            className={cn(
              "rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-xs",
              touchFriendly ? "min-h-11 py-2" : "h-8"
            )}
            aria-label="Tampilan chart"
          >
            {chartModeOptions.map((mode) => (
              <option key={mode} value={mode}>
                {CHART_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </div>
      );
    }
  }

  const visible = pickers.filter(Boolean);
  if (visible.length === 0) return null;

  return (
    <div
      className={cn("inline-flex flex-wrap items-center gap-2", className)}
      data-testid={`${layout}-layout-options`}
    >
      {visible}
    </div>
  );
}
