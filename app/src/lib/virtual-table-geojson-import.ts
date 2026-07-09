import { extractMultiPolygonFromGeoJSON } from "@/lib/geojson-multipolygon";
import {
  defaultGeoJsonBatchFeatureKey,
  defaultGeoJsonBatchLabel,
  listGeoJsonBatchLineRows,
  listGeoJsonBatchPointRows,
  listGeoJsonBatchPolygonRows,
  type GeoJsonFeatureCollectionForBatch,
} from "@/lib/geojson-batch-mapping-utils";

export const MAX_VIRTUAL_TABLE_GEOJSON_FEATURES = 5000;

export function normalizeVirtualTableMatchKey(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.toLowerCase();
}

/** Kolom teks/angka yang cocok untuk upsert impor GeoJSON/DXF. */
export type VirtualTableMatchColumnPick = {
  slug: string;
  display_name: string;
  data_type: string;
};

/** Pilih kolom kunci upsert: utamakan nib / no_bidang, hindari slug `title` bila ada alternatif. */
export function pickDefaultVirtualTableMatchColumn(
  columns: VirtualTableMatchColumnPick[]
): VirtualTableMatchColumnPick | undefined {
  if (columns.length === 0) return undefined;
  const preferSlugs = [
    "nib",
    "no_bidang",
    "nomor_bidang",
    "no_bidang_tanah",
    "nomor_bidang_tanah",
  ];
  for (const slug of preferSlugs) {
    const hit = columns.find((c) => c.slug === slug);
    if (hit) return hit;
  }
  const byDisplayNib = columns.find((c) => {
    const name = c.display_name.trim();
    if (/^nib$/i.test(name)) return true;
    return /\bnib\b/i.test(name) && !/tanggal/i.test(name);
  });
  if (byDisplayNib) return byDisplayNib;

  const nibLike = columns.find(
    (c) =>
      c.slug !== "title" &&
      (/nib|bidang|nomor/i.test(c.slug) ||
        /nomor\s*bidang/i.test(c.display_name))
  );
  if (nibLike) return nibLike;
  return (
    columns.find((c) => c.slug !== "title") ?? columns[0]
  );
}

/** Ambil kunci pencocokan dari properties feature (slug kolom + alias umum). */
export function extractMatchKeyFromProperties(
  props: Record<string, unknown>,
  matchColumnSlug: string,
  featureIndex: number,
  keyPrefix = ""
): string | null {
  const slug = matchColumnSlug.trim();
  const candidates: unknown[] = [];
  if (slug) {
    candidates.push(props[slug]);
    const upper = slug.toUpperCase();
    const lower = slug.toLowerCase();
    if (upper !== slug) candidates.push(props[upper]);
    if (lower !== slug) candidates.push(props[lower]);
  }
  candidates.push(
    props.nib,
    props.NIB,
    props.Nib,
    props.no_bidang,
    props.NO_BIDANG,
    props.No_Bidang,
    props.feature_key,
    props.id,
    props.ID
  );

  for (const c of candidates) {
    const s = c == null ? "" : String(c).trim();
    if (s) return s;
  }

  const fallback = defaultGeoJsonBatchFeatureKey(featureIndex, props, keyPrefix);
  return fallback.trim() || null;
}

export type GeoJsonFeatureForStorage = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: unknown;
};

/** Satu Feature per baris (untuk kolom geometry di virtual_rows.payload). */
export function featureToStoredGeometry(
  geometry: unknown,
  properties: Record<string, unknown>
): GeoJsonFeatureForStorage | null {
  const mp = extractMultiPolygonFromGeoJSON({
    type: "Feature",
    properties,
    geometry,
  });
  if (!mp) return null;

  return {
    type: "Feature",
    properties: { ...properties },
    geometry,
  };
}

