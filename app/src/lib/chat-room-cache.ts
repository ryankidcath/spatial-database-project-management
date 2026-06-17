import type { ChatMessageRow, ChatScopeType } from "@/app/chat-types";

export type ChatRoomCacheSnapshot = {
  roomId: string | null;
  messages: ChatMessageRow[];
  hasOlder: boolean;
  lastReadAt: string | null;
  updatedAt: number;
};

const STORAGE_KEY = "pm-chat-room-cache-v1";
const MAX_ROOMS = 32;
const MAX_MESSAGES_STORED = 120;

const memory = new Map<string, ChatRoomCacheSnapshot>();

export function buildChatRoomCacheKey(input: {
  scopeType: ChatScopeType;
  projectId?: string | null;
  virtualTableId?: string | null;
  virtualRowId?: string | null;
}): string {
  switch (input.scopeType) {
    case "organization":
      return "org";
    case "project":
      return `project:${input.projectId ?? ""}`;
    case "virtual_table":
      return `table:${input.virtualTableId ?? ""}`;
    case "virtual_row":
      return `row:${input.virtualRowId ?? ""}`;
  }
}

function trimMessages(messages: ChatMessageRow[]): ChatMessageRow[] {
  if (messages.length <= MAX_MESSAGES_STORED) return messages;
  return messages.slice(-MAX_MESSAGES_STORED);
}

function readStorage(): Record<string, ChatRoomCacheSnapshot> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ChatRoomCacheSnapshot>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(data: Record<string, ChatRoomCacheSnapshot>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded — abaikan; cache memori tetap dipakai.
  }
}

function persistToStorage(cacheKey: string, snapshot: ChatRoomCacheSnapshot) {
  const all = readStorage();
  all[cacheKey] = snapshot;
  const keys = Object.keys(all).sort(
    (a, b) => (all[b]?.updatedAt ?? 0) - (all[a]?.updatedAt ?? 0)
  );
  for (const key of keys.slice(MAX_ROOMS)) {
    delete all[key];
  }
  writeStorage(all);
}

export function getChatRoomCache(
  cacheKey: string
): ChatRoomCacheSnapshot | null {
  const mem = memory.get(cacheKey);
  if (mem) return mem;
  const stored = readStorage()[cacheKey];
  if (!stored) return null;
  memory.set(cacheKey, stored);
  return stored;
}

export function setChatRoomCache(
  cacheKey: string,
  partial: Omit<ChatRoomCacheSnapshot, "updatedAt"> & { updatedAt?: number }
) {
  const snapshot: ChatRoomCacheSnapshot = {
    roomId: partial.roomId,
    messages: trimMessages(partial.messages),
    hasOlder: partial.hasOlder,
    lastReadAt: partial.lastReadAt,
    updatedAt: partial.updatedAt ?? Date.now(),
  };
  memory.set(cacheKey, snapshot);
  persistToStorage(cacheKey, snapshot);
}

/** Gabungkan halaman terbaru dari server dengan pesan lama yang sudah dimuat user. */
export function mergeChatMessageTail(
  existing: ChatMessageRow[],
  freshPage: ChatMessageRow[]
): ChatMessageRow[] {
  if (freshPage.length === 0) return existing;
  if (existing.length === 0) return freshPage;

  const oldestFresh = freshPage[0]!.created_at;
  const older = existing.filter((m) => m.created_at < oldestFresh);
  const byId = new Map<string, ChatMessageRow>();
  for (const m of [...older, ...freshPage]) {
    byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
}

export function appendChatMessages(
  existing: ChatMessageRow[],
  incoming: ChatMessageRow[]
): ChatMessageRow[] {
  if (incoming.length === 0) return existing;
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) {
    byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
}
