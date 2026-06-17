import type { ActivityLogRow } from "@/app/activity-log-types";

export type ActivityLogsCacheSnapshot = {
  logs: ActivityLogRow[];
  updatedAt: number;
};

const STORAGE_KEY = "pm-activity-logs-cache-v1";
const MAX_SCOPES = 8;

const memory = new Map<string, ActivityLogsCacheSnapshot>();

export function buildActivityLogsCacheKey(
  organizationId: string,
  projectIds: string[]
): string {
  const sorted = [...projectIds].sort().join(",");
  return `org:${organizationId}:projects:${sorted}`;
}

function readStorage(): Record<string, ActivityLogsCacheSnapshot> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ActivityLogsCacheSnapshot>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(data: Record<string, ActivityLogsCacheSnapshot>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota errors; memory cache still works.
  }
}

function persist(cacheKey: string, snapshot: ActivityLogsCacheSnapshot) {
  const all = readStorage();
  all[cacheKey] = snapshot;
  const keys = Object.keys(all).sort(
    (a, b) => (all[b]?.updatedAt ?? 0) - (all[a]?.updatedAt ?? 0)
  );
  for (const key of keys.slice(MAX_SCOPES)) {
    delete all[key];
  }
  writeStorage(all);
}

export function getActivityLogsCache(
  cacheKey: string
): ActivityLogsCacheSnapshot | null {
  const mem = memory.get(cacheKey);
  if (mem) return mem;
  const stored = readStorage()[cacheKey];
  if (!stored) return null;
  memory.set(cacheKey, stored);
  return stored;
}

export function setActivityLogsCache(
  cacheKey: string,
  partial: Omit<ActivityLogsCacheSnapshot, "updatedAt"> & { updatedAt?: number }
): void {
  const snapshot: ActivityLogsCacheSnapshot = {
    logs: partial.logs,
    updatedAt: partial.updatedAt ?? Date.now(),
  };
  memory.set(cacheKey, snapshot);
  persist(cacheKey, snapshot);
}

export function invalidateActivityLogsCache(organizationId?: string): void {
  if (!organizationId) {
    memory.clear();
    writeStorage({});
    return;
  }
  const prefix = `org:${organizationId}:`;
  for (const key of memory.keys()) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  const all = readStorage();
  let changed = false;
  for (const key of Object.keys(all)) {
    if (key.startsWith(prefix)) {
      delete all[key];
      changed = true;
    }
  }
  if (changed) writeStorage(all);
}
