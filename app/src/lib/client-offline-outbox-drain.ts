import { sendChatMessageClient } from "@/lib/chat-client";
import {
  OFFLINE_OUTBOX_CHAT_SENT_EVENT,
  OFFLINE_OUTBOX_SYNC_TAG,
  isRetryableNetworkError,
  type OfflineOutboxChatSentDetail,
} from "@/lib/client-offline-outbox-contract";
import {
  listOfflineOutboxItems,
  markOfflineOutboxAttempt,
  removeOfflineOutboxItem,
} from "@/lib/client-offline-outbox";

let draining = false;

function dispatchChatSent(detail: OfflineOutboxChatSentDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OFFLINE_OUTBOX_CHAT_SENT_EVENT, { detail })
  );
}

/** Daftarkan Background Sync (Chromium) agar SW membangunkan drain. */
export async function registerOfflineOutboxBackgroundSync(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const syncManager = (
      registration as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      }
    ).sync;
    if (!syncManager?.register) return;
    await syncManager.register(OFFLINE_OUTBOX_SYNC_TAG);
  } catch {
    /* unsupported / permission */
  }
}

export type DrainOfflineOutboxResult = {
  sent: number;
  remaining: number;
  stoppedOnNetworkError: boolean;
};

/** Kirim ulang antrian offline ke Supabase (butuh sesi browser aktif). */
export async function drainOfflineOutbox(): Promise<DrainOfflineOutboxResult> {
  if (typeof window === "undefined") {
    return { sent: 0, remaining: 0, stoppedOnNetworkError: false };
  }
  if (!navigator.onLine) {
    const remaining = await listOfflineOutboxItems();
    return {
      sent: 0,
      remaining: remaining.length,
      stoppedOnNetworkError: true,
    };
  }
  if (draining) {
    const remaining = await listOfflineOutboxItems();
    return {
      sent: 0,
      remaining: remaining.length,
      stoppedOnNetworkError: false,
    };
  }

  draining = true;
  let sent = 0;
  let stoppedOnNetworkError = false;

  try {
    const items = await listOfflineOutboxItems();
    for (const item of items) {
      if (item.kind !== "chat_send") continue;

      const res = await sendChatMessageClient({
        roomId: item.roomId,
        body: item.body,
        attachmentRefs: item.attachmentRefs,
      });

      if (res.error) {
        if (isRetryableNetworkError(res.error)) {
          await markOfflineOutboxAttempt(item.id, res.error);
          stoppedOnNetworkError = true;
          break;
        }
        await removeOfflineOutboxItem(item.id);
        continue;
      }

      await removeOfflineOutboxItem(item.id);
      sent += 1;
      const messageId = res.data?.messageId;
      if (!messageId) continue;
      dispatchChatSent({
        roomId: item.roomId,
        roomCacheKey: item.roomCacheKey,
        clientMessageId: item.clientMessageId,
        messageId,
      });
    }
  } finally {
    draining = false;
  }

  const remaining = await listOfflineOutboxItems();
  if (remaining.length > 0) {
    await registerOfflineOutboxBackgroundSync();
  }

  return { sent, remaining: remaining.length, stoppedOnNetworkError };
}
