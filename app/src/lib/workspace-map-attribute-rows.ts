import type { MapFootprint } from "@/app/workspace-map";

export type MapAttributeRow = {
  footprintId: string;
  label: string;
  layerLabel: string;
  virtualTableId?: string;
  virtualRowId?: string;
  rowPayload?: Record<string, unknown>;
  relationLabels?: Record<string, string>;
  chatPathSegments?: string[];
};

export function buildMapAttributeRows(
  footprints: MapFootprint[],
  layerNameByTableId: Record<string, string>
): MapAttributeRow[] {
  return footprints
    .filter((fp) => fp.layerKind === "virtual_table" && fp.virtualRowId)
    .map((fp) => ({
      footprintId: fp.id,
      label: fp.label,
      layerLabel:
        (fp.virtualTableId && layerNameByTableId[fp.virtualTableId]) ||
        "Lapisan",
      virtualTableId: fp.virtualTableId,
      virtualRowId: fp.virtualRowId,
      rowPayload: fp.rowPayload,
      relationLabels: fp.relationLabels,
      chatPathSegments: fp.chatPathSegments,
    }));
}
