import type { MapFootprint } from "@/app/workspace-map";
import { fetchVirtualTableRowsForMap } from "@/lib/workspace-map-rows-fetch";
import {
  resolveRelationLabelsAction,
} from "@/app/virtual-table-actions";
import type {
  VirtualColumnRow,
  VirtualDataRow,
  VirtualTableRow,
} from "@/app/virtual-table-types";
import { buildChatRowPathSegments } from "@/lib/chat-row-context";
import { rowMatchesVirtualViewFilters } from "@/lib/virtual-table-row-filters";
import {
  buildVirtualTableMapPopupProperties,
  collectRelationIdsFromVirtualPayloads,
  columnSlugsNeededForMapLayers,
  pickMapRowTitle,
  type VirtualColumnForMapPopup,
} from "@/lib/virtual-table-map-popup";
import { viewSessionFilters } from "@/lib/virtual-table-view-session";

export type BuildSpatialGeometryLayersInput = {
  vtablesWithGeometry: VirtualTableRow[];
  virtualColumns: VirtualColumnRow[];
  filterSyncEnabled: boolean;
  memberNameByUserId: Map<string, string>;
  projectName: string | null;
};

export type BuildSpatialGeometryLayersResult = {
  layers: MapFootprint[];
  totalCounts: Map<string, number>;
};

function tableColumnsForMap(
  virtualColumns: VirtualColumnRow[],
  tableId: string
): VirtualColumnForMapPopup[] {
  return virtualColumns
    .filter((c) => c.table_id === tableId)
    .map((c) => ({
      slug: c.slug,
      display_name: c.display_name,
      data_type: c.data_type,
      position: c.position,
    }));
}

async function buildLayersForTable(
  vt: VirtualTableRow,
  input: BuildSpatialGeometryLayersInput
): Promise<{ layers: MapFootprint[]; featureCount: number }> {
  const tableCols = tableColumnsForMap(input.virtualColumns, vt.id);
  const geoCols = tableCols.filter((c) => c.data_type === "geometry");
  const viewFilters = input.filterSyncEnabled ? viewSessionFilters(vt.id) : [];
  const mapColumnSlugs = columnSlugsNeededForMapLayers(tableCols, viewFilters);

  const result = await fetchVirtualTableRowsForMap(vt.id, mapColumnSlugs);
  if (result.error) {
    return { layers: [], featureCount: 0 };
  }

  const rowPayloads = result.rows.map((row) => ({
    payload:
      ((row as Record<string, unknown>).payload as Record<string, unknown> | null) ??
      {},
  }));
  const relationIds = collectRelationIdsFromVirtualPayloads(
    rowPayloads,
    tableCols
  );
  let relationLabels: Record<string, string> = {};
  if (relationIds.length > 0) {
    const resolved = await resolveRelationLabelsAction(relationIds);
    if (!resolved.error) relationLabels = resolved.labels;
  }

  const resolveFilterLabel = (column: string, val: unknown) => {
    const col = tableCols.find((c) => c.slug === column);
    if (!col) return String(val ?? "");
    if (col.data_type === "relation" && val != null && val !== "") {
      return relationLabels[String(val)] ?? String(val);
    }
    if (col.data_type === "user" && val != null && val !== "") {
      return input.memberNameByUserId.get(String(val)) ?? String(val);
    }
    return String(val ?? "");
  };

  const layers: MapFootprint[] = [];
  let featureCount = 0;

  for (const row of result.rows) {
    const payload = (row as Record<string, unknown>).payload as Record<
      string,
      unknown
    > | null;
    if (!payload) continue;
    const passesFilter =
      viewFilters.length === 0 ||
      rowMatchesVirtualViewFilters(
        row as VirtualDataRow,
        viewFilters,
        resolveFilterLabel
      );
    const rowId = (row as Record<string, unknown>).id as string;
    const rowTitle = pickMapRowTitle(payload, tableCols, relationLabels, rowId);
    const chatPathSegments = buildChatRowPathSegments({
      projectName: input.projectName,
      tableDisplayName: vt.display_name,
      rowLabel: rowTitle,
    });

    for (const gc of geoCols) {
      const geo = payload[gc.slug];
      if (!geo || typeof geo !== "object") continue;
      featureCount += 1;
      if (!passesFilter) continue;

      layers.push({
        id: `vtable:${rowId}:${gc.slug}`,
        label: `${vt.display_name}: ${rowTitle}`,
        geojson: geo,
        popupProperties: buildVirtualTableMapPopupProperties(
          vt.display_name,
          tableCols,
          payload,
          relationLabels,
          input.memberNameByUserId,
          {
            skipGeometrySlug: gc.slug,
            rowTitle,
            virtualRowId: rowId,
            virtualTableId: vt.id,
            projectName: input.projectName,
            chatPathSegments,
          }
        ),
        layerKind: "virtual_table",
        virtualTableId: vt.id,
        virtualRowId: rowId,
        rowPayload: payload,
        relationLabels,
        chatPathSegments,
      });
    }
  }

  return { layers, featureCount };
}

/** Muat lapisan geometri virtual table — fetch paralel per tabel. */
export async function buildSpatialGeometryLayers(
  input: BuildSpatialGeometryLayersInput
): Promise<BuildSpatialGeometryLayersResult> {
  const perTable = await Promise.all(
    input.vtablesWithGeometry.map((vt) => buildLayersForTable(vt, input))
  );

  const layers: MapFootprint[] = [];
  const totalCounts = new Map<string, number>();

  perTable.forEach((chunk, index) => {
    const vt = input.vtablesWithGeometry[index]!;
    if (chunk.featureCount > 0) {
      totalCounts.set(vt.id, chunk.featureCount);
    }
    layers.push(...chunk.layers);
  });

  return { layers, totalCounts };
}

export function buildSpatialViewFiltersSig(
  vtablesWithGeometry: VirtualTableRow[],
  filterSyncEnabled: boolean
): string {
  if (!filterSyncEnabled) return "";
  return vtablesWithGeometry
    .map((vt) => `${vt.id}:${JSON.stringify(viewSessionFilters(vt.id))}`)
    .join("|");
}
