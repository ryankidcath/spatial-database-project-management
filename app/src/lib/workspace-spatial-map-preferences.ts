import type { WorkspaceBasemapId } from "./workspace-map-basemaps";

const OPACITY_KEY_PREFIX = "spatial-pm-map-opacity-v1:";
const EXTENT_KEY_PREFIX = "spatial-pm-map-extent-v1:";
const UI_KEY = "spatial-pm-map-ui-v1";

export type MapLayerOpacityByTable = Record<string, number>;

export type MapExtentBookmark = {
  lat: number;
  lng: number;
  zoom: number;
};

export type MapUiPreferences = {
  basemapId: WorkspaceBasemapId;
  showFeatureLabels: boolean;
  coordinateDisplay: CoordinateDisplayMode;
};

export type CoordinateDisplayMode = "latlng" | "utm";

const DEFAULT_UI: MapUiPreferences = {
  basemapId: "osm",
  showFeatureLabels: false,
  coordinateDisplay: "latlng",
};

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0.1, value));
}

export function loadMapLayerOpacity(projectId: string): MapLayerOpacityByTable {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`${OPACITY_KEY_PREFIX}${projectId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: MapLayerOpacityByTable = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number") out[k] = clampOpacity(v);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveMapLayerOpacity(
  projectId: string,
  opacity: MapLayerOpacityByTable
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${OPACITY_KEY_PREFIX}${projectId}`,
      JSON.stringify(opacity)
    );
  } catch {
    /* quota */
  }
}

export function resolveMapLayerOpacity(
  opacityMap: MapLayerOpacityByTable,
  tableId: string
): number {
  const v = opacityMap[tableId];
  return v == null ? 1 : clampOpacity(v);
}

export function loadMapExtentBookmark(
  projectId: string
): MapExtentBookmark | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${EXTENT_KEY_PREFIX}${projectId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const { lat, lng, zoom } = parsed as Record<string, unknown>;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      typeof zoom !== "number"
    ) {
      return null;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) {
      return null;
    }
    return { lat, lng, zoom };
  } catch {
    return null;
  }
}

export function saveMapExtentBookmark(
  projectId: string,
  bookmark: MapExtentBookmark
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${EXTENT_KEY_PREFIX}${projectId}`,
      JSON.stringify(bookmark)
    );
  } catch {
    /* quota */
  }
}

export function loadMapUiPreferences(): MapUiPreferences {
  if (typeof window === "undefined") return DEFAULT_UI;
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return DEFAULT_UI;
    const parsed = JSON.parse(raw) as Partial<MapUiPreferences>;
    const basemapId =
      parsed.basemapId === "osm" ||
      parsed.basemapId === "topo" ||
      parsed.basemapId === "positron"
        ? parsed.basemapId
        : DEFAULT_UI.basemapId;
    return {
      basemapId,
      showFeatureLabels: Boolean(parsed.showFeatureLabels),
      coordinateDisplay:
        parsed.coordinateDisplay === "utm" ? "utm" : "latlng",
    };
  } catch {
    return DEFAULT_UI;
  }
}

export function saveMapUiPreferences(prefs: MapUiPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(prefs));
  } catch {
    /* quota */
  }
}
