import {
  DEFAULT_DURABLE_CACHE_TTL_MS,
  isDurableSnapshotFresh,
  readDurableJsonRecord,
  writeDurableJsonRecord,
} from "@/lib/client-durable-storage";
import {
  idbClearNamespace,
  idbDeleteNamespaceByPrefix,
  idbDeleteRecord,
  idbEvictNamespace,
  idbGetRecord,
  idbPutRecord,
} from "@/lib/client-indexed-db-storage";

type WithUpdatedAt = { updatedAt?: number };

export type IndexedDbRecordStoreConfig = {
  namespace: string;
  maxEntries: number;
  ttlMs?: number;
  legacyLocalStorageKey?: string;
  legacySessionStorageKey?: string;
};

const migratedNamespaces = new Set<string>();

function readLegacyLocalRecordMap<T extends WithUpdatedAt>(
  config: IndexedDbRecordStoreConfig
): Record<string, T> {
  const ttlMs = config.ttlMs ?? DEFAULT_DURABLE_CACHE_TTL_MS;
  const localKey = config.legacyLocalStorageKey ?? config.namespace;
  return readDurableJsonRecord<T>(localKey, {
    ttlMs,
    legacySessionKey: config.legacySessionStorageKey,
  });
}

/** Migrasi sekali: localStorage/sessionStorage → IndexedDB per entry. */
export async function migrateRecordMapToIndexedDb<T extends WithUpdatedAt>(
  config: IndexedDbRecordStoreConfig
): Promise<void> {
  if (typeof window === "undefined") return;
  if (migratedNamespaces.has(config.namespace)) return;

  const legacy = readLegacyLocalRecordMap<T>(config);
  const keys = Object.keys(legacy);
  if (keys.length > 0) {
    await Promise.all(
      keys.map((entryKey) =>
        idbPutRecord(config.namespace, entryKey, legacy[entryKey]!)
      )
    );
    await idbEvictNamespace(config.namespace, config.maxEntries);
  }

  try {
    const localKey = config.legacyLocalStorageKey ?? config.namespace;
    localStorage.removeItem(localKey);
    if (config.legacySessionStorageKey) {
      sessionStorage.removeItem(config.legacySessionStorageKey);
    }
  } catch {
    /* ignore */
  }

  migratedNamespaces.add(config.namespace);
}

export function readIndexedDbRecordMapSync<T extends WithUpdatedAt>(
  config: IndexedDbRecordStoreConfig
): Record<string, T> {
  return readLegacyLocalRecordMap<T>(config);
}

export async function hydrateIndexedDbRecordEntry<T extends WithUpdatedAt>(
  config: IndexedDbRecordStoreConfig,
  entryKey: string,
  memory: Map<string, T>
): Promise<T | null> {
  if (typeof window === "undefined") return null;
  const ttlMs = config.ttlMs ?? DEFAULT_DURABLE_CACHE_TTL_MS;

  const mem = memory.get(entryKey);
  if (mem && isDurableSnapshotFresh(mem, ttlMs)) return mem;

  await migrateRecordMapToIndexedDb<T>(config);

  const fromIdb = await idbGetRecord<T>(config.namespace, entryKey);
  if (!fromIdb || !isDurableSnapshotFresh(fromIdb, ttlMs)) {
    const legacy = readLegacyLocalRecordMap<T>(config)[entryKey];
    if (legacy && isDurableSnapshotFresh(legacy, ttlMs)) {
      memory.set(entryKey, legacy);
      void idbPutRecord(config.namespace, entryKey, legacy);
      return legacy;
    }
    return null;
  }

  memory.set(entryKey, fromIdb);
  return fromIdb;
}

export async function persistIndexedDbRecordEntry<T extends WithUpdatedAt>(
  config: IndexedDbRecordStoreConfig,
  entryKey: string,
  value: T,
  memory: Map<string, T>
): Promise<void> {
  memory.set(entryKey, value);
  await migrateRecordMapToIndexedDb<T>(config);
  await idbPutRecord(config.namespace, entryKey, value);
  await idbEvictNamespace(config.namespace, config.maxEntries);
}

export async function invalidateIndexedDbRecordNamespace<T extends WithUpdatedAt>(
  config: IndexedDbRecordStoreConfig,
  memory: Map<string, T>,
  entryKeyPrefix?: string
): Promise<void> {
  if (!entryKeyPrefix) {
    memory.clear();
    await idbClearNamespace(config.namespace);
    try {
      const localKey = config.legacyLocalStorageKey ?? config.namespace;
      localStorage.removeItem(localKey);
      if (config.legacySessionStorageKey) {
        sessionStorage.removeItem(config.legacySessionStorageKey);
      }
    } catch {
      /* ignore */
    }
    return;
  }

  for (const key of memory.keys()) {
    if (key.startsWith(entryKeyPrefix)) memory.delete(key);
  }
  await idbDeleteNamespaceByPrefix(config.namespace, entryKeyPrefix);
  const legacy = readLegacyLocalRecordMap<T>(config);
  let changed = false;
  for (const key of Object.keys(legacy)) {
    if (key.startsWith(entryKeyPrefix)) {
      delete legacy[key];
      changed = true;
    }
  }
  if (changed) {
    writeDurableJsonRecord(
      config.legacyLocalStorageKey ?? config.namespace,
      legacy
    );
  }
}

export async function deleteIndexedDbRecordEntry<T extends WithUpdatedAt>(
  config: IndexedDbRecordStoreConfig,
  entryKey: string,
  memory: Map<string, T>
): Promise<void> {
  memory.delete(entryKey);
  await idbDeleteRecord(config.namespace, entryKey);
}

/** Tulis semua entry memori yang masih fresh ke IndexedDB (flush saat app di-background). */
export async function flushIndexedDbRecordMemory<T extends WithUpdatedAt>(
  config: IndexedDbRecordStoreConfig,
  memory: Map<string, T>
): Promise<void> {
  if (typeof window === "undefined" || memory.size === 0) return;
  const ttlMs = config.ttlMs ?? DEFAULT_DURABLE_CACHE_TTL_MS;
  const fresh = [...memory.entries()].filter(([, value]) =>
    isDurableSnapshotFresh(value, ttlMs)
  );
  if (fresh.length === 0) return;

  await migrateRecordMapToIndexedDb<T>(config);
  await Promise.all(
    fresh.map(([entryKey, value]) =>
      idbPutRecord(config.namespace, entryKey, value)
    )
  );
  await idbEvictNamespace(config.namespace, config.maxEntries);
}
