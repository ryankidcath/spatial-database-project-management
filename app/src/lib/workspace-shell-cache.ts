import type { WorkspaceShellPayload } from "@/lib/workspace-shell-types";
import {
  DEFAULT_DURABLE_CACHE_TTL_MS,
  isDurableSnapshotFresh,
  readDurableJsonValue,
  writeDurableJsonValue,
} from "@/lib/client-durable-storage";

const STORAGE_KEY = "pm-workspace-shell-cache-v1";

type WorkspaceShellCacheEntry = {
  userId: string;
  payload: WorkspaceShellPayload;
  updatedAt: number;
};

export function readWorkspaceShellCache(): WorkspaceShellPayload | null {
  if (typeof window === "undefined") return null;
  const entry = readDurableJsonValue<WorkspaceShellCacheEntry>(STORAGE_KEY);
  if (!entry?.payload || !entry.userId) return null;
  if (!isDurableSnapshotFresh(entry, DEFAULT_DURABLE_CACHE_TTL_MS)) return null;
  return entry.payload;
}

export function setWorkspaceShellCache(
  userId: string,
  payload: WorkspaceShellPayload
): void {
  if (typeof window === "undefined" || !userId) return;
  const entry: WorkspaceShellCacheEntry = {
    userId,
    payload,
    updatedAt: Date.now(),
  };
  writeDurableJsonValue(STORAGE_KEY, entry);
}
