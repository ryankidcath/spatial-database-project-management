/**
 * Fase 7 — utilitas impor DXF split multi-tabel (mapping + kunci otomatis + ekstraksi).
 */

import type { IDxf } from "dxf-parser";
import {
  buildDxfPolygonizeOptionsFromForm,
  extractClosedPolygonRingsFromDxfLayer,
  extractOpenLineStringsFromDxfLayer,
  extractPointsFromDxfLayer,
  featureKeysForDxfPolygons,
  polygonizeDxfLayerToRings,
  type DxfLinePath,
  type DxfPoint,
  type DxfPolygonizeOptions,
  type LinearRing,
} from "@/lib/dxf-import-utils";
import {
  classifyDxfDocument,
  DXF_SPLIT_GEOM_KIND_LABELS,
  DXF_SPLIT_TARGET_LABELS,
  type DxfLayerClassificationSuggestion,
  type DxfSplitGeomKind,
  type DxfSplitTargetKind,
} from "@/lib/dxf-layer-classification";
import {
  buildVirtualTableDxfFeatureCollection,
  buildVirtualTableDxfLineStringFeatureCollection,
} from "@/lib/virtual-table-dxf-import";
import {
  defaultWorkbenchLayerTableName,
  type WorkbenchLayerKind,
} from "@/lib/virtual-table-workbench-layer-bootstrap";
import {
  defaultFieldPointTableName,
  FIELD_SURVEY_GROUP_KEY,
  fieldPointDisplayLabel,
  SURVEY_POINT_MATCH_COLUMN_SLUG,
  SURVEY_POINT_NAMA_SLUG,
  SURVEY_POINT_NO_BIDANG_SLUG,
  SURVEY_POINT_URUTAN_SLUG,
  surveyPointMatchKey,
} from "@/lib/virtual-table-survey-points-bootstrap";
import {
  dxfLinePathsToWgs84PreviewFeatureCollection,
  dxfPointsToWgs84PreviewFeatureCollection,
  dxfRingsToWgs84PreviewFeatureCollection,
  reprojectDxfPointTo4326,
} from "@/lib/crs-reproject";

export {
  DXF_SPLIT_GEOM_KIND_LABELS,
  DXF_SPLIT_TARGET_LABELS,
  type DxfSplitGeomKind,
  type DxfSplitTargetKind,
};

export const DXF_SPLIT_TARGET_COLORS: Record<
  DxfSplitTargetKind,
  { stroke: string; fill: string }
> = {
  bidang: { stroke: "#1d4ed8", fill: "#60a5fa" },
  jalan: { stroke: "#b45309", fill: "#fbbf24" },
  saluran: { stroke: "#0d9488", fill: "#5eead4" },
  titik: { stroke: "#7c3aed", fill: "#a78bfa" },
  skip: { stroke: "#6b7280", fill: "#9ca3af" },
};

export type DxfSplitMappingRow = {
  id: string;
  layerName: string;
  geomKind: DxfSplitGeomKind;
  target: DxfSplitTargetKind;
  enabled: boolean;
  entityCount: number;
  reason: string;
  matchKeys: string[];
  matchLabels: (string | null)[];
};

export type DxfSplitTargetTableConfig = {
  target: DxfSplitTargetKind;
  enabled: boolean;
  displayName: string;
};

export function splitMappingRowId(
  layerName: string,
  geomKind: DxfSplitGeomKind
): string {
  return `${layerName.trim()}::${geomKind}`;
}

function layerNameToSlug(layerName: string): string {
  return (
    layerName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "layer"
  );
}

export function defaultTableDisplayNameForSplitTarget(
  target: DxfSplitTargetKind
): string {
  switch (target) {
    case "bidang":
      return defaultWorkbenchLayerTableName("bidang");
    case "jalan":
      return defaultWorkbenchLayerTableName("jalan");
    case "saluran":
      return defaultWorkbenchLayerTableName("saluran");
    case "titik":
      return defaultFieldPointTableName();
    case "skip":
      return "";
  }
}

export function workbenchKindFromSplitTarget(
  target: DxfSplitTargetKind
): WorkbenchLayerKind | null {
  if (target === "bidang" || target === "jalan" || target === "saluran") {
    return target;
  }
  return null;
}

