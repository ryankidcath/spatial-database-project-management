import type { ChatInboxEntry } from "@/app/workspace-chat-inbox-types";

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

const STORAGE_KEY = "pm-chat-inbox-cache-v1";
const MAX_SCOPES = 12;

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
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ChatInboxCacheSnapshot>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(data: Record<string, ChatInboxCacheSnapshot>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota errors; memory cache still works.
  }
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

export function getChatInboxCache(
  cacheKey: string
): ChatInboxCacheSnapshot | null {
  const mem = memory.get(cacheKey);
  if (mem) return mem;
  const stored = readStorage()[cacheKey];
  if (!stored) return null;
  memory.set(cacheKey, stored);
  return stored;
}

export function setChatInboxCache(
  cacheKey: string,
  partial: Omit<ChatInboxCacheSnapshot, "updatedAt"> & { updatedAt?: number }
): void {
  const snapshot: ChatInboxCacheSnapshot = {
    rowEntries: partial.rowEntries,
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
