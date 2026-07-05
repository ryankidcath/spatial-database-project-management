"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { virtualRowDisplayLabel } from "@/lib/virtual-table-row-label";
import {
  barRange,
  formatShortDate,
  ganttPixelLayout,
  parseIsoDate,
  type ScheduleIssue,
} from "./schedule-utils";
import type { VirtualColumnRow, VirtualDataRow } from "./virtual-table-types";

type Props = {
  rows: VirtualDataRow[];
  columns: VirtualColumnRow[];
  startDateColumnSlug: string;
  endDateColumnSlug?: string | null;
  onOpenRow: (rowId: string) => void;
  className?: string;
};

function rowScheduleIssue(
  row: VirtualDataRow,
  columns: VirtualColumnRow[],
  startSlug: string,
  endSlug: string | null | undefined
): ScheduleIssue | null {
  const startRaw = row.payload[startSlug];
  const endRaw = endSlug ? row.payload[endSlug] : startRaw;
  const starts_at =
    startRaw == null || startRaw === "" ? null : String(startRaw);
  const due_at = endRaw == null || endRaw === "" ? null : String(endRaw);
  if (!starts_at && !due_at) return null;
  return {
    id: row.id,
    project_id: "",
    parent_id: null,
    sort_order: row.sort_order,
    starts_at,
    due_at,
    key_display: null,
    title: virtualRowDisplayLabel(row, columns),
  };
}

export function VirtualTableTimelineView({
  rows,
  columns,
  startDateColumnSlug,
  endDateColumnSlug,
  onOpenRow,
  className,
}: Props) {
  const scheduled = useMemo(() => {
    const list: ScheduleIssue[] = [];
    for (const row of rows) {
      const issue = rowScheduleIssue(
        row,
        columns,
        startDateColumnSlug,
        endDateColumnSlug ?? startDateColumnSlug
      );
      if (issue) list.push(issue);
    }
    return list.sort((a, b) => a.sort_order - b.sort_order);
  }, [rows, columns, startDateColumnSlug, endDateColumnSlug]);

  const layout = useMemo(
    () => ganttPixelLayout(scheduled, 22, 2),
    [scheduled]
  );

  if (scheduled.length === 0) {
    return (
      <p className={cn("px-4 py-8 text-center text-sm text-muted-foreground", className)}>
        Tidak ada baris dengan tanggal pada kolom yang dipilih.
      </p>
    );
  }

  if (!layout) {
    return (
      <p className={cn("px-4 py-8 text-center text-sm text-muted-foreground", className)}>
        Tidak bisa menghitung rentang timeline.
      </p>
    );
  }

  const dayWidth = 22;
  const labelWidth = 200;

  return (
    <div className={cn("min-h-0 min-w-0 flex-1", className)}>
      <p className="mb-2 px-3 text-xs text-muted-foreground">
        Skala horizontal = hari. Gulir ke kanan untuk rentang panjang.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border bg-card pm-mobile-scroll">
        <div
          style={{ width: layout.widthPx + labelWidth }}
          className="relative min-w-full"
        >
          <div
            className="sticky top-0 z-10 flex border-b border-border bg-muted text-[10px] text-muted-foreground"
            style={{ marginLeft: labelWidth, width: layout.widthPx }}
          >
            {Array.from({ length: layout.totalDays }, (_, i) => {
              const t = layout.minDay.getTime() + i * 86400000;
              const d = new Date(t);
              return (
                <div
                  key={i}
                  className="shrink-0 border-l border-border/60 text-center leading-tight"
                  style={{ width: dayWidth }}
                >
                  <div>{d.getDate()}</div>
                  <div className="text-[9px] opacity-70">
                    {d.toLocaleDateString("id-ID", { month: "short" })}
                  </div>
                </div>
              );
            })}
          </div>
          {layout.bars.map(({ issue, leftPx, widthPx }) => (
            <div
              key={issue.id}
              className="flex items-stretch border-b border-border/60"
            >
              <div className="w-[200px] shrink-0 border-r border-border bg-muted/30 px-2 py-2 text-xs">
                <button
                  type="button"
                  onClick={() => onOpenRow(issue.id)}
                  className="w-full text-left hover:text-primary"
                >
                  <span className="block font-medium text-foreground">
                    {issue.title}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {formatShortDate(issue.starts_at)} →{" "}
                    {formatShortDate(issue.due_at)}
                  </span>
                </button>
              </div>
              <div className="relative py-2" style={{ width: layout.widthPx }}>
                <button
                  type="button"
                  onClick={() => onOpenRow(issue.id)}
                  className="absolute top-1/2 h-6 -translate-y-1/2 rounded-md bg-teal-600/90 text-left text-[10px] font-medium text-white shadow-sm hover:bg-teal-700"
                  style={{ left: leftPx, width: Math.max(widthPx, dayWidth) }}
                  title={`${formatShortDate(issue.starts_at)} – ${formatShortDate(issue.due_at)}`}
                >
                  <span className="block truncate px-2 leading-6">{issue.title}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Ekspor util untuk uji unit jika diperlukan. */
export { barRange, parseIsoDate };