function countForGeomKind(
  counts: DxfLayerClassificationSuggestion["counts"],
  geomKind: DxfSplitGeomKind
): number {
  switch (geomKind) {
    case "polygon":
      return counts.closedPolygonCount + counts.hatchCount;
    case "linestring":
      return counts.openLineCount;
    case "point":
      return counts.pointCount;
    case "polygonize":
      return counts.polygonizeRingCount;
  }
}

function inferPrimaryGeomKind(
  counts: DxfLayerClassificationSuggestion["counts"],
  target: DxfSplitTargetKind
): DxfSplitGeomKind {
  if (target === "titik") return "point";
  if (target === "jalan" || target === "saluran") return "linestring";
  if (counts.closedPolygonCount + counts.hatchCount > 0) return "polygon";
  if (counts.polygonizeRingCount > 0) return "polygonize";
  if (counts.openLineCount > 0) return "linestring";
  return "polygon";
}

export function generateAutoMatchKeys(
  target: DxfSplitTargetKind,
  layerName: string,
  geomKind: DxfSplitGeomKind,
  count: number,
  keyPrefix = "dxf"
): { keys: string[]; labels: (string | null)[] } {
  const slug = layerNameToSlug(layerName);
  const keys: string[] = [];
  const labels: (string | null)[] = [];

  for (let i = 0; i < count; i++) {
    const n = i + 1;
    if (target === "titik") {
      keys.push(surveyPointMatchKey(FIELD_SURVEY_GROUP_KEY, n));
      labels.push(fieldPointDisplayLabel(n));
    } else if (target === "bidang") {
      keys.push(`${keyPrefix}-${slug}-b${n}`);
      labels.push(`DXF ${layerName} #${n}`);
    } else if (target === "jalan" || target === "saluran") {
      const letter = target === "saluran" ? "s" : "j";
      keys.push(`${keyPrefix}-${slug}-${letter}${n}`);
      labels.push(`DXF ${layerName} ${letter.toUpperCase()}${n}`);
    } else {
      keys.push(featureKeysForDxfPolygons(keyPrefix, layerName, count)[i]!);
      labels.push(null);
    }
  }

  return { keys, labels };
}

function createMappingRow(
  layerName: string,
  geomKind: DxfSplitGeomKind,
  target: DxfSplitTargetKind,
  count: number,
  reason: string,
  keyPrefix: string,
  enabled = true
): DxfSplitMappingRow {
  const { keys, labels } =
    target === "skip" || count === 0
      ? { keys: [] as string[], labels: [] as (string | null)[] }
      : generateAutoMatchKeys(target, layerName, geomKind, count, keyPrefix);
  return {
    id: splitMappingRowId(layerName, geomKind),
    layerName,
    geomKind,
    target,
    enabled: enabled && target !== "skip" && count > 0,
    entityCount: count,
    reason,
    matchKeys: keys,
    matchLabels: labels,
  };
}

/** Ubah hasil klasifikasi menjadi baris mapping editable (satu baris per layer+geom). */
export function buildMappingRowsFromClassifications(
  suggestions: DxfLayerClassificationSuggestion[],
  keyPrefix = "dxf"
): DxfSplitMappingRow[] {
  const rows: DxfSplitMappingRow[] = [];

  for (const s of suggestions) {
    if (s.source === "empty" || s.source === "skip_system") {
      rows.push(
        createMappingRow(
          s.layerName,
          "polygon",
          "skip",
          0,
          s.reason,
          keyPrefix,
          false
        )
      );
      continue;
    }

    if (s.splitGroups.length > 0) {
      for (const g of s.splitGroups) {
        if (g.count <= 0) continue;
        rows.push(
          createMappingRow(
            s.layerName,
            g.geomKind,
            g.suggestedTarget,
            g.count,
            g.reason,
            keyPrefix
          )
        );
      }
      continue;
    }

    if (s.suggestedTarget === "skip" || s.suggestedTarget === null) {
      rows.push(
        createMappingRow(
          s.layerName,
          inferPrimaryGeomKind(s.counts, "bidang"),
          "skip",
          0,
          s.reason,
          keyPrefix,
          false
        )
      );
      continue;
    }

    const geomKind = inferPrimaryGeomKind(s.counts, s.suggestedTarget);
    const count = countForGeomKind(s.counts, geomKind);
    rows.push(
      createMappingRow(
        s.layerName,
        geomKind,
        s.suggestedTarget,
        count,
        s.reason,
        keyPrefix
      )
    );
  }

  return rows;
}

