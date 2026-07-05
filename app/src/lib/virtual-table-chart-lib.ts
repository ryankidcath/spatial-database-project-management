import type { VirtualDataRow } from "@/app/virtual-table-types";
import { statusPieCounts } from "@/app/virtual-dashboard-lib";

export type ChartBarItem = { label: string; count: number };

export type ChartPieItem = { label: string; count: number; color: string };

const PIE_COLORS = [
  "bg-blue-500",
  "bg-amber-400",
  "bg-green-500",
  "bg-violet-500",
  "bg-rose-400",
  "bg-teal-500",
  "bg-orange-400",
  "bg-slate-400",
];

export function countByColumnValue(
  rows: VirtualDataRow[],
  columnSlug: string
): ChartBarItem[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const raw = row.payload[columnSlug];
    const label =
      raw == null || raw === "" ? "(Kosong)" : String(raw).trim() || "(Kosong)";
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function pieFromSelectColumn(
  rows: VirtualDataRow[],
  columnSlug: string
): ChartPieItem[] {
  const bars = countByColumnValue(rows, columnSlug);
  return bars.map((b, i) => ({
    ...b,
    color: PIE_COLORS[i % PIE_COLORS.length]!,
  }));
}

export function pieFromStatusBuckets(
  rows: VirtualDataRow[],
  columnSlug: string
): ChartPieItem[] {
  const c = statusPieCounts(rows, columnSlug);
  return [
    { label: "To Do", count: c.todo, color: "bg-gray-400" },
    { label: "On Progress", count: c.inProgress, color: "bg-amber-400" },
    { label: "Done", count: c.done, color: "bg-green-500" },
    ...(c.other > 0
      ? [{ label: "Lainnya", count: c.other, color: "bg-slate-400" }]
      : []),
  ].filter((s) => s.count > 0);
}

export function sumNumberColumn(
  rows: VirtualDataRow[],
  columnSlug: string
): number {
  let sum = 0;
  for (const row of rows) {
    const raw = row.payload[columnSlug];
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isNaN(n)) sum += n;
  }
  return sum;
}

export function averageNumberColumn(
  rows: VirtualDataRow[],
  columnSlug: string
): number | null {
  let sum = 0;
  let n = 0;
  for (const row of rows) {
    const raw = row.payload[columnSlug];
    const v = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isNaN(v)) {
      sum += v;
      n++;
    }
  }
  if (n === 0) return null;
  return sum / n;
}
