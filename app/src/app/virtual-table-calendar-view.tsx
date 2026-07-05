"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { virtualRowDisplayLabel } from "@/lib/virtual-table-row-label";
import {
  addMonths,
  monthMatrix,
  parseIsoDate,
  sameLocalDay,
} from "./schedule-utils";
import type { VirtualColumnRow, VirtualDataRow } from "./virtual-table-types";

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

type Props = {
  rows: VirtualDataRow[];
  columns: VirtualColumnRow[];
  dateColumnSlug: string;
  onOpenRow: (rowId: string) => void;
  className?: string;
};

function rowDate(row: VirtualDataRow, dateColumnSlug: string): Date | null {
  const raw = row.payload[dateColumnSlug];
  if (raw == null || raw === "") return null;
  return parseIsoDate(String(raw));
}

function initialMonth(rows: VirtualDataRow[], dateColumnSlug: string): Date {
  const now = new Date();
  for (const row of rows) {
    const d = rowDate(row, dateColumnSlug);
    if (d) return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function VirtualTableCalendarView({
  rows,
  columns,
  dateColumnSlug,
  onOpenRow,
  className,
}: Props) {
  const rowsWithDate = useMemo(
    () => rows.filter((r) => rowDate(r, dateColumnSlug)),
    [rows, dateColumnSlug]
  );

  const [monthCursor, setMonthCursor] = useState(() =>
    initialMonth(rowsWithDate, dateColumnSlug)
  );

  const matrix = useMemo(() => monthMatrix(monthCursor), [monthCursor]);

  const title = monthCursor.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold capitalize text-foreground">
          {title}
        </h3>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMonthCursor((m) => addMonths(m, -1))}
            className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground hover:bg-muted/60"
          >
            ← Bulan lalu
          </button>
          <button
            type="button"
            onClick={() => setMonthCursor((m) => addMonths(m, 1))}
            className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground hover:bg-muted/60"
          >
            Bulan depan →
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border pm-mobile-scroll">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-center text-xs">
          <thead>
            <tr>
              {WEEKDAYS.map((d) => (
                <th
                  key={d}
                  className="w-[14.2857%] border-b border-border bg-muted/50 py-2 font-medium text-muted-foreground"
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((rowCells, ri) => (
              <tr key={ri}>
                {rowCells.map(({ date, inMonth }, ci) => {
                  const dayRows = rowsWithDate.filter((r) => {
                    const d = rowDate(r, dateColumnSlug);
                    return d && sameLocalDay(d, date);
                  });
                  const visible = dayRows.slice(0, 3);
                  const hidden = dayRows.length - visible.length;
                  return (
                    <td
                      key={ci}
                      className={cn(
                        "h-28 align-top border border-border/60 p-1",
                        inMonth ? "bg-card" : "bg-muted/30 text-muted-foreground"
                      )}
                    >
                      <div className="h-full overflow-hidden text-left">
                        <span
                          className={cn(
                            "inline-block rounded px-1 font-medium",
                            inMonth ? "text-foreground" : "text-muted-foreground"
                          )}
                        >
                          {date.getDate()}
                        </span>
                        <ul className="mt-1 space-y-0.5">
                          {visible.map((r) => (
                            <li key={r.id}>
                              <button
                                type="button"
                                onClick={() => onOpenRow(r.id)}
                                className="w-full truncate rounded bg-primary/10 px-1 py-0.5 text-left text-[10px] text-foreground hover:bg-primary/15"
                                title={virtualRowDisplayLabel(r, columns)}
                              >
                                {virtualRowDisplayLabel(r, columns)}
                              </button>
                            </li>
                          ))}
                          {hidden > 0 ? (
                            <li className="truncate px-1 text-[10px] text-muted-foreground">
                              +{hidden} lainnya
                            </li>
                          ) : null}
                        </ul>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rowsWithDate.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Belum ada baris dengan tanggal di kolom ini.
        </p>
      ) : null}
    </div>
  );
}