/** Konfigurasi tabel bootstrap per jenis target yang dipakai. */
export function buildTargetTableConfigsFromRows(
  rows: DxfSplitMappingRow[]
): DxfSplitTargetTableConfig[] {
  const targets = new Set<DxfSplitTargetKind>();
  for (const row of rows) {
    if (row.enabled && row.target !== "skip") {
      targets.add(row.target);
    }
  }
  const order: DxfSplitTargetKind[] = [
    "bidang",
    "titik",
    "jalan",
    "saluran",
  ];
  return order
    .filter((t) => targets.has(t))
    .map((target) => ({
      target,
      enabled: true,
      displayName: defaultTableDisplayNameForSplitTarget(target),
    }));
}

export type ScanDxfForSplitImportResult = {
  rows: DxfSplitMappingRow[];
  targetTables: DxfSplitTargetTableConfig[];
  layerCount: number;
  enabledEntityCount: number;
};

export function scanDxfForSplitImport(
  dxf: IDxf,
  dxfSource: string,
  options?: {
    keyPrefix?: string;
    polygonizeOptions?: DxfPolygonizeOptions;
  }
): ScanDxfForSplitImportResult {
  const suggestions = classifyDxfDocument(dxf, dxfSource, {
    polygonizeOptions: options?.polygonizeOptions,
    includeEmptyLayers: true,
  });
  const rows = buildMappingRowsFromClassifications(
    suggestions,
    options?.keyPrefix ?? "dxf"
  );
  const targetTables = buildTargetTableConfigsFromRows(rows);
  const enabledEntityCount = rows
    .filter((r) => r.enabled)
    .reduce((sum, r) => sum + r.entityCount, 0);
  return {
    rows,
    targetTables,
    layerCount: suggestions.length,
    enabledEntityCount,
  };
}

export type ExtractedDxfGeometries =
  | { kind: "polygon"; rings: LinearRing[] }
  | { kind: "linestring"; paths: DxfLinePath[] }
  | { kind: "point"; points: DxfPoint[] };

export function extractGeometriesForMappingRow(
  dxf: IDxf,
  dxfSource: string,
  row: Pick<DxfSplitMappingRow, "layerName" | "geomKind">,
  polygonizeOptions?: DxfPolygonizeOptions
): ExtractedDxfGeometries {
  const layerName = row.layerName.trim();
  switch (row.geomKind) {
    case "polygon": {
      const rings = extractClosedPolygonRingsFromDxfLayer(
        dxf,
        layerName,
        dxfSource
      );
      return { kind: "polygon", rings };
    }
    case "polygonize": {
      const result = polygonizeDxfLayerToRings(
        dxf,
        layerName,
        polygonizeOptions ?? buildDxfPolygonizeOptionsFromForm(32749)
      );
      return { kind: "polygon", rings: result.rings };
    }
    case "linestring": {
      const paths = extractOpenLineStringsFromDxfLayer(dxf, layerName);
      return { kind: "linestring", paths };
    }
    case "point": {
      const points = extractPointsFromDxfLayer(dxf, layerName);
      return { kind: "point", points };
    }
  }
}

