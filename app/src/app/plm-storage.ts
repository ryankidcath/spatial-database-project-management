/** Bucket private F5-4 — selaras migrasi `0014`. */
export const PLM_STORAGE_BUCKET_LEGALISASI = "plm-legalisasi" as const;
export const PLM_STORAGE_BUCKET_PENGUKURAN = "plm-pengukuran" as const;

export function sanitizeStorageFileName(name: string): string {
  const t = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return t.slice(0, 180) || "file";
}

export function legalisasiStorageObjectPath(
  legalisasiGuId: string,
  originalName: string
): string {
  const safe = sanitizeStorageFileName(originalName);
  return `${legalisasiGuId}/${crypto.randomUUID()}-${safe}`;
}

export function pengukuranStorageObjectPath(
  pengukuranId: string,
  originalName: string
): string {
  const safe = sanitizeStorageFileName(originalName);
  return `${pengukuranId}/${crypto.randomUUID()}-${safe}`;
}

export function isPendingStorageKey(key: string | null | undefined): boolean {
  return !key || key.startsWith("pending:");
}
