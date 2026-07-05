export type WorkspaceRailTabId = "Data" | "Chat" | "Map";

const STORAGE_KEY_PREFIX = "spatial-pm-workspace-rail-v1";

/** Default: rail terbuka (tidak collapsed). */
export function loadWorkspaceRailCollapsed(tabId: WorkspaceRailTabId): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}:${tabId}`);
    if (raw === null) return false;
    return raw === "1" || raw === "true";
  } catch {
    return false;
  }
}

export function saveWorkspaceRailCollapsed(
  tabId: WorkspaceRailTabId,
  collapsed: boolean
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}:${tabId}`,
      collapsed ? "1" : "0"
    );
  } catch {
    /* quota / private mode */
  }
}
