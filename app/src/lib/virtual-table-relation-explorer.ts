import type { VirtualColumnRow } from "@/app/virtual-table-types";
import { relationIdsFromPayload } from "@/lib/virtual-table-find-on-map";

export type RelationExplorerLink = {
  rowId: string;
  label: string;
  tableId: string;
  tableName: string;
  columnSlug: string;
  columnDisplayName: string;
  direction: "outbound" | "inbound";
};

export type RelationExplorerGroup = {
  tableId: string;
  tableName: string;
  columnSlug: string;
  columnDisplayName: string;
  direction: "outbound" | "inbound";
  links: { rowId: string; label: string }[];
};

export function buildOutboundRelationGroups(args: {
  columns: VirtualColumnRow[];
  rowPayload: Record<string, unknown>;
  relationLabels: Record<string, string>;
  tableNameById: Map<string, string>;
}): RelationExplorerGroup[] {
  const groups: RelationExplorerGroup[] = [];

  for (const col of [...args.columns]
    .filter((c) => c.data_type === "relation")
    .sort((a, b) => a.position - b.position)) {
    const targetTableId = col.config?.target_table_id as string | undefined;
    if (!targetTableId) continue;

    const ids = relationIdsFromPayload(args.rowPayload, col.slug);
    if (ids.length === 0) continue;

    groups.push({
      tableId: targetTableId,
      tableName:
        args.tableNameById.get(targetTableId) ?? targetTableId.slice(0, 8),
      columnSlug: col.slug,
      columnDisplayName: col.display_name,
      direction: "outbound",
      links: ids.map((id) => ({
        rowId: id,
        label: args.relationLabels[id] ?? id.slice(0, 8),
      })),
    });
  }

  return groups;
}

export function flattenRelationExplorerGroups(
  groups: RelationExplorerGroup[]
): RelationExplorerLink[] {
  const out: RelationExplorerLink[] = [];
  for (const group of groups) {
    for (const link of group.links) {
      out.push({
        ...link,
        tableId: group.tableId,
        tableName: group.tableName,
        columnSlug: group.columnSlug,
        columnDisplayName: group.columnDisplayName,
        direction: group.direction,
      });
    }
  }
  return out;
}

export function hasRelationExplorerContent(
  outbound: RelationExplorerGroup[],
  inbound: RelationExplorerGroup[]
): boolean {
  return (
    outbound.some((g) => g.links.length > 0) ||
    inbound.some((g) => g.links.length > 0)
  );
}
