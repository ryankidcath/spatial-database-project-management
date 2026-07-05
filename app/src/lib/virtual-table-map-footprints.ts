import { buildChatRowPathSegments } from "@/lib/chat-row-context";
import {
  buildVirtualTableMapPopupProperties,
  pickMapRowTitle,
  type VirtualColumnForMapPopup,
} from "@/lib/virtual-table-map-popup";
import type { MapFootprint } from "@/app/workspace-map";
import type {
  VirtualColumnRow,
  VirtualDataRow,
  VirtualTableRow,
} from "@/app/virtual-table-types";

export function buildVirtualTableRowFootprints(args: {
  table: Pick<VirtualTableRow, "id" | "display_name">;
  columns: VirtualColumnRow[];
  rows: VirtualDataRow[];
  relationLabels: Record<string, string>;
  memberNameByUserId: Map<string, string>;
  projectName?: string | null;
  geometryColumnSlug?: string | null;
}): MapFootprint[] {
  const {
    table,
    columns,
    rows,
    relationLabels,
    memberNameByUserId,
    projectName = null,
    geometryColumnSlug,
  } = args;

  const tableCols: VirtualColumnForMapPopup[] = columns.map((c) => ({
    slug: c.slug,
    display_name: c.display_name,
    data_type: c.data_type,
    position: c.position,
  }));

  const geoCols = geometryColumnSlug
    ? tableCols.filter(
        (c) => c.data_type === "geometry" && c.slug === geometryColumnSlug
      )
    : tableCols.filter((c) => c.data_type === "geometry");

  const layers: MapFootprint[] = [];

  for (const row of rows) {
    const payload = row.payload ?? {};
    const rowTitle = pickMapRowTitle(
      payload,
      tableCols,
      relationLabels,
      row.id
    );
    const chatPathSegments = buildChatRowPathSegments({
      projectName,
      tableDisplayName: table.display_name,
      rowLabel: rowTitle,
    });

    for (const gc of geoCols) {
      const geo = payload[gc.slug];
      if (!geo || typeof geo !== "object") continue;
      layers.push({
        id: `vtable:${row.id}:${gc.slug}`,
        label: `${table.display_name}: ${rowTitle}`,
        geojson: geo,
        popupProperties: buildVirtualTableMapPopupProperties(
          table.display_name,
          tableCols,
          payload,
          relationLabels,
          memberNameByUserId,
          {
            skipGeometrySlug: gc.slug,
            rowTitle,
            virtualRowId: row.id,
            virtualTableId: table.id,
            projectName,
            chatPathSegments,
          }
        ),
        layerKind: "virtual_table",
        virtualTableId: table.id,
        virtualRowId: row.id,
        rowPayload: payload,
        relationLabels,
        chatPathSegments,
      });
    }
  }

  return layers;
}
