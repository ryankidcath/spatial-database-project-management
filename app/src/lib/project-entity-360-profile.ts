/** Profil entitas G-H4 — konfigurasi per project (kolom `projects.entity_360_profile`). */

export type Entity360GeometryHolder = {
  table_id: string;
  relation_column_slug: string;
};

export type Entity360PanelSectionSpec = {
  table_id: string;
  /** Filter section inbound/outbound; kosong = keduanya boleh. */
  direction?: "inbound" | "outbound";
  relation_column_slug?: string;
};

export type ProjectEntity360Profile = {
  /** Tabel hub nominatif (pola A/B); opsional. */
  anchor_table_id?: string | null;
  /** Find-on-map pola B: relasi hub → tabel geom (GQ-H5). */
  geometry_holder?: Entity360GeometryHolder | null;
  /** Urutan & filter section panel 360° (selain anchor). Kosong = otomatis 1 hop. */
  panel_sections?: Entity360PanelSectionSpec[];
};

export const EMPTY_ENTITY_360_PROFILE: ProjectEntity360Profile = {};

/** Profil punya override manual (bukan deteksi otomatis). */
export function isEntity360ProfileCustomized(
  profile: ProjectEntity360Profile | null | undefined
): boolean {
  if (!profile) return false;
  const hasGeom =
    Boolean(profile.geometry_holder?.table_id) &&
    Boolean(profile.geometry_holder?.relation_column_slug);
  const hasSections = (profile.panel_sections?.length ?? 0) > 0;
  return hasGeom || hasSections;
}

export type GeometryPathOption = {
  key: string;
  sourceTableId: string;
  relationColumnSlug: string;
  targetTableId: string;
  /** Label ramah pengguna, mis. «Daftar Bidang → Gambar (kolom Gambar)». */
  label: string;
};

export function geometryPathOptionKey(
  sourceTableId: string,
  relationColumnSlug: string
): string {
  return `${sourceTableId}:${relationColumnSlug}`;
}

/** Semua jalur hub → geom di project (untuk dropdown lanjutan). */
export function buildGeometryPathOptions(args: {
  projectTables: { id: string; display_name: string }[];
  columnsByTableId: Map<string, { slug: string; display_name: string; data_type: string; position: number; config?: Record<string, unknown> | null }[]>;
  tableHasGeometry: (tableId: string) => boolean;
}): GeometryPathOption[] {
  const { projectTables, columnsByTableId, tableHasGeometry } = args;
  const options: GeometryPathOption[] = [];

  for (const table of projectTables) {
    if (tableHasGeometry(table.id)) continue;
    const cols = [...(columnsByTableId.get(table.id) ?? [])].sort(
      (a, b) => a.position - b.position
    );
    for (const col of cols) {
      if (col.data_type !== "relation") continue;
      const targetId = col.config?.target_table_id as string | undefined;
      if (!targetId || !tableHasGeometry(targetId)) continue;
      const targetName =
        projectTables.find((t) => t.id === targetId)?.display_name ??
        targetId.slice(0, 8);
      options.push({
        key: geometryPathOptionKey(table.id, col.slug),
        sourceTableId: table.id,
        relationColumnSlug: col.slug,
        targetTableId: targetId,
        label: `${table.display_name} → ${targetName} (kolom ${col.display_name})`,
      });
    }
  }
  return options;
}

export function geometryPathKeyFromProfile(
  profile: ProjectEntity360Profile,
  options: GeometryPathOption[] = []
): string {
  const gh = profile.geometry_holder;
  if (!gh?.relation_column_slug || !gh.table_id) return "";
  if (profile.anchor_table_id) {
    return geometryPathOptionKey(
      profile.anchor_table_id,
      gh.relation_column_slug
    );
  }
  const match = options.find(
    (o) =>
      o.relationColumnSlug === gh.relation_column_slug &&
      o.targetTableId === gh.table_id
  );
  return match?.key ?? "";
}

export function profileFromGeometryPathKey(
  key: string,
  options: GeometryPathOption[]
): Pick<ProjectEntity360Profile, "anchor_table_id" | "geometry_holder"> {
  if (!key) {
    return { anchor_table_id: null, geometry_holder: null };
  }
  const opt = options.find((o) => o.key === key);
  if (!opt) {
    return { anchor_table_id: null, geometry_holder: null };
  }
  return {
    anchor_table_id: opt.sourceTableId,
    geometry_holder: {
      table_id: opt.targetTableId,
      relation_column_slug: opt.relationColumnSlug,
    },
  };
}

/** Urutan tabel untuk panel (tanpa arah inbound/outbound). */
export function panelTableIdsFromProfile(
  profile: ProjectEntity360Profile
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const s of profile.panel_sections ?? []) {
    if (!s.table_id || seen.has(s.table_id)) continue;
    seen.add(s.table_id);
    ids.push(s.table_id);
  }
  return ids;
}

export function profileWithPanelTableIds(
  profile: ProjectEntity360Profile,
  tableIds: string[] | null
): ProjectEntity360Profile {
  if (!tableIds || tableIds.length === 0) {
    return { ...profile, panel_sections: [] };
  }
  return {
    ...profile,
    panel_sections: tableIds.map((table_id) => ({ table_id })),
  };
}

export function parseProjectEntity360Profile(
  raw: unknown
): ProjectEntity360Profile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_ENTITY_360_PROFILE };
  }
  const o = raw as Record<string, unknown>;

  let geometry_holder: Entity360GeometryHolder | null = null;
  if (o.geometry_holder && typeof o.geometry_holder === "object") {
    const gh = o.geometry_holder as Record<string, unknown>;
    const table_id = typeof gh.table_id === "string" ? gh.table_id.trim() : "";
    const relation_column_slug =
      typeof gh.relation_column_slug === "string"
        ? gh.relation_column_slug.trim()
        : "";
    if (table_id && relation_column_slug) {
      geometry_holder = { table_id, relation_column_slug };
    }
  }

  const panel_sections: Entity360PanelSectionSpec[] = [];
  if (Array.isArray(o.panel_sections)) {
    for (const item of o.panel_sections) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const table_id =
        typeof row.table_id === "string" ? row.table_id.trim() : "";
      if (!table_id) continue;
      const direction =
        row.direction === "inbound" || row.direction === "outbound"
          ? row.direction
          : undefined;
      const relation_column_slug =
        typeof row.relation_column_slug === "string"
          ? row.relation_column_slug.trim()
          : undefined;
      panel_sections.push({
        table_id,
        direction,
        relation_column_slug: relation_column_slug || undefined,
      });
    }
  }

  const anchor_table_id =
    typeof o.anchor_table_id === "string" && o.anchor_table_id.trim()
      ? o.anchor_table_id.trim()
      : null;

  return {
    anchor_table_id,
    geometry_holder,
    panel_sections,
  };
}

export function serializeProjectEntity360Profile(
  profile: ProjectEntity360Profile
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (profile.anchor_table_id) {
    out.anchor_table_id = profile.anchor_table_id;
  }
  if (profile.geometry_holder) {
    out.geometry_holder = profile.geometry_holder;
  }
  if (profile.panel_sections && profile.panel_sections.length > 0) {
    out.panel_sections = profile.panel_sections;
  }
  return out;
}
