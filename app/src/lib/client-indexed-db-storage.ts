/** IndexedDB ringan untuk snapshot cache besar (tanpa dependency eksternal). */

const DB_NAME = "spatial-pm-cache-v1";
const DB_VERSION = 1;
const STORE_NAME = "records";

type StoredEnvelope = {
  payload: unknown;
  updatedAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function recordKey(namespace: string, entryKey: string): string {
  return `${namespace}::${entryKey}`;
}

function openDatabase(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    return Promise.reject(new Error("indexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("idb open failed"));
    });
  }
  return dbPromise;
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () =>
          reject(request.error ?? new Error("idb request failed"));
      })
  );
}

export async function idbGetRecord<T>(
  namespace: string,
  entryKey: string
): Promise<T | null> {
  if (!isBrowser()) return null;
  try {
    const envelope = await runTransaction<StoredEnvelope | undefined>(
      "readonly",
      (store) => store.get(recordKey(namespace, entryKey))
    );
    if (!envelope || envelope.payload == null) return null;
    return envelope.payload as T;
  } catch {
    return null;
  }
}

export async function idbPutRecord<T extends { updatedAt?: number }>(
  namespace: string,
  entryKey: string,
  payload: T
): Promise<void> {
  if (!isBrowser()) return;
  const envelope: StoredEnvelope = {
    payload,
    updatedAt: payload.updatedAt ?? Date.now(),
  };
  try {
    await runTransaction<IDBValidKey>("readwrite", (store) =>
      store.put(envelope, recordKey(namespace, entryKey))
    );
  } catch {
    /* quota / private mode */
  }
}

export async function idbDeleteRecord(
  namespace: string,
  entryKey: string
): Promise<void> {
  if (!isBrowser()) return;
  try {
    await runTransaction<undefined>("readwrite", (store) =>
      store.delete(recordKey(namespace, entryKey))
    );
  } catch {
    /* ignore */
  }
}

export async function idbClearNamespace(namespace: string): Promise<void> {
  if (!isBrowser()) return;
  const prefix = `${namespace}::`;
  try {
    const db = await openDatabase();
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () =>
        reject(request.error ?? new Error("idb keys failed"));
    });
    await Promise.all(
      keys
        .filter((key) => String(key).startsWith(prefix))
        .map((key) =>
          runTransaction<undefined>("readwrite", (store) => store.delete(key))
        )
    );
  } catch {
    /* ignore */
  }
}

export async function idbEvictNamespace(
  namespace: string,
  maxEntries: number
): Promise<void> {
  if (!isBrowser() || maxEntries <= 0) return;
  const prefix = `${namespace}::`;
  try {
    const db = await openDatabase();
    const entries = await new Promise<
      Array<{ key: IDBValidKey; updatedAt: number }>
    >((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAllKeys();
      request.onsuccess = () => {
        const keys = (request.result ?? []).filter((key) =>
          String(key).startsWith(prefix)
        );
        if (keys.length === 0) {
          resolve([]);
          return;
        }
        let pending = keys.length;
        const out: Array<{ key: IDBValidKey; updatedAt: number }> = [];
        for (const key of keys) {
          const getReq = store.get(key);
          getReq.onsuccess = () => {
            const envelope = getReq.result as StoredEnvelope | undefined;
            out.push({
              key,
              updatedAt: envelope?.updatedAt ?? 0,
            });
            pending -= 1;
            if (pending === 0) resolve(out);
          };
          getReq.onerror = () => {
            pending -= 1;
            if (pending === 0) resolve(out);
          };
        }
      };
      request.onerror = () =>
        reject(request.error ?? new Error("idb keys failed"));
    });

    if (entries.length <= maxEntries) return;
    const toDelete = entries
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, entries.length - maxEntries);
    await Promise.all(
      toDelete.map((entry) =>
        runTransaction<undefined>("readwrite", (store) =>
          store.delete(entry.key)
        )
      )
    );
  } catch {
    /* ignore */
  }
}

export async function idbDeleteNamespaceByPrefix(
  namespace: string,
  entryKeyPrefix: string
): Promise<void> {
  if (!isBrowser()) return;
  const fullPrefix = `${namespace}::${entryKeyPrefix}`;
  try {
    const db = await openDatabase();
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () =>
        reject(request.error ?? new Error("idb keys failed"));
    });
    await Promise.all(
      keys
        .filter((key) => String(key).startsWith(fullPrefix))
        .map((key) =>
          runTransaction<undefined>("readwrite", (store) => store.delete(key))
        )
    );
  } catch {
    /* ignore */
  }
}
