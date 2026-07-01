import { hydratePushInboxPatchesFromIdb } from "@/lib/push-cache-inbox";
import {
  PUSH_CACHE_APPLIED_EVENT,
  type PushCacheAppliedDetail,
} from "@/lib/push-cache-contract";

type SwPushCacheMessage = PushCacheAppliedDetail & {
  type?: string;
  applied?: boolean;
};

function dispatchPushCacheApplied(detail: PushCacheAppliedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PUSH_CACHE_APPLIED_EVENT, { detail })
  );
}

async function handlePushCacheApplied(data: SwPushCacheMessage): Promise<void> {
  if (!data.applied || data.kind !== "chat_message") return;

  await hydratePushInboxPatchesFromIdb();

  dispatchPushCacheApplied({
    kind: data.kind,
    roomCacheKey: data.roomCacheKey,
    organizationId: data.organizationId,
    inboxRoomKey: data.inboxRoomKey,
  });
}

/** Inisialisasi patch inbox + dengarkan postMessage dari service worker. */
export function initPushCacheClient(): () => void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return () => {};
  }

  void hydratePushInboxPatchesFromIdb();

  const handler = (event: MessageEvent) => {
    const data = event.data as SwPushCacheMessage | undefined;
    if (data?.type !== "PUSH_CACHE_APPLIED") return;
    void handlePushCacheApplied(data);
  };

  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}
