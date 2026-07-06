import type { VirtualDataRow } from "./virtual-table-types";

export type StatusBucket = "todo" | "in_progress" | "done" | "other";

export function bucketStatus(value: unknown): StatusBucket {
  const s = String(value ?? "")
    .toLowerCase()
    .trim();
  if (!s) return "other";
  if (["to do", "todo", "belum", "pending", "backlog"].some((k) => s.includes(k))) {
    return "todo";
  }
  if (
    ["on progress", "in progress", "sedang", "proses", "review"].some((k) => s.includes(k))
  ) {
    return "in_progress";
  }
  if (["done", "selesai", "complete", "completed", "approved"].some((k) => s.includes(k))) {
    return "done";
  }
  return "other";
}

export function countRows(
  rows: VirtualDataRow[],
  opts?: { column?: string; value?: string }
): number {
  if (!opts?.column) return rows.length;
  const col = opts.column;
  const val = opts.value?.trim();
  if (!val) return rows.length;
  return rows.filter((r) => String(r.payload[col] ?? "").trim() === val).length;
}

export function statusPieCounts(
  rows: VirtualDataRow[],
  statusColumn: string
): { todo: number; inProgress: number; done: number; other: number } {
  let todo = 0;
  let inProgress = 0;
  let done = 0;
  let other = 0;

  const addValue = (val: unknown) => {
    const b = bucketStatus(val);
    if (b === "todo") todo++;
    else if (b === "in_progress") inProgress++;
    else if (b === "done") done++;
    else other++;
  };

  for (const row of rows) {
    const val = row.payload[statusColumn];
    if (Array.isArray(val)) {
      if (val.length === 0) addValue(undefined);
      else for (const v of val) addValue(v);
    } else {
      addValue(val);
    }
  }
  return { todo, inProgress, done, other };
}

export function barByGroupCounts(
  rows: VirtualDataRow[],
  groupColumn: string,
  statusColumn: string,
  countWhen: string
): { label: string; count: number; total: number }[] {
  const map = new Map<string, { done: number; total: number }>();
  const matchWhen = countWhen.trim();

  const statusMatches = (val: unknown): boolean => {
    if (Array.isArray(val)) {
      return val.some((v) => String(v ?? "").trim() === matchWhen);
    }
    return String(val ?? "").trim() === matchWhen;
  };

  for (const row of rows) {
    const groupKey = String(row.payload[groupColumn] ?? "—").trim() || "—";
    const entry = map.get(groupKey) ?? { done: 0, total: 0 };
    entry.total++;
    if (statusMatches(row.payload[statusColumn])) {
      entry.done++;
    }
    map.set(groupKey, entry);
  }
  return [...map.entries()]
    .map(([label, { done, total }]) => ({ label, count: done, total }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}
