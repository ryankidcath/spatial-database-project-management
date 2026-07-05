import type { WorkspaceBasemapId } from "@/lib/workspace-map-basemaps";

const DESKTOP_KEY_PREFIX = "spatial-pm-desktop-v1:";

export type SpatialDesktopPrefs = {
  showMinimap: boolean;
  showAttributeDock: boolean;
  showRelationTrace: boolean;
  showGraticule: boolean;
  swipeCompareEnabled: boolean;
  compareBasemapId: WorkspaceBasemapId;
  swipePercent: number;
};

const DEFAULT_DESKTOP: SpatialDesktopPrefs = {
  showMinimap: false,
  showAttributeDock: false,
  showRelationTrace: true,
  showGraticule: false,
  swipeCompareEnabled: false,
  compareBasemapId: "topo",
  swipePercent: 50,
};

function key(projectId: string): string {
  return `${DESKTOP_KEY_PREFIX}${projectId}`;
}

export function loadSpatialDesktopPrefs(
  projectId: string
): SpatialDesktopPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_DESKTOP };
  try {
    const raw = localStorage.getItem(key(projectId));
    if (!raw) return { ...DEFAULT_DESKTOP };
    const parsed = JSON.parse(raw) as Partial<SpatialDesktopPrefs>;
    return {
      showMinimap: parsed.showMinimap === true,
      showAttributeDock: parsed.showAttributeDock === true,
      showRelationTrace: parsed.showRelationTrace !== false,
      showGraticule: parsed.showGraticule === true,
      swipeCompareEnabled: parsed.swipeCompareEnabled === true,
      compareBasemapId:
        parsed.compareBasemapId === "topo" ||
        parsed.compareBasemapId === "positron" ||
        parsed.compareBasemapId === "osm"
          ? parsed.compareBasemapId
          : DEFAULT_DESKTOP.compareBasemapId,
      swipePercent:
        typeof parsed.swipePercent === "number"
          ? Math.min(100, Math.max(0, parsed.swipePercent))
          : DEFAULT_DESKTOP.swipePercent,
    };
  } catch {
    return { ...DEFAULT_DESKTOP };
  }
}

export function saveSpatialDesktopPrefs(
  projectId: string,
  prefs: SpatialDesktopPrefs
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(projectId), JSON.stringify(prefs));
  } catch {
    /* quota */
  }
}
