import type { ChatInboxEntry } from "@/app/workspace-chat-inbox-types";
import {
  DEFAULT_DURABLE_CACHE_TTL_MS,
  isDurableSnapshotFresh,
  readDurableJsonRecord,
  writeDurableJsonRecord,
} from "@/lib/client-durable-storage";
import { orgIdFromInboxCacheKey } from "@/lib/push-cache-contract";
import { getPushInboxPatchesForOrg } from "@/lib/push-cache-inbox";

export type ChatInboxRoomMeta = {
  lastActivityAt: string;
  lastMessagePreview: string | null;
};

export type ChatInboxCacheSnapshot = {
  rowEntries: ChatInboxEntry[];
  rowTotalCount: number;
  roomMetaByKey: Record<string, ChatInboxRoomMeta>;
  mentionKeys: string[];
  updatedAt: number;
};

import { resolveSnapshotFetchLimit } from "@/lib/client-snapshot-cache-pattern";

const STORAGE_KEY = "pm-chat-inbox-cache-v1";
const LEGACY_SESSION_KEY = STORAGE_KEY;
const MAX_SCOPES = 12;
const CACHE_TTL_MS = DEFAULT_DURABLE_CACHE_TTL_MS;

/** Halaman room baris aktif di inbox (mobile + prefetch). */
export const CHAT_INBOX_ROW_PAGE_SIZE = 25;

/** Selaraskan limit fetch dengan jumlah yang sudah di-cache / dimuat (PR-I fix). */
export function inboxRowFetchLimit(
  cachedRowCount: number,
  loadedRowCount: number
): number {
  return resolveSnapshotFetchLimit(
    cachedRowCount,
    loadedRowCount,
    CHAT_INBOX_ROW_PAGE_SIZE
  );
}

const memory = new Map<string, ChatInboxCacheSnapshot>();

export function buildChatInboxCacheKey(input: {
  organizationId: string;
  projectId: string | null;
  tableIds: string[];
}): string {
  const tables = [...input.tableIds].sort().join(",");
  return `org:${input.organizationId}:project:${input.projectId ?? ""}:tables:${tables}`;
}

function readStorage(): Record<string, ChatInboxCacheSnapshot> {
  return readDurableJsonRecord<ChatInboxCacheSnapshot>(STORAGE_KEY, {
    ttlMs: CACHE_TTL_MS,
    legacySessionKey: LEGACY_SESSION_KEY,
  });
}

function writeStorage(data: Record<string, ChatInboxCacheSnapshot>) {
  writeDurableJsonRecord(STORAGE_KEY, data);
}

function persist(cacheKey: string, snapshot: ChatInboxCacheSnapshot) {
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

/** Jangan simpan badge unread ke storage — selalu ambil dari server. */
function stripUnreadFromEntries(entries: ChatInboxEntry[]): ChatInboxEntry[] {
  return entries.map((e) => ({ ...e, unreadCount: 0 }));
}

function mergePushInboxPatches(
  cacheKey: string,
  snapshot: ChatInboxCacheSnapshot
): ChatInboxCacheSnapshot {
  const orgId = orgIdFromInboxCacheKey(cacheKey);
  if (!orgId) return snapshot;
  const patches = getPushInboxPatchesForOrg(orgId);
  if (!patches) return snapshot;
  return {
    ...snapshot,
    roomMetaByKey: { ...snapshot.roomMetaByKey, ...patches },
  };
}

export function getChatInboxCache(
  cacheKey: string
): ChatInboxCacheSnapshot | null {
  const mem = memory.get(cacheKey);
  if (mem) {
    if (!isDurableSnapshotFresh(mem, CACHE_TTL_MS)) {
      memory.delete(cacheKey);
    } else {
      return mergePushInboxPatches(cacheKey, mem);
    }
  }
  const stored = readStorage()[cacheKey];
  if (!stored || !isDurableSnapshotFresh(stored, CACHE_TTL_MS)) {
    return null;
  }
  const merged = mergePushInboxPatches(cacheKey, stored);
  memory.set(cacheKey, stored);
  return merged;
}

export function setChatInboxCache(
  cacheKey: string,
  partial: Omit<ChatInboxCacheSnapshot, "updatedAt"> & { updatedAt?: number }
): void {
  const snapshot: ChatInboxCacheSnapshot = {
    rowEntries: stripUnreadFromEntries(partial.rowEntries),
    rowTotalCount: partial.rowTotalCount,
    roomMetaByKey: partial.roomMetaByKey,
    mentionKeys: partial.mentionKeys,
    updatedAt: partial.updatedAt ?? Date.now(),
  };
  memory.set(cacheKey, snapshot);
  persist(cacheKey, snapshot);
}

export function invalidateChatInboxCache(organizationId?: string): void {
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

/** Flush memori inbox ke localStorage (visibility hidden). */
export function flushChatInboxMemoryToStorage(): void {
  if (memory.size === 0) return;
  const all = readStorage();
  for (const [cacheKey, snapshot] of memory.entries()) {
    if (!isDurableSnapshotFresh(snapshot, CACHE_TTL_MS)) continue;
    all[cacheKey] = {
      rowEntries: stripUnreadFromEntries(snapshot.rowEntries),
      rowTotalCount: snapshot.rowTotalCount,
      roomMetaByKey: snapshot.roomMetaByKey,
      mentionKeys: snapshot.mentionKeys,
      updatedAt: snapshot.updatedAt ?? Date.now(),
    };
  }
  const keys = Object.keys(all).sort(
    (a, b) => (all[b]?.updatedAt ?? 0) - (all[a]?.updatedAt ?? 0)
  );
  for (const key of keys.slice(MAX_SCOPES)) {
    delete all[key];
  }
  writeStorage(all);
}
