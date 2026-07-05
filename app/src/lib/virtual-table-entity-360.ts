import type { VirtualColumnRow } from "@/app/virtual-table-types";
import type {
  Entity360PanelSectionSpec,
  ProjectEntity360Profile,
} from "@/lib/project-entity-360-profile";
import { buildOutboundRelationGroups } from "@/lib/virtual-table-relation-explorer";
import { pickMapRowTitle } from "@/lib/virtual-table-map-popup";

export type Entity360SectionRow = {
  id: string;
  label: string;
  payload: Record<string, unknown>;
};

export type Entity360Section = {
  tableId: string;
  tableName: string;
  direction: "anchor" | "outbound" | "inbound";
  relationColumnSlug?: string;
  relationColumnDisplayName?: string;
  rows: Entity360SectionRow[];
};

export type Entity360CachedPanel = {
  sections: Entity360Section[];
  relationLabels: Record<string, string>;
};

const entity360PanelCache = new Map<string, Entity360CachedPanel>();

export function entity360CacheKey(tableId: string, rowId: string): string {
  return `${tableId}:${rowId}`;
}

export function readEntity360Cache(
  tableId: string,
  rowId: string
): Entity360CachedPanel | null {
  return entity360PanelCache.get(entity360CacheKey(tableId, rowId)) ?? null;
}

export function writeEntity360Cache(
  tableId: string,
  rowId: string,
  value: Entity360CachedPanel
): void {
  entity360PanelCache.set(entity360CacheKey(tableId, rowId), value);
  if (entity360PanelCache.size > 40) {
    const first = entity360PanelCache.keys().next().value;
    if (first) entity360PanelCache.delete(first);
  }
}

/** Panel instan dari payload klik peta (anchor + label relasi keluar). */
export function buildEntity360SeedSections(args: {
  anchorTableId: string;
  anchorTableName: string;
  anchorRowId: string;
  anchorPayload: Record<string, unknown>;
  anchorColumns: VirtualColumnRow[];
  relationLabels: Record<string, string>;
  tableNameById: Map<string, string>;
}): Entity360Section[] {
  const anchorLabel = pickMapRowTitle(
    args.anchorPayload,
    args.anchorColumns.map((c) => ({
      slug: c.slug,
      display_name: c.display_name,
      data_type: c.data_type,
      position: c.position,
    })),
    args.relationLabels,
    args.anchorRowId
  );

  const sections: Entity360Section[] = [
    {
      tableId: args.anchorTableId,
      tableName: args.anchorTableName,
      direction: "anchor",
      rows: [
        {
          id: args.anchorRowId,
          label: anchorLabel,
          payload: args.anchorPayload,
        },
      ],
    },
  ];

  for (const group of buildOutboundRelationGroups({
    columns: args.anchorColumns,
    rowPayload: args.anchorPayload,
    relationLabels: args.relationLabels,
    tableNameById: args.tableNameById,
  })) {
    sections.push({
      tableId: group.tableId,
      tableName: group.tableName,
      direction: "outbound",
      relationColumnSlug: group.columnSlug,
      relationColumnDisplayName: group.columnDisplayName,
      rows: group.links.map((link) => ({
        id: link.rowId,
        label: link.label,
        payload: {},
      })),
    });
  }

  return sections;
}

function sectionKey(section: Entity360Section): string {
  return `${section.direction}:${section.tableId}:${section.relationColumnSlug ?? ""}`;
}

function matchesPanelSectionSpec(
  section: Entity360Section,
  spec: Entity360PanelSectionSpec
): boolean {
  if (section.tableId !== spec.table_id) return false;
  if (spec.direction && section.direction !== spec.direction) return false;
  if (
    spec.relation_column_slug &&
    section.relationColumnSlug !== spec.relation_column_slug
  ) {
    return false;
  }
  return true;
}

/** Terapkan urutan/filter section dari profil G-H4; kosong = otomatis (outbound lalu inbound). */
export function applyEntity360PanelProfile(
  sections: Entity360Section[],
  profile: ProjectEntity360Profile | null | undefined
): Entity360Section[] {
  const anchor = sections.find((s) => s.direction === "anchor");
  const related = sections.filter((s) => s.direction !== "anchor");
  const specs =
    profile?.panel_sections?.filter((s) => s.table_id.trim()) ?? [];

  if (specs.length === 0) {
    const ordered = anchor ? [anchor] : [];
    ordered.push(...related.filter((s) => s.direction === "outbound"));
    ordered.push(...related.filter((s) => s.direction === "inbound"));
    return ordered;
  }

  const ordered: Entity360Section[] = anchor ? [anchor] : [];
  const used = new Set<string>();

  for (const spec of specs) {
    for (const section of related) {
      const key = sectionKey(section);
      if (used.has(key)) continue;
      if (matchesPanelSectionSpec(section, spec)) {
        ordered.push(section);
        used.add(key);
      }
    }
  }

  return ordered;
}

export function clearEntity360PanelCache(): void {
  entity360PanelCache.clear();
}
