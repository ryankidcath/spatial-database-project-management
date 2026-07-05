import type { VirtualColumnRow, VirtualDataRow } from "@/app/virtual-table-types";

/** Label singkat baris untuk kartu kanban / kalender. */
export function virtualRowDisplayLabel(
  row: VirtualDataRow,
  columns: VirtualColumnRow[]
): string {
  const ordered = [...columns].sort((a, b) => a.position - b.position);
  for (const col of ordered) {
    if (col.data_type !== "text" && col.data_type !== "select") continue;
    const raw = row.payload[col.slug];
    if (raw == null || raw === "") continue;
    const text = String(raw).trim();
    if (text) return text;
  }
  return `Baris ${row.id.slice(0, 8)}`;
}