/** Satu Feature Point per baris (kolom geometry titik di virtual_rows.payload). */
export function featureToStoredPointGeometry(
  geometry: unknown,
  properties: Record<string, unknown>
): GeoJsonFeatureForStorage | null {
  if (!geometry || typeof geometry !== "object") return null;
  const g = geometry as { type?: string; coordinates?: unknown };
  if (g.type !== "Point" || !Array.isArray(g.coordinates) || g.coordinates.length < 2) {
    return null;
  }
  const lng = Number(g.coordinates[0]);
  const lat = Number(g.coordinates[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return {
    type: "Feature",
    properties: { ...properties },
    geometry: { type: "Point", coordinates: [lng, lat] },
  };
}

/** Satu Feature LineString per baris. */
export function featureToStoredLineGeometry(
  geometry: unknown,
  properties: Record<string, unknown>
): GeoJsonFeatureForStorage | null {
  if (!geometry || typeof geometry !== "object") return null;
  const g = geometry as { type?: string; coordinates?: unknown };
  if (g.type !== "LineString" || !Array.isArray(g.coordinates)) return null;
  if (g.coordinates.length < 2) return null;
  for (const c of g.coordinates) {
    if (!Array.isArray(c) || c.length < 2) return null;
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  }
  return {
    type: "Feature",
    properties: { ...properties },
    geometry: {
      type: "LineString",
      coordinates: g.coordinates as [number, number][],
    },
  };
}

export type VirtualColumnForGeoJsonMap = {
  slug: string;
  data_type: string;
};

/** Ambil nilai property GeoJSON (case-insensitive key). */
export function geoProp(
  props: Record<string, unknown>,
  name: string
): unknown {
  const want = name.trim().toLowerCase();
  if (!want) return undefined;
  for (const [k, v] of Object.entries(props)) {
    if (k.toLowerCase() === want) return v;
  }
  return undefined;
}

/** Salin properties GeoJSON ke kolom teks/angka/pilihan jika slug cocok. */
export function mapPropertiesToPayload(
  props: Record<string, unknown>,
  columns: VirtualColumnForGeoJsonMap[],
  skipSlugs: Set<string>,
  skipGeoPropertyLower?: Set<string>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const slugByLower = new Map(
    columns.map((c) => [c.slug.toLowerCase(), c] as const)
  );
  const skipProps = skipGeoPropertyLower ?? new Set<string>();

  for (const [rawKey, rawVal] of Object.entries(props)) {
    if (rawVal == null || rawVal === "") continue;
    if (skipProps.has(rawKey.toLowerCase())) continue;
    const col = slugByLower.get(rawKey.toLowerCase());
    if (!col || skipSlugs.has(col.slug)) continue;
    if (
      col.data_type === "text" ||
      col.data_type === "url" ||
      col.data_type === "select"
    ) {
      out[col.slug] = String(rawVal).trim();
    } else if (col.data_type === "number") {
      const n = Number(String(rawVal).replace(",", "."));
      if (Number.isFinite(n)) out[col.slug] = n;
    }
  }
  return out;
}

export function parseFeatureCollectionForVirtualImport(
  raw: string
):
  | { ok: true; fc: GeoJsonFeatureCollectionForBatch; rows: ReturnType<typeof listGeoJsonBatchPolygonRows> }
  | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "GeoJSON tidak valid (bukan JSON)." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "GeoJSON harus berupa objek JSON." };
  }
  const obj = parsed as { type?: string; features?: unknown[] };
  if (obj.type !== "FeatureCollection" || !Array.isArray(obj.features)) {
    return {
      ok: false,
      error: "File harus GeoJSON FeatureCollection (banyak poligon per desa).",
    };
  }
  const fc = parsed as GeoJsonFeatureCollectionForBatch;
  const rows = listGeoJsonBatchPolygonRows(fc);
  if (rows.length === 0) {
    return {
      ok: false,
      error: "Tidak ada poligon valid (Polygon/MultiPolygon) di file.",
    };
  }
  if (rows.length > MAX_VIRTUAL_TABLE_GEOJSON_FEATURES) {
    return {
      ok: false,
      error: `Terlalu banyak poligon (${rows.length}). Maks. ${MAX_VIRTUAL_TABLE_GEOJSON_FEATURES} per impor.`,
    };
  }
  return { ok: true, fc, rows };
}

export function parseFeatureCollectionForPointImport(
  raw: string
):
  | { ok: true; fc: GeoJsonFeatureCollectionForBatch; rows: ReturnType<typeof listGeoJsonBatchPointRows> }
  | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "GeoJSON tidak valid (bukan JSON)." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "GeoJSON harus berupa objek JSON." };
  }
  const obj = parsed as { type?: string; features?: unknown[] };
  if (obj.type !== "FeatureCollection" || !Array.isArray(obj.features)) {
    return {
      ok: false,
      error: "File harus GeoJSON FeatureCollection (satu feature per titik).",
    };
  }
  const fc = parsed as GeoJsonFeatureCollectionForBatch;
  const rows = listGeoJsonBatchPointRows(fc);
  if (rows.length === 0) {
    return {
      ok: false,
      error: "Tidak ada titik valid (Point) di file.",
    };
  }
  if (rows.length > MAX_VIRTUAL_TABLE_GEOJSON_FEATURES) {
    return {
      ok: false,
      error: `Terlalu banyak titik (${rows.length}). Maks. ${MAX_VIRTUAL_TABLE_GEOJSON_FEATURES} per impor.`,
    };
  }
  return { ok: true, fc, rows };
}

export function parseFeatureCollectionForLineImport(
  raw: string
):
  | { ok: true; fc: GeoJsonFeatureCollectionForBatch; rows: ReturnType<typeof listGeoJsonBatchLineRows> }
  | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "GeoJSON tidak valid (bukan JSON)." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "GeoJSON harus berupa objek JSON." };
  }
  const obj = parsed as { type?: string; features?: unknown[] };
  if (obj.type !== "FeatureCollection" || !Array.isArray(obj.features)) {
    return {
      ok: false,
      error: "File harus GeoJSON FeatureCollection (satu feature garis per baris).",
    };
  }
  const fc = parsed as GeoJsonFeatureCollectionForBatch;
  const rows = listGeoJsonBatchLineRows(fc);
  if (rows.length === 0) {
    return {
      ok: false,
      error: "Tidak ada garis valid (LineString) di file.",
    };
  }
  if (rows.length > MAX_VIRTUAL_TABLE_GEOJSON_FEATURES) {
    return {
      ok: false,
      error: `Terlalu banyak garis (${rows.length}). Maks. ${MAX_VIRTUAL_TABLE_GEOJSON_FEATURES} per impor.`,
    };
  }
  return { ok: true, fc, rows };
}

export function pickDefaultVirtualTableLineMatchColumn(
  columns: VirtualTableMatchColumnPick[]
): VirtualTableMatchColumnPick | undefined {
  if (columns.length === 0) return undefined;
  const preferSlugs = [
    "no_garis",
    "kode_garis",
    "no_jalan",
    "kode_jalan",
    "title",
    "judul",
    "no_bidang",
  ];
  for (const slug of preferSlugs) {
    const hit = columns.find((c) => c.slug === slug);
    if (hit) return hit;
  }
  return pickDefaultVirtualTableMatchColumn(columns);
}

export function defaultTitleFromFeature(
  props: Record<string, unknown>,
  matchKey: string
): string {
  const label = defaultGeoJsonBatchLabel(props);
  if (label) return label;
  return `Bidang ${matchKey}`;
}
