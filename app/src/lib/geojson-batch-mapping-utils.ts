import { extractMultiPolygonFromGeoJSON } from "@/lib/geojson-multipolygon";

type GeoJsonFeature = {
  type: "Feature";
  properties?: unknown;
  geometry?: unknown;
};

export type GeoJsonFeatureCollectionForBatch = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

export type GeoJsonBatchPolygonRow = {
  /** Indeks fitur di `FeatureCollection.features` (sama urutan loop server). */
  featureIndex: number;
  props: Record<string, unknown>;
};

function featureProps(f: GeoJsonFeature): Record<string, unknown> {
  const p = f.properties;
  if (p && typeof p === "object" && !Array.isArray(p)) {
    return { ...(p as Record<string, unknown>) };
  }
  return {};
}

/** Fitur berurutan yang lolos Polygon/MultiPolygon (sama filter server batch). */
export function listGeoJsonBatchPolygonRows(
  fc: GeoJsonFeatureCollectionForBatch
): GeoJsonBatchPolygonRow[] {
  const rows: GeoJsonBatchPolygonRow[] = [];
  if (!Array.isArray(fc.features)) return rows;
  for (let i = 0; i < fc.features.length; i++) {
    const feat = fc.features[i];
    if (!feat || feat.type !== "Feature") continue;
    const props = featureProps(feat);
    const mp = extractMultiPolygonFromGeoJSON({
      type: "Feature",
      properties: props,
      geometry: feat.geometry as unknown,
    });
    if (!mp) continue;
    rows.push({ featureIndex: i, props });
  }
  return rows;
}

/** Aturan key sama `upsertIssueGeometryFeatureBatchAction` (prefix + kandidat / fallback). */
export function defaultGeoJsonBatchFeatureKey(
  featureIndex: number,
  props: Record<string, unknown>,
  keyPrefix: string
): string {
  const keyCandidate = props.feature_key ?? props.id ?? props.ID ?? props.Id;
  const keyRaw = keyCandidate == null ? "" : String(keyCandidate).trim();
  const fallbackKey = String(featureIndex + 1);
  return `${keyPrefix}${keyRaw || fallbackKey}`;
}

/** Aturan label sama server batch. */
export function defaultGeoJsonBatchLabel(props: Record<string, unknown>): string {
  const labelCandidate = props.label ?? props.Label ?? props.Nama ?? props.nama;
  if (labelCandidate == null) return "";
  return String(labelCandidate).trim();
}

export function applyGeoJsonBatchKeyLabelMapping(
  sourceText: string,
  keys: string[],
  labels: string[]
): { ok: true; json: string } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceText);
  } catch {
    return { ok: false, error: "GeoJSON batch tidak valid." };
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { type?: string }).type !== "FeatureCollection"
  ) {
    return { ok: false, error: "Batch harus FeatureCollection." };
  }
  const fc = parsed as GeoJsonFeatureCollectionForBatch;
  const rows = listGeoJsonBatchPolygonRows(fc);
  if (rows.length === 0) {
    return { ok: false, error: "Tidak ada poligon di FeatureCollection." };
  }
  if (rows.length !== keys.length || rows.length !== labels.length) {
    return {
      ok: false,
      error: "Jumlah baris mapping tidak cocok dengan jumlah poligon.",
    };
  }
  for (let j = 0; j < keys.length; j++) {
    if (!String(keys[j] ?? "").trim()) {
      return { ok: false, error: `Feature key kosong pada baris #${j + 1}.` };
    }
  }

  const out = JSON.parse(JSON.stringify(fc)) as GeoJsonFeatureCollectionForBatch;
  for (let j = 0; j < rows.length; j++) {
    const idx = rows[j]!.featureIndex;
    const feat = out.features[idx] as GeoJsonFeature;
    if (!feat || feat.type !== "Feature") continue;
    const base = featureProps(feat);
    base.feature_key = String(keys[j]).trim();
    const lab = String(labels[j] ?? "").trim();
    if (lab) {
      base.label = lab;
    } else {
      delete base.label;
      delete base.Label;
      delete base.Nama;
      delete base.nama;
    }
    feat.properties = base;
  }

  return { ok: true, json: JSON.stringify(out) };
}
