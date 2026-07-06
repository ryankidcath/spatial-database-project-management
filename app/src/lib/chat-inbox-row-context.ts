import type { ChatInboxEntry } from "@/app/workspace-chat-inbox-types";
import type { VirtualTableRow } from "@/app/virtual-table-types";

export type VirtualRowChatContext = {
  tableId: string;
  pathSegments: string[];
  rowPayload: Record<string, unknown>;
  relationLabels: Record<string, string>;
};

/** Data dari RPC inbox — cukup untuk judul breadcrumb tanpa re-query virtual_rows. */
export type VirtualRowChatContextSeed = {
  virtualRowId: string;
  virtualTableId: string;
  tableDisplayName: string;
  rowPayload: Record<string, unknown>;
};

export type ChatInboxActiveRowRoomLike = {
  virtualRowId: string;
  virtualTableId: string;
  tableDisplayName: string;
  unreadCount: number;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  rowPayload: Record<string, unknown>;
};

export function activeRowRoomsToContextSeeds(
  rows: ChatInboxActiveRowRoomLike[]
): VirtualRowChatContextSeed[] {
  const seen = new Set<string>();
  const seeds: VirtualRowChatContextSeed[] = [];
  for (const row of rows) {
    if (!row.virtualRowId || seen.has(row.virtualRowId)) continue;
    seen.add(row.virtualRowId);
    seeds.push({
      virtualRowId: row.virtualRowId,
      virtualTableId: row.virtualTableId,
      tableDisplayName: row.tableDisplayName,
      rowPayload: row.rowPayload ?? {},
    });
  }
  return seeds;
}

export function buildChatInboxEntriesFromActiveRows(
  rows: ChatInboxActiveRowRoomLike[],
  ctxByRowId: Record<string, VirtualRowChatContext>,
  organizationId: string,
  tablesInScope: VirtualTableRow[]
): ChatInboxEntry[] {
  return rows.map((row) => {
    const ctx = ctxByRowId[row.virtualRowId];
    const table = tablesInScope.find((t) => t.id === row.virtualTableId);
    const rowTitle =
      ctx?.pathSegments[ctx.pathSegments.length - 1] ?? "Baris";
    return {
      key: `row:${row.virtualRowId}`,
      kind: "virtual_row" as const,
      scopeType: "virtual_row" as const,
      title: rowTitle,
      subtitle: row.tableDisplayName,
      unreadCount: row.unreadCount,
      lastActivityAt: row.lastMessageAt,
      lastMessagePreview: row.lastMessagePreview,
      organizationId,
      projectId: table?.project_id ?? null,
      virtualTableId: null,
      virtualRowId: row.virtualRowId,
      tableIdForRow: row.virtualTableId,
      pathSegments: ctx?.pathSegments,
      rowPayload: ctx?.rowPayload ?? row.rowPayload,
    };
  });
}
