import type { ChatAttachmentRef } from "@/app/chat-types";
import {
  idbDeleteRecord,
  idbGetRecord,
  idbListEntryKeys,
  idbPutRecord,
} from "@/lib/client-indexed-db-storage";
import {
  OFFLINE_OUTBOX_CHANGED_EVENT,
  OFFLINE_OUTBOX_MAX_ITEMS,
  OFFLINE_OUTBOX_NAMESPACE,
  type OfflineOutboxChatSendItem,
  type OfflineOutboxItem,
} from "@/lib/client-offline-outbox-contract";

function dispatchOutboxChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OFFLINE_OUTBOX_CHANGED_EVENT));
}

export async function listOfflineOutboxItems(): Promise<OfflineOutboxItem[]> {
  if (typeof window === "undefined") return [];
  try {
    const keys = await idbListEntryKeys(OFFLINE_OUTBOX_NAMESPACE);
    const items = await Promise.all(
      keys.map((key) =>
        idbGetRecord<OfflineOutboxItem>(OFFLINE_OUTBOX_NAMESPACE, key)
      )
    );
    return items
      .filter((item): item is OfflineOutboxItem => Boolean(item?.id))
      .sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function listOfflineOutboxChatItemsForRoom(
  roomId: string
): Promise<OfflineOutboxChatSendItem[]> {
  const items = await listOfflineOutboxItems();
  return items.filter(
    (item): item is OfflineOutboxChatSendItem =>
      item.kind === "chat_send" && item.roomId === roomId
  );
}

export async function enqueueOfflineChatSend(input: {
  roomId: string;
  roomCacheKey: string | null;
  clientMessageId: string;
  body: string;
  attachmentRefs: ChatAttachmentRef[];
}): Promise<OfflineOutboxChatSendItem> {
  const existing = await listOfflineOutboxItems();
  const duplicate = existing.find(
    (item) =>
      item.kind === "chat_send" &&
      item.clientMessageId === input.clientMessageId
  );
  if (duplicate && duplicate.kind === "chat_send") {
    return duplicate;
  }

  const item: OfflineOutboxChatSendItem = {
    kind: "chat_send",
    id: crypto.randomUUID(),
    roomId: input.roomId,
    roomCacheKey: input.roomCacheKey,
    clientMessageId: input.clientMessageId,
    body: input.body,
    attachmentRefs: input.attachmentRefs,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attempts: 0,
    lastError: null,
  };

  await idbPutRecord(OFFLINE_OUTBOX_NAMESPACE, item.id, item);

  const all = [...existing, item].sort((a, b) => b.createdAt - a.createdAt);
  for (const stale of all.slice(OFFLINE_OUTBOX_MAX_ITEMS)) {
    await idbDeleteRecord(OFFLINE_OUTBOX_NAMESPACE, stale.id);
  }

  dispatchOutboxChanged();
  return item;
}

export async function removeOfflineOutboxItem(id: string): Promise<void> {
  await idbDeleteRecord(OFFLINE_OUTBOX_NAMESPACE, id);
  dispatchOutboxChanged();
}

export async function markOfflineOutboxAttempt(
  id: string,
  lastError: string
): Promise<void> {
  const item = await idbGetRecord<OfflineOutboxItem>(OFFLINE_OUTBOX_NAMESPACE, id);
  if (!item) return;
  const next = {
    ...item,
    attempts: item.attempts + 1,
    lastError,
    updatedAt: Date.now(),
  };
  await idbPutRecord(OFFLINE_OUTBOX_NAMESPACE, id, next);
  dispatchOutboxChanged();
}

export async function countOfflineOutboxItems(): Promise<number> {
  const items = await listOfflineOutboxItems();
  return items.length;
}
