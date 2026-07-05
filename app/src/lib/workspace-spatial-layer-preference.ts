const STORAGE_KEY_PREFIX = "spatial-pm-map-layers-v1:";

export type MapLayerVisibilityByTable = Record<string, boolean>;

export function mapLayerVisibilityKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

/** Baca preferensi on/off per `table_id`; key tidak ada = layer **on** (default). */
export function loadMapLayerVisibility(
  projectId: string
): MapLayerVisibilityByTable {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(mapLayerVisibilityKey(projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: MapLayerVisibilityByTable = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveMapLayerVisibility(
  projectId: string,
  visibility: MapLayerVisibilityByTable
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      mapLayerVisibilityKey(projectId),
      JSON.stringify(visibility)
    );
  } catch {
    /* quota / private mode */
  }
}

export function isMapTableLayerVisible(
  visibility: MapLayerVisibilityByTable,
  tableId: string
): boolean {
  return visibility[tableId] !== false;
}
