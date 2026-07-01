/** Kontrak cache push (PR-H) — namespace/key selaras dengan public/sw-push-cache.js */

export const PUSH_CACHE_IDB_NAME = "spatial-pm-cache-v1";
export const PUSH_CACHE_CHAT_ROOM_NAMESPACE = "chat-room-v1";
export const PUSH_CACHE_INBOX_META_NAMESPACE = "push-inbox-meta-v1";

export const PUSH_CACHE_APPLIED_EVENT = "spatial-pm-push-cache-applied";

export type PushInboxMetaPatch = {
  lastActivityAt: string;
  lastMessagePreview: string | null;
};

export type PushInboxMetaEntry = {
  patches: Record<string, PushInboxMetaPatch>;
  updatedAt: number;
};

export type PushCacheAppliedDetail = {
  kind?: string;
  roomCacheKey?: string;
  organizationId?: string | null;
  inboxRoomKey?: string | null;
};

export function inboxMetaOrgEntryKey(organizationId: string): string {
  return `org:${organizationId}`;
}

export function orgIdFromInboxCacheKey(cacheKey: string): string | null {
  const match = cacheKey.match(/^org:([^:]+):/);
  return match?.[1] ?? null;
}
