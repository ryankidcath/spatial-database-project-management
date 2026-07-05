import type { VirtualColumnRow, VirtualDataRow } from "@/app/virtual-table-types";
import type { Entity360GeometryHolder } from "@/lib/project-entity-360-profile";

export type FindOnMapRelationPath = {
  relationColumnSlug: string;
  relationColumnLabel: string;
  targetTableId: string;
};

export type FindOnMapTarget = {
  tableId: string;
  rowIds: string[];
  viaRelation: boolean;
};

export function buildVirtualColumnsByTableId(
  columns: VirtualColumnRow[]
): Map<string, VirtualColumnRow[]> {
  const map = new Map<string, VirtualColumnRow[]>();
  for (const col of columns) {
    const list = map.get(col.table_id) ?? [];
    list.push(col);
    map.set(col.table_id, list);
  }
  for (const [tableId, cols] of map) {
    map.set(
      tableId,
      [...cols].sort((a, b) => a.position - b.position)
    );
  }
  return map;
}

export function tableHasGeometryColumn(columns: VirtualColumnRow[]): boolean {
  return columns.some((c) => c.data_type === "geometry");
}

export type FindOnMapProfileOptions = {
  sourceTableId?: string;
  geometryHolder?: Entity360GeometryHolder | null;
};

/** Relasi ke tabel geometry — G-H2; profil G-H4 / GQ-H5 prioritas eksplisit. */
export function pickFindOnMapRelationPath(
  sourceColumns: VirtualColumnRow[],
  columnsByTableId: Map<string, VirtualColumnRow[]>,
  profileOptions?: FindOnMapProfileOptions
): FindOnMapRelationPath | null {
  const geometryHolder = profileOptions?.geometryHolder;
  if (geometryHolder?.relation_column_slug && geometryHolder.table_id) {
    const col = sourceColumns.find(
      (c) =>
        c.data_type === "relation" &&
        c.slug === geometryHolder.relation_column_slug
    );
    if (col) {
      const targetTableId = col.config?.target_table_id as string | undefined;
      if (targetTableId === geometryHolder.table_id) {
        const targetCols = columnsByTableId.get(targetTableId);
        if (targetCols && tableHasGeometryColumn(targetCols)) {
          return {
            relationColumnSlug: col.slug,
            relationColumnLabel: col.display_name,
            targetTableId,
          };
        }
      }
    }
  }

  const relationCols = sourceColumns
    .filter((c) => c.data_type === "relation")
    .sort((a, b) => a.position - b.position);

  for (const col of relationCols) {
    const targetTableId = col.config?.target_table_id as string | undefined;
    if (!targetTableId) continue;
    const targetCols = columnsByTableId.get(targetTableId);
    if (!targetCols || !tableHasGeometryColumn(targetCols)) continue;
    return {
      relationColumnSlug: col.slug,
      relationColumnLabel: col.display_name,
      targetTableId,
    };
  }
  return null;
}

export function relationIdsFromPayload(
  payload: Record<string, unknown>,
  relationColumnSlug: string
): string[] {
  const val = payload[relationColumnSlug];
  if (typeof val === "string" && val) return [val];
  if (Array.isArray(val)) {
    return val.filter((v): v is string => typeof v === "string" && Boolean(v));
  }
  return [];
}

export function resolveFindOnMapTarget(args: {
  sourceTableId: string;
  sourceColumns: VirtualColumnRow[];
  sourceRows: Pick<VirtualDataRow, "id" | "payload">[];
  columnsByTableId: Map<string, VirtualColumnRow[]>;
  findOnMapProfile?: FindOnMapProfileOptions;
}): FindOnMapTarget | null {
  const {
    sourceTableId,
    sourceColumns,
    sourceRows,
    columnsByTableId,
    findOnMapProfile,
  } = args;

  const geoCol = sourceColumns.find((c) => c.data_type === "geometry");
  if (geoCol) {
    const rowIds = sourceRows
      .filter((row) => {
        const geo = row.payload[geoCol.slug];
        return geo != null && geo !== "" && typeof geo === "object";
      })
      .map((row) => row.id);
    if (rowIds.length === 0) return null;
    return { tableId: sourceTableId, rowIds, viaRelation: false };
  }

  const relationPath = pickFindOnMapRelationPath(sourceColumns, columnsByTableId, {
    sourceTableId,
    geometryHolder: findOnMapProfile?.geometryHolder,
  });
  if (!relationPath) return null;

  const rowIds: string[] = [];
  const seen = new Set<string>();
  for (const row of sourceRows) {
    for (const id of relationIdsFromPayload(
      row.payload,
      relationPath.relationColumnSlug
    )) {
      if (!seen.has(id)) {
        seen.add(id);
        rowIds.push(id);
      }
    }
  }
  if (rowIds.length === 0) return null;

  return {
    tableId: relationPath.targetTableId,
    rowIds,
    viaRelation: true,
  };
}
