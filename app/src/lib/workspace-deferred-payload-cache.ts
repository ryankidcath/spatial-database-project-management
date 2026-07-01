import type { WorkspaceDeferredPayload } from "@/lib/workspace-bootstrap-types";
import {
  DEFAULT_DURABLE_CACHE_TTL_MS,
  isDurableSnapshotFresh,
} from "@/lib/client-durable-storage";
import {
  hydrateIndexedDbRecordEntry,
  persistIndexedDbRecordEntry,
  readIndexedDbRecordMapSync,
} from "@/lib/client-durable-record-storage";

export type WorkspaceDeferredPayloadCacheEntry = {
  payload: WorkspaceDeferredPayload;
  updatedAt: number;
};

const STORAGE_KEY = "pm-workspace-deferred-payload-v1";
const MAX_SCOPES = 4;
const CACHE_TTL_MS = DEFAULT_DURABLE_CACHE_TTL_MS;

const storeConfig = {
  namespace: "workspace-deferred-payload-v1",
  maxEntries: MAX_SCOPES,
  ttlMs: CACHE_TTL_MS,
  legacySessionStorageKey: STORAGE_KEY,
};

const memory = new Map<string, WorkspaceDeferredPayloadCacheEntry>();

export function buildWorkspaceDeferredPayloadCacheKey(
  organizationId: string,
  selectedProjectId: string | null,
  scopedProjectIds: string[]
): string {
  const scoped = [...scopedProjectIds].sort().join(",");
  return `org:${organizationId}:sel:${selectedProjectId ?? ""}:projects:${scoped}`;
}

export function getWorkspaceDeferredPayloadCache(
  cacheKey: string
): WorkspaceDeferredPayloadCacheEntry | null {
  const mem = memory.get(cacheKey);
  if (mem) {
    if (!isDurableSnapshotFresh(mem, CACHE_TTL_MS)) {
      memory.delete(cacheKey);
    } else {
      return mem;
    }
  }
  const stored =
    readIndexedDbRecordMapSync<WorkspaceDeferredPayloadCacheEntry>(
      storeConfig
    )[cacheKey];
  if (!stored || !isDurableSnapshotFresh(stored, CACHE_TTL_MS)) {
    return null;
  }
  memory.set(cacheKey, stored);
  return stored;
}

export async function hydrateWorkspaceDeferredPayloadCache(
  cacheKey: string
): Promise<WorkspaceDeferredPayloadCacheEntry | null> {
  return hydrateIndexedDbRecordEntry(storeConfig, cacheKey, memory);
}

export function setWorkspaceDeferredPayloadCache(
  cacheKey: string,
  payload: WorkspaceDeferredPayload
): void {
  const entry: WorkspaceDeferredPayloadCacheEntry = {
    payload,
    updatedAt: Date.now(),
  };
  memory.set(cacheKey, entry);
  void persistIndexedDbRecordEntry(storeConfig, cacheKey, entry, memory);
}
