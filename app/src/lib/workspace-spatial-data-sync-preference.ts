const SELECTION_SYNC_KEY_PREFIX = "spatial-pm-selection-sync-v1:";

export function loadSpatialSelectionSyncEnabled(projectId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(`${SELECTION_SYNC_KEY_PREFIX}${projectId}`);
    if (raw === "0" || raw === "false") return false;
    return true;
  } catch {
    return true;
  }
}

export function saveSpatialSelectionSyncEnabled(
  projectId: string,
  enabled: boolean
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${SELECTION_SYNC_KEY_PREFIX}${projectId}`,
      enabled ? "1" : "0"
    );
  } catch {
    /* quota */
  }
}
