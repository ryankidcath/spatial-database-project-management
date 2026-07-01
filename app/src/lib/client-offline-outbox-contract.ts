/** Kontrak offline outbox (PR-I) — selaras dengan SW Background Sync tag. */

export const OFFLINE_OUTBOX_SYNC_TAG = "spatial-pm-outbox";
export const OFFLINE_OUTBOX_NAMESPACE = "offline-outbox-v1";
export const OFFLINE_OUTBOX_MAX_ITEMS = 64;

export const OFFLINE_OUTBOX_CHAT_SENT_EVENT = "spatial-pm-offline-outbox-chat-sent";
export const OFFLINE_OUTBOX_CHANGED_EVENT = "spatial-pm-offline-outbox-changed";

export type OfflineOutboxChatSendItem = {
  kind: "chat_send";
  id: string;
  roomId: string;
  roomCacheKey: string | null;
  clientMessageId: string;
  body: string;
  attachmentRefs: Array<{ label: string; url: string }>;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  lastError: string | null;
};

export type OfflineOutboxItem = OfflineOutboxChatSendItem;

export type OfflineOutboxChatSentDetail = {
  roomId: string;
  roomCacheKey: string | null;
  clientMessageId: string;
  messageId: string;
};

export function isOfflinePendingMessageId(id: string): boolean {
  return id.startsWith("pending:");
}

export function isRetryableNetworkError(error: string): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const message = error.toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("timeout") ||
    message.includes("etimedout") ||
    message.includes("econnreset") ||
    message.includes("fetch")
  );
}