/** FeatureCollection titik lapangan dari POINT DXF (skema arsip titik). */
export function buildDxfSplitTitikFeatureCollection(
  points: DxfPoint[],
  matchKeys: string[],
  labels: (string | null)[],
  layerName: string,
  sourceEpsg: number
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < points.length; i++) {
    const matchKey = matchKeys[i]!.trim();
    if (!matchKey) {
      throw new Error(`Titik #${i + 1}: kunci pencocokan kosong`);
    }
    const [lng, lat] = reprojectDxfPointTo4326(points[i]!, sourceEpsg);
    const urutan = i + 1;
    const nama =
      labels[i]?.trim() || fieldPointDisplayLabel(urutan);
    features.push({
      type: "Feature",
      properties: {
        [SURVEY_POINT_MATCH_COLUMN_SLUG]: matchKey,
        [SURVEY_POINT_NO_BIDANG_SLUG]: FIELD_SURVEY_GROUP_KEY,
        [SURVEY_POINT_URUTAN_SLUG]: urutan,
        [SURVEY_POINT_NAMA_SLUG]: nama,
        label: nama,
        source: "dxf_split",
        dxf_layer: layerName,
        dxf_point_index: urutan,
      },
      geometry: {
        type: "Point",
        coordinates: [lng, lat],
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function buildImportFeatureCollectionForMappingRow(
  dxf: IDxf,
  dxfSource: string,
  row: DxfSplitMappingRow,
  matchColumnSlug: string,
  sourceEpsg: number,
  polygonizeOptions?: DxfPolygonizeOptions
): GeoJSON.FeatureCollection {
  const extracted = extractGeometriesForMappingRow(
    dxf,
    dxfSource,
    row,
    polygonizeOptions
  );

  if (row.target === "titik" && extracted.kind === "point") {
    if (extracted.points.length !== row.matchKeys.length) {
      throw new Error(
        `Jumlah titik (${extracted.points.length}) tidak sama dengan kunci (${row.matchKeys.length}).`
      );
    }
    return buildDxfSplitTitikFeatureCollection(
      extracted.points,
      row.matchKeys,
      row.matchLabels,
      row.layerName,
      sourceEpsg
    );
  }

  if (extracted.kind === "polygon") {
    if (extracted.rings.length !== row.matchKeys.length) {
      throw new Error(
        `Jumlah poligon (${extracted.rings.length}) tidak sama dengan kunci (${row.matchKeys.length}) pada layer «${row.layerName}».`
      );
    }
    return buildVirtualTableDxfFeatureCollection(
      extracted.rings,
      row.matchKeys,
      row.matchLabels,
      matchColumnSlug,
      row.layerName,
      sourceEpsg
    );
  }

  if (extracted.kind === "linestring") {
    if (extracted.paths.length !== row.matchKeys.length) {
      throw new Error(
        `Jumlah garis (${extracted.paths.length}) tidak sama dengan kunci (${row.matchKeys.length}) pada layer «${row.layerName}».`
      );
    }
    return buildVirtualTableDxfLineStringFeatureCollection(
      extracted.paths,
      row.matchKeys,
      row.matchLabels,
      matchColumnSlug,
      row.layerName,
      sourceEpsg
    );
  }

  throw new Error(
    `Jenis geometri tidak cocok untuk target «${row.target}» pada layer «${row.layerName}».`
  );
}

function previewFcWithTarget(
  fc: GeoJSON.FeatureCollection,
  row: DxfSplitMappingRow
): GeoJSON.Feature[] {
  return fc.features.map((f, i) => ({
    ...f,
    properties: {
      ...(f.properties ?? {}),
      splitTarget: row.target,
      splitRowId: row.id,
      splitPreviewIndex: i,
      dxfLayer: row.layerName,
      dxfGeomKind: row.geomKind,
    },
  }));
}

/** Gabungkan pratinjau semua baris aktif — warna per target di peta. */
export function buildSplitPreviewFeatureCollection(
  dxf: IDxf,
  dxfSource: string,
  rows: DxfSplitMappingRow[],
  sourceEpsg: number,
  polygonizeOptions?: DxfPolygonizeOptions
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const row of rows) {
    if (!row.enabled || row.target === "skip" || row.entityCount === 0) {
      continue;
    }
    try {
      const extracted = extractGeometriesForMappingRow(
        dxf,
        dxfSource,
        row,
        polygonizeOptions
      );
      let fc: GeoJSON.FeatureCollection;
      if (extracted.kind === "polygon" && extracted.rings.length > 0) {
        fc = dxfRingsToWgs84PreviewFeatureCollection(
          extracted.rings,
          sourceEpsg
        );
      } else if (extracted.kind === "linestring" && extracted.paths.length > 0) {
        fc = dxfLinePathsToWgs84PreviewFeatureCollection(
          extracted.paths,
          sourceEpsg
        );
      } else if (extracted.kind === "point" && extracted.points.length > 0) {
        fc = dxfPointsToWgs84PreviewFeatureCollection(
          extracted.points,
          sourceEpsg
        );
      } else {
        continue;
      }
      features.push(...previewFcWithTarget(fc, row));
    } catch {
      // Pratinjau best-effort — baris tetap bisa diimpor setelah koreksi SRID.
    }
  }

  return { type: "FeatureCollection", features };
}

export type DxfSplitImportPayloadRow = {
  layerName: string;
  geomKind: DxfSplitGeomKind;
  target: DxfSplitTargetKind;
  enabled: boolean;
  matchKeys: string[];
  matchLabels: (string | null)[];
};

export type DxfSplitImportPayload = {
  targetTables: DxfSplitTargetTableConfig[];
  rows: DxfSplitImportPayloadRow[];
};

export function parseDxfSplitImportPayload(raw: unknown): {
  ok: true;
  payload: DxfSplitImportPayload;
} | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "mapping_json tidak valid." };
  }
  const obj = raw as Record<string, unknown>;
  const targetTablesRaw = obj.targetTables;
  const rowsRaw = obj.rows;
  if (!Array.isArray(targetTablesRaw) || !Array.isArray(rowsRaw)) {
    return { ok: false, error: "mapping_json harus berisi targetTables dan rows." };
  }

  const targetTables: DxfSplitTargetTableConfig[] = [];
  for (const item of targetTablesRaw) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const target = String(t.target ?? "").trim().toLowerCase() as DxfSplitTargetKind;
    if (
      target !== "bidang" &&
      target !== "jalan" &&
      target !== "saluran" &&
      target !== "titik"
    ) {
      continue;
    }
    targetTables.push({
      target,
      enabled: t.enabled !== false,
      displayName:
        String(t.displayName ?? "").trim() ||
        defaultTableDisplayNameForSplitTarget(target),
    });
  }

  const rows: DxfSplitImportPayloadRow[] = [];
  for (const item of rowsRaw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const layerName = String(r.layerName ?? "").trim();
    const geomKind = String(r.geomKind ?? "").trim() as DxfSplitGeomKind;
    const target = String(r.target ?? "").trim().toLowerCase() as DxfSplitTargetKind;
    if (!layerName) continue;
    if (
      geomKind !== "polygon" &&
      geomKind !== "linestring" &&
      geomKind !== "point" &&
      geomKind !== "polygonize"
    ) {
      return { ok: false, error: `geomKind tidak dikenal pada layer «${layerName}».` };
    }
    if (
      target !== "bidang" &&
      target !== "jalan" &&
      target !== "saluran" &&
      target !== "titik" &&
      target !== "skip"
    ) {
      return { ok: false, error: `target tidak dikenal pada layer «${layerName}».` };
    }
    const matchKeys = Array.isArray(r.matchKeys)
      ? r.matchKeys.map((k) => String(k ?? "").trim())
      : [];
    const matchLabels = Array.isArray(r.matchLabels)
      ? r.matchLabels.map((l) => {
          const t = String(l ?? "").trim();
          return t.length > 0 ? t : null;
        })
      : [];
    rows.push({
      layerName,
      geomKind,
      target,
      enabled: r.enabled !== false,
      matchKeys,
      matchLabels,
    });
  }

  if (rows.filter((r) => r.enabled && r.target !== "skip").length === 0) {
    return { ok: false, error: "Tidak ada layer aktif untuk diimpor." };
  }

  return { ok: true, payload: { targetTables, rows } };
}

export function matchColumnSlugForSplitTarget(
  target: DxfSplitTargetKind
): string {
  switch (target) {
    case "bidang":
      return "no_bidang";
    case "jalan":
    case "saluran":
      return "no_garis";
    case "titik":
      return SURVEY_POINT_MATCH_COLUMN_SLUG;
    case "skip":
      return "";
  }
}

export function geometryColumnSlugForSplitTarget(
  _target: DxfSplitTargetKind
): string {
  return "geom";
}

export function geometryKindForSplitTarget(
  target: DxfSplitTargetKind
): "polygon" | "linestring" | "point" {
  switch (target) {
    case "titik":
      return "point";
    case "jalan":
    case "saluran":
      return "linestring";
    default:
      return "polygon";
  }
}
