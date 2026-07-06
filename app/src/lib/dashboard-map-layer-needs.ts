import type { DashboardWidget } from "@/app/virtual-dashboard-types";
import type { VirtualColumnRow } from "@/app/virtual-table-types";
import { resolveVirtualColumnSlug } from "@/lib/dashboard-column-resolve";

export type DashboardMapLayerSpec = {
  tableId: string;
  geometryColumn: string;
};

function resolveGeometryColumn(
  cols: VirtualColumnRow[],
  preferred?: string
): string | null {
  if (preferred?.trim()) {
    return resolveVirtualColumnSlug(cols, preferred.trim());
  }
  const geo = cols.find((c) => c.data_type === "geometry");
  return geo?.slug ?? null;
}

function addSpec(
  map: Map<string, DashboardMapLayerSpec>,
  tableId: string,
  geometryColumn: string | null
) {
  if (!tableId || !geometryColumn) return;
  if (!map.has(tableId)) {
    map.set(tableId, { tableId, geometryColumn });
  }
}

/** Kumpulkan kebutuhan lapisan peta dari widget dashboard (Fase B). */
export function mapLayerSpecsFromWidgets(
  widgets: DashboardWidget[],
  columnsByTableId: Map<string, VirtualColumnRow[]>
): DashboardMapLayerSpec[] {
  const specs = new Map<string, DashboardMapLayerSpec>();

  for (const w of widgets) {
    const cfg = w.config as Record<string, string | undefined>;

    if (w.type === "mini_map") {
      const tableId = cfg.table_id ?? "";
      const cols = columnsByTableId.get(tableId) ?? [];
      addSpec(
        specs,
        tableId,
        resolveGeometryColumn(cols, cfg.geometry_column)
      );
      const tableId2 = cfg.layer2_table_id ?? "";
      if (tableId2) {
        const cols2 = columnsByTableId.get(tableId2) ?? [];
        addSpec(
          specs,
          tableId2,
          resolveGeometryColumn(cols2, cfg.layer2_geometry_column)
        );
      }
    }

    if (w.type === "spatial_summary") {
      const tableId = cfg.table_id ?? "";
      const cols = columnsByTableId.get(tableId) ?? [];
      addSpec(
        specs,
        tableId,
        resolveGeometryColumn(cols, cfg.geometry_column)
      );
    }
  }

  return [...specs.values()];
}
