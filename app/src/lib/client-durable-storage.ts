/** Browser durable JSON storage (localStorage) with sessionStorage migration + TTL. */

export const DEFAULT_DURABLE_CACHE_TTL_MS = 30 * 60 * 1000;

type WithUpdatedAt = { updatedAt?: number };

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function migrateLegacyValue(
  key: string,
  legacySessionKey?: string
): string | null {
  if (!isBrowser()) return null;
  const current = localStorage.getItem(key);
  if (current) return current;
  if (!legacySessionKey) return null;
  const legacy = sessionStorage.getItem(legacySessionKey);
  if (!legacy) return null;
  try {
    localStorage.setItem(key, legacy);
    sessionStorage.removeItem(legacySessionKey);
  } catch {
    /* quota — baca legacy tanpa migrasi */
  }
  return legacy;
}

export function readDurableJsonValue<T>(
  key: string,
  options?: { legacySessionKey?: string }
): T | null {
  if (!isBrowser()) return null;
  try {
    const raw = migrateLegacyValue(key, options?.legacySessionKey);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeDurableJsonValue<T>(key: string, value: T): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export function removeDurableJsonValue(
  key: string,
  options?: { legacySessionKey?: string }
): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(key);
    if (options?.legacySessionKey) {
      sessionStorage.removeItem(options.legacySessionKey);
    }
  } catch {
    /* ignore */
  }
}

export function readDurableJsonRecord<T extends WithUpdatedAt>(
  storageKey: string,
  options?: { ttlMs?: number; legacySessionKey?: string }
): Record<string, T> {
  if (!isBrowser()) return {};
  const ttlMs = options?.ttlMs ?? DEFAULT_DURABLE_CACHE_TTL_MS;
  try {
    const raw = migrateLegacyValue(storageKey, options?.legacySessionKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, T>;
    if (!parsed || typeof parsed !== "object") return {};

    const now = Date.now();
    const out: Record<string, T> = {};
    let pruned = false;
    for (const [entryKey, value] of Object.entries(parsed)) {
      const updatedAt = value?.updatedAt ?? 0;
      if (ttlMs > 0 && updatedAt > 0 && now - updatedAt > ttlMs) {
        pruned = true;
        continue;
      }
      out[entryKey] = value;
    }
    if (pruned) writeDurableJsonRecord(storageKey, out);
    return out;
  } catch {
    return {};
  }
}

export function writeDurableJsonRecord<T>(
  storageKey: string,
  data: Record<string, T>
): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

export function isDurableSnapshotFresh(
  snapshot: WithUpdatedAt | null | undefined,
  ttlMs: number = DEFAULT_DURABLE_CACHE_TTL_MS
): boolean {
  if (!snapshot) return false;
  const updatedAt = snapshot.updatedAt ?? 0;
  if (updatedAt <= 0) return true;
  if (ttlMs <= 0) return true;
  return Date.now() - updatedAt <= ttlMs;
}
