"use client";

import type { DashboardValueCountRow } from "@/lib/dashboard-table-bundle";

const SEGMENT_COLORS = [
  "#0ea5e9",
  "#f59e0b",
  "#8b5cf6",
  "#22c55e",
  "#f43f5e",
  "#06b6d4",
  "#f97316",
  "#84cc16",
];

function formatPct(count: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((count / total) * 100)}%`;
}

/** Donut + legenda (multi-segmen dari nilai kolom select) — mendekati mockup dashboard v2. */
export function ValueDistributionDonutChart({
  rows,
  centerTitle = "Total",
  centerUnit = "baris",
}: {
  rows: DashboardValueCountRow[];
  centerTitle?: string;
  centerUnit?: string;
}) {
  const data = rows.filter((r) => r.count > 0);
  const total = data.reduce((s, r) => s + r.count, 0);

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Tidak ada data.</p>;
  }

  let cursor = 0;
  const segments = data.map((d, i) => {
    const pct = d.count / total;
    const start = cursor;
    cursor += pct;
    return {
      ...d,
      pct,
      start,
      color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
    };
  });

  const gradient = segments
    .map((s) => {
      const from = s.start * 360;
      const to = (s.start + s.pct) * 360;
      return `${s.color} ${from}deg ${to}deg`;
    })
    .join(", ");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative mx-auto shrink-0 sm:mx-0">
        <div
          className="size-[9.5rem] rounded-full shadow-inner"
          style={{
            background: `conic-gradient(${gradient})`,
            WebkitMask:
              "radial-gradient(circle, transparent 52%, black 53%)",
            mask: "radial-gradient(circle, transparent 52%, black 53%)",
          }}
          role="img"
          aria-label={`Distribusi ${total} ${centerUnit}`}
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {centerTitle}
          </span>
          <span className="text-2xl font-bold tabular-nums leading-tight text-foreground">
            {total.toLocaleString("id-ID")}
          </span>
          <span className="text-[10px] text-muted-foreground">{centerUnit}</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 overflow-y-auto pr-1 text-xs">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="min-w-0 flex-1 truncate text-foreground">
              {s.label}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatPct(s.count, total)}
            </span>
            <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
              ({s.count})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ValueDistributionBarChart({
  rows,
}: {
  rows: DashboardValueCountRow[];
}) {
  const data = rows.filter((r) => r.count > 0);
  const total = data.reduce((s, r) => s + r.count, 0);
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Tidak ada data.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
      {data.map((d, i) => (
        <div key={d.label} className="space-y-0.5">
          <div className="flex justify-between text-xs">
            <span className="truncate text-foreground">{d.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {formatPct(d.count, total)} ({d.count})
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${(d.count / max) * 100}%`,
                backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
