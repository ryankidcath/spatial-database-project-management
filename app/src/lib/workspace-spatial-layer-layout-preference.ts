const LAYOUT_KEY_PREFIX = "spatial-pm-layer-layout-v1:";
const FILTER_SYNC_KEY_PREFIX = "spatial-pm-filter-sync-v1:";

export type SpatialLayerGroup = {
  id: string;
  name: string;
  collapsed?: boolean;
};

export type SpatialLayerLayoutPrefs = {
  /** Urutan flat semua table_id (termasuk dalam grup). */
  tableOrder: string[];
  groups: SpatialLayerGroup[];
  /** table_id → group_id; null / missing = tanpa grup. */
  tableGroupId: Record<string, string | null>;
};

const EMPTY_LAYOUT: SpatialLayerLayoutPrefs = {
  tableOrder: [],
  groups: [],
  tableGroupId: {},
};

function layoutKey(projectId: string): string {
  return `${LAYOUT_KEY_PREFIX}${projectId}`;
}

export function loadSpatialLayerLayout(
  projectId: string
): SpatialLayerLayoutPrefs {
  if (typeof window === "undefined") return { ...EMPTY_LAYOUT };
  try {
    const raw = localStorage.getItem(layoutKey(projectId));
    if (!raw) return { ...EMPTY_LAYOUT };
    const parsed = JSON.parse(raw) as Partial<SpatialLayerLayoutPrefs>;
    return {
      tableOrder: Array.isArray(parsed.tableOrder)
        ? parsed.tableOrder.filter((x) => typeof x === "string")
        : [],
      groups: Array.isArray(parsed.groups)
        ? parsed.groups.filter(
            (g) =>
              g &&
              typeof g === "object" &&
              typeof g.id === "string" &&
              typeof g.name === "string"
          )
        : [],
      tableGroupId:
        parsed.tableGroupId && typeof parsed.tableGroupId === "object"
          ? Object.fromEntries(
              Object.entries(parsed.tableGroupId).filter(
                ([, v]) => v === null || typeof v === "string"
              )
            )
          : {},
    };
  } catch {
    return { ...EMPTY_LAYOUT };
  }
}

export function saveSpatialLayerLayout(
  projectId: string,
  layout: SpatialLayerLayoutPrefs
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(layoutKey(projectId), JSON.stringify(layout));
  } catch {
    /* quota */
  }
}

export function createSpatialLayerGroupId(): string {
  return `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Susun table_id sesuai order tersimpan + append tabel baru. */
export function mergeTableOrder(
  savedOrder: string[],
  allTableIds: string[]
): string[] {
  const set = new Set(allTableIds);
  const ordered = savedOrder.filter((id) => set.has(id));
  for (const id of allTableIds) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

export function loadSpatialFilterSyncEnabled(projectId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(`${FILTER_SYNC_KEY_PREFIX}${projectId}`);
    if (raw === "0" || raw === "false") return false;
    return true;
  } catch {
    return true;
  }
}

export function saveSpatialFilterSyncEnabled(
  projectId: string,
  enabled: boolean
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${FILTER_SYNC_KEY_PREFIX}${projectId}`,
      enabled ? "1" : "0"
    );
  } catch {
    /* quota */
  }
}
