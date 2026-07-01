import type { ChatInboxRoomMeta } from "@/lib/chat-inbox-cache";
import { idbGetRecord } from "@/lib/client-indexed-db-storage";
import {
  PUSH_CACHE_INBOX_META_NAMESPACE,
  type PushInboxMetaEntry,
  type PushInboxMetaPatch,
} from "@/lib/push-cache-contract";

const memoryByOrg = new Map<string, Record<string, PushInboxMetaPatch>>();

export function getPushInboxPatchesForOrg(
  organizationId: string
): Record<string, ChatInboxRoomMeta> | null {
  const patches = memoryByOrg.get(organizationId);
  if (!patches || Object.keys(patches).length === 0) return null;
  return patches;
}

export function applyPushInboxPatchToMemory(
  organizationId: string,
  inboxRoomKey: string,
  patch: PushInboxMetaPatch
): void {
  const existing = memoryByOrg.get(organizationId) ?? {};
  existing[inboxRoomKey] = patch;
  memoryByOrg.set(organizationId, existing);
}

/** Muat patch inbox dari IndexedDB (ditulis SW saat push). */
export async function hydratePushInboxPatchesFromIdb(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("spatial-pm-cache-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("idb open failed"));
    });
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = db.transaction("records", "readonly");
      const store = tx.objectStore("records");
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () =>
        reject(request.error ?? new Error("idb keys failed"));
    });

    const prefix = `${PUSH_CACHE_INBOX_META_NAMESPACE}::org:`;
    const orgKeys = keys
      .map(String)
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(`${PUSH_CACHE_INBOX_META_NAMESPACE}::`.length));

    await Promise.all(
      orgKeys.map(async (entryKey) => {
        const entry = await idbGetRecord<PushInboxMetaEntry>(
          PUSH_CACHE_INBOX_META_NAMESPACE,
          entryKey
        );
        if (!entry?.patches) return;
        const orgId = entryKey.startsWith("org:")
          ? entryKey.slice(4)
          : entryKey;
        if (!orgId) return;
        memoryByOrg.set(orgId, { ...entry.patches });
      })
    );
  } catch {
    /* private mode / quota */
  }
}
