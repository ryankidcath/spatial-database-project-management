/** Kolom payload dipakai untuk mencocokkan nilai CSV ke baris tabel target (default: title). */
export function relationLookupSlugFromConfig(
  config: Record<string, unknown> | null | undefined
): string {
  const raw = config?.lookup_slug;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "title";
}

export function normalizeRelationLookupKey(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.toLowerCase();
}

export type RelationLookupIndex = {
  /** normalized lookup key → target virtual_row id */
  byKey: Map<string, string>;
  /** keys that matched more than one row */
  ambiguousKeys: Map<string, number>;
  lookupSlug: string;
  targetTableId: string;
};

export function buildRelationLookupIndex(
  rows: { id: string; payload: Record<string, unknown> | null }[],
  lookupSlug: string,
  targetTableId: string
): RelationLookupIndex {
  const byKey = new Map<string, string>();
  const ambiguousKeys = new Map<string, number>();
  const bucket = new Map<string, string[]>();

  for (const row of rows) {
    const payload = row.payload ?? {};
    const key = normalizeRelationLookupKey(payload[lookupSlug]);
    if (!key) continue;
    const list = bucket.get(key) ?? [];
    list.push(row.id);
    bucket.set(key, list);
  }

  for (const [key, ids] of bucket) {
    if (ids.length > 1) {
      ambiguousKeys.set(key, ids.length);
    } else {
      byKey.set(key, ids[0]!);
    }
  }

  return { byKey, ambiguousKeys, lookupSlug, targetTableId };
}

export function resolveRelationIdFromCsv(
  raw: string,
  index: RelationLookupIndex,
  targetTableLabel: string
): { rowId?: string; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  const key = normalizeRelationLookupKey(trimmed);
  if (!key) return {};

  if (index.ambiguousKeys.has(key)) {
    const n = index.ambiguousKeys.get(key)!;
    return {
      error: `"${trimmed}" cocok ${n} baris di "${targetTableLabel}" (kolom ${index.lookupSlug} tidak unik)`,
    };
  }

  const rowId = index.byKey.get(key);
  if (!rowId) {
    return {
      error: `"${trimmed}" tidak ditemukan di "${targetTableLabel}" (cocokkan kolom ${index.lookupSlug}; pastikan tabel target sudah terisi)`,
    };
  }

  return { rowId };
}

/** Kunci `kolom1Norm::kolom2Norm` → baris tabel target (pasangan unik per grup). */
export type CompositeKecamatanTitleIndex = {
  byKey: Map<string, string>;
  ambiguousKeys: Map<string, number>;
  kecamatanSlug: string;
  titleSlug: string;
  targetTableId: string;
};

export function buildCompositeKecamatanTitleIndex(
  rows: { id: string; payload: Record<string, unknown> | null }[],
  kecamatanSlug: string,
  titleSlug: string,
  targetTableId: string
): CompositeKecamatanTitleIndex {
  const byKey = new Map<string, string>();
  const ambiguousKeys = new Map<string, number>();
  const bucket = new Map<string, string[]>();

  for (const row of rows) {
    const payload = row.payload ?? {};
    const kec = normalizeRelationLookupKey(payload[kecamatanSlug]);
    const tit = normalizeRelationLookupKey(payload[titleSlug]);
    if (!kec || !tit) continue;
    const compound = `${kec}::${tit}`;
    const list = bucket.get(compound) ?? [];
    list.push(row.id);
    bucket.set(compound, list);
  }

  for (const [key, ids] of bucket) {
    if (ids.length > 1) {
      ambiguousKeys.set(key, ids.length);
    } else {
      byKey.set(key, ids[0]!);
    }
  }

  return {
    byKey,
    ambiguousKeys,
    kecamatanSlug,
    titleSlug,
    targetTableId,
  };
}

export function resolveCompositeKecamatanTitle(
  kecamatanRaw: string,
  titleRaw: string,
  index: CompositeKecamatanTitleIndex,
  targetTableLabel: string
): { rowId?: string; error?: string } {
  const kec = normalizeRelationLookupKey(kecamatanRaw);
  const tit = normalizeRelationLookupKey(titleRaw);
  if (!kec || !tit) {
    return {
      error: `kedua nilai untuk lookup gabungan wajib di properties (kolom 1="${kecamatanRaw}", kolom 2="${titleRaw}")`,
    };
  }
  const compound = `${kec}::${tit}`;
  if (index.ambiguousKeys.has(compound)) {
    const n = index.ambiguousKeys.get(compound)!;
    return {
      error: `"${kecamatanRaw}" / "${titleRaw}" cocok ${n} baris di "${targetTableLabel}" (pasangan tidak unik)`,
    };
  }
  const rowId = index.byKey.get(compound);
  if (!rowId) {
    return {
      error: `Tidak ada baris di "${targetTableLabel}" yang cocok dengan pasangan tersebut (${kecamatanRaw} / ${titleRaw}). Sesuaikan ejaan atau data di tabel target.`,
    };
  }
  return { rowId };
}
