import type { SpatialLayerGroup } from "@/lib/workspace-spatial-layer-layout-preference";
import type { SpatialLayerRow } from "./workspace-spatial-toolbar";

export type SpatialLayerSection =
  | { kind: "group"; group: SpatialLayerGroup; rows: SpatialLayerRow[] }
  | { kind: "ungrouped"; rows: SpatialLayerRow[] };

export function organizeSpatialLayerRows(
  rows: SpatialLayerRow[],
  groups: SpatialLayerGroup[],
  tableGroupId: Record<string, string | null>
): SpatialLayerSection[] {
  const byId = new Map(rows.map((r) => [r.tableId, r]));
  const sections: SpatialLayerSection[] = [];

  for (const group of groups) {
    const groupRows = rows.filter(
      (r) => tableGroupId[r.tableId] === group.id
    );
    if (groupRows.length > 0) {
      sections.push({ kind: "group", group, rows: groupRows });
    }
  }

  const ungrouped = rows.filter(
    (r) => !tableGroupId[r.tableId] || !groups.some((g) => g.id === tableGroupId[r.tableId])
  );
  if (ungrouped.length > 0) {
    sections.push({ kind: "ungrouped", rows: ungrouped });
  }

  if (sections.length === 0 && rows.length > 0) {
    return [{ kind: "ungrouped", rows }];
  }

  return sections;
}

export function orderSpatialLayerRows(
  rows: SpatialLayerRow[],
  tableOrder: string[]
): SpatialLayerRow[] {
  const map = new Map(rows.map((r) => [r.tableId, r]));
  const ordered: SpatialLayerRow[] = [];
  for (const id of tableOrder) {
    const row = map.get(id);
    if (row) ordered.push(row);
  }
  for (const row of rows) {
    if (!ordered.some((r) => r.tableId === row.tableId)) {
      ordered.push(row);
    }
  }
  return ordered;
}

export function moveTableInOrder(
  order: string[],
  tableId: string,
  direction: "up" | "down"
): string[] {
  const idx = order.indexOf(tableId);
  if (idx < 0) return order;
  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= order.length) return order;
  const next = [...order];
  [next[idx], next[swap]] = [next[swap]!, next[idx]!];
  return next;
}
