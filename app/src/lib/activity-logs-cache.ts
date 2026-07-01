import type { ActivityLogRow } from "@/app/activity-log-types";
import {
  DEFAULT_DURABLE_CACHE_TTL_MS,
  isDurableSnapshotFresh,
} from "@/lib/client-durable-storage";
import {
  hydrateIndexedDbRecordEntry,
  invalidateIndexedDbRecordNamespace,
  persistIndexedDbRecordEntry,
  readIndexedDbRecordMapSync,
  flushIndexedDbRecordMemory,
} from "@/lib/client-durable-record-storage";

export type ActivityLogsCacheSnapshot = {
  logs: ActivityLogRow[];
  updatedAt: number;
};

const STORAGE_KEY = "pm-activity-logs-cache-v1";
const MAX_SCOPES = 8;
const CACHE_TTL_MS = DEFAULT_DURABLE_CACHE_TTL_MS;

const storeConfig = {
  namespace: "activity-logs-v1",
  maxEntries: MAX_SCOPES,
  ttlMs: CACHE_TTL_MS,
  legacySessionStorageKey: STORAGE_KEY,
};

const memory = new Map<string, ActivityLogsCacheSnapshot>();

export function buildActivityLogsCacheKey(
  organizationId: string,
  projectIds: string[]
): string {
  const sorted = [...projectIds].sort().join(",");
  return `org:${organizationId}:projects:${sorted}`;
}

export function getActivityLogsCache(
  cacheKey: string
): ActivityLogsCacheSnapshot | null {
  const mem = memory.get(cacheKey);
  if (mem) {
    if (!isDurableSnapshotFresh(mem, CACHE_TTL_MS)) {
      memory.delete(cacheKey);
    } else {
      return mem;
    }
  }
  const stored = readIndexedDbRecordMapSync<ActivityLogsCacheSnapshot>(
    storeConfig
  )[cacheKey];
  if (!stored || !isDurableSnapshotFresh(stored, CACHE_TTL_MS)) {
    return null;
  }
  memory.set(cacheKey, stored);
  return stored;
}

export async function hydrateActivityLogsCache(
  cacheKey: string
): Promise<ActivityLogsCacheSnapshot | null> {
  return hydrateIndexedDbRecordEntry(storeConfig, cacheKey, memory);
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
  void persistIndexedDbRecordEntry(storeConfig, cacheKey, snapshot, memory);
}

export function invalidateActivityLogsCache(organizationId?: string): void {
  if (!organizationId) {
    void invalidateIndexedDbRecordNamespace(storeConfig, memory);
    return;
  }
  void invalidateIndexedDbRecordNamespace(
    storeConfig,
    memory,
    `org:${organizationId}:`
  );
}

export async function flushActivityLogsMemoryToStorage(): Promise<void> {
  await flushIndexedDbRecordMemory(storeConfig, memory);
}
