const STORAGE_KEY = "spatial-pm-workspace-scope-v1";
const SIDEBAR_COLLAPSED_KEY = "spatial-pm-workspace-sidebar-collapsed-v1";
const MAX_RECENT = 3;
const MAX_PINNED = 8;
const QUICK_ACCESS_LIMIT = 3;

export type WorkspaceScopePrefs = {
  pinnedProjectIds: string[];
  recentProjectIds: string[];
};

function readPrefs(): WorkspaceScopePrefs {
  if (typeof window === "undefined") {
    return { pinnedProjectIds: [], recentProjectIds: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { pinnedProjectIds: [], recentProjectIds: [] };
    const parsed = JSON.parse(raw) as Partial<WorkspaceScopePrefs>;
    return {
      pinnedProjectIds: Array.isArray(parsed.pinnedProjectIds)
        ? parsed.pinnedProjectIds.filter((id) => typeof id === "string")
        : [],
      recentProjectIds: Array.isArray(parsed.recentProjectIds)
        ? parsed.recentProjectIds.filter((id) => typeof id === "string")
        : [],
    };
  } catch {
    return { pinnedProjectIds: [], recentProjectIds: [] };
  }
}

function writePrefs(prefs: WorkspaceScopePrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* quota / private mode */
  }
}

export function loadScopePrefs(): WorkspaceScopePrefs {
  return readPrefs();
}

export function loadPinnedProjectIds(): string[] {
  return readPrefs().pinnedProjectIds;
}

export function loadRecentProjectIds(): string[] {
  return readPrefs().recentProjectIds;
}

export function isProjectPinned(projectId: string): boolean {
  return readPrefs().pinnedProjectIds.includes(projectId);
}

export function togglePinnedProject(projectId: string): string[] {
  const prefs = readPrefs();
  const pinned = prefs.pinnedProjectIds.includes(projectId)
    ? prefs.pinnedProjectIds.filter((id) => id !== projectId)
    : [projectId, ...prefs.pinnedProjectIds].slice(0, MAX_PINNED);
  writePrefs({ ...prefs, pinnedProjectIds: pinned });
  return pinned;
}

export function recordRecentProject(projectId: string): void {
  if (!projectId) return;
  const prefs = readPrefs();
  const recent = [
    projectId,
    ...prefs.recentProjectIds.filter((id) => id !== projectId),
  ].slice(0, MAX_RECENT);
  writePrefs({ ...prefs, recentProjectIds: recent });
}

/** Pin dulu, lalu recent; dedupe; batasi `limit` (default 3). */
export function buildQuickAccessProjectIds(
  pinnedIds: string[],
  recentIds: string[],
  accessibleIds: Set<string>,
  limit = QUICK_ACCESS_LIMIT
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of [...pinnedIds, ...recentIds]) {
    if (!accessibleIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

/** Urutan untuk popover: pin → recent → sisanya (semua dalam subset `projectIds`). */
export function orderProjectsForPopover(
  projectIds: string[],
  pinnedIds: string[],
  recentIds: string[]
): { pinned: string[]; recent: string[]; rest: string[] } {
  const idSet = new Set(projectIds);
  const pinned = pinnedIds.filter((id) => idSet.has(id));
  const pinnedSet = new Set(pinned);
  const recent = recentIds.filter(
    (id) => idSet.has(id) && !pinnedSet.has(id)
  );
  const shown = new Set([...pinned, ...recent]);
  const rest = projectIds.filter((id) => !shown.has(id));
  return { pinned, recent, rest };
}

/** Default: sidebar terbuka di desktop. */
export function loadWorkspaceSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (raw === null) return false;
    return raw === "1" || raw === "true";
  } catch {
    return false;
  }
}

export function saveWorkspaceSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* quota / private mode */
  }
}
