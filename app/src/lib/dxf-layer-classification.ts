/**
 * Fase 7 — heuristik klasifikasi layer CAD → target tabel workbench.
 *
 * Pendekatan A: alias nama layer (BIDANG, JALAN, TITIK, …).
 * Pendekatan B: jenis geometri (poligon tertutup / garis terbuka / POINT / polygonize).
 *
 * Hasil = saran saja; UI mapping wajib review sebelum simpan.
 */

import type { IDxf } from "dxf-parser";
import {
  extractClosedHatchRingsFromDxfSource,
  extractClosedPolygonRingsFromDxfLayer,
  extractLineSegmentsFromDxfLayer,
  extractOpenLineStringsFromDxfLayer,
  extractPointsFromDxfLayer,
  listDxfLayerNames,
  type DxfPolygonizeOptions,
} from "@/lib/dxf-import-utils";
import {
  DEFAULT_DXF_POLYGONIZE_SNAP_METERS,
  polygonizeLineSegments,
} from "@/lib/dxf-line-polygonize";

/** Target tabel workbench / aksi untuk satu kelompok fitur DXF. */
export type DxfSplitTargetKind =
  | "bidang"
  | "jalan"
  | "saluran"
  | "titik"
  | "skip";

/** Jenis geometri yang diekstrak dari satu layer (atau pecahan layer campuran). */
export type DxfSplitGeomKind =
  | "polygon"
  | "linestring"
  | "point"
  | "polygonize";

export type DxfLayerGeomCounts = {
  /** LW/PL tertutup (tanpa HATCH). */
  closedPolygonCount: number;
  /** Ring dari HATCH pada layer. */
  hatchCount: number;
  /** LINE / LW/PL terbuka. */
  openLineCount: number;
  /** Entitas POINT (+ POINT dalam INSERT). */
  pointCount: number;
  /** Segmen garis untuk kandidat polygonize. */
  lineSegmentCount: number;
  /** Poligon hasil uji polygonize (0 bila tidak diuji / gagal). */
  polygonizeRingCount: number;
};

export type DxfLayerSplitGroupSuggestion = {
  geomKind: DxfSplitGeomKind;
  suggestedTarget: DxfSplitTargetKind;
  count: number;
  reason: string;
};

export type DxfLayerAliasMatch = {
  target: DxfSplitTargetKind;
  /** Alias yang cocok (bentuk dinormalisasi). */
  matchedAlias: string;
  confidence: "high" | "medium";
};

export type DxfLayerClassificationSuggestion = {
  layerName: string;
  counts: DxfLayerGeomCounts;
  /** Saran utama bila layer dianggap homogen; `null` bila kosong / wajib pecah. */
  suggestedTarget: DxfSplitTargetKind | null;
  confidence: "high" | "medium" | "low";
  reason: string;
  source: "layer_alias" | "geometry" | "mixed" | "empty" | "skip_system";
  aliasMatch: DxfLayerAliasMatch | null;
  /** Pecahan saran untuk layer campuran atau jaringan garis. */
  splitGroups: DxfLayerSplitGroupSuggestion[];
};

export const DXF_SPLIT_TARGET_LABELS: Record<DxfSplitTargetKind, string> = {
  bidang: "Bidang",
  jalan: "Jalan",
  saluran: "Saluran",
  titik: "Titik lapangan",
  skip: "Lewati",
};

export const DXF_SPLIT_GEOM_KIND_LABELS: Record<DxfSplitGeomKind, string> = {
  polygon: "Poligon tertutup",
  linestring: "Garis terbuka",
  point: "Titik",
  polygonize: "Bangun dari garis",
};

/** Layer sistem AutoCAD yang biasanya tidak diimpor. */
const SYSTEM_SKIP_LAYERS = new Set([
  "defpoints",
  "defpoints ",
  "*adsk_inventory",
]);

type AliasRule = {
  target: DxfSplitTargetKind;
  /** Token dinormalisasi (huruf kecil, tanpa pemisah). */
  aliases: string[];
  confidence: "high" | "medium";
};

/**
 * Alias nama layer CAD umum (ID + EN). Cocokkan setelah normalisasi:
 * hapus spasi/`_`/`-`/`.` dan angka trailing opsional tetap ikut di string.
 */
const LAYER_ALIAS_RULES: AliasRule[] = [
  {
    target: "bidang",
    confidence: "high",
    aliases: [
      "bidang",
      "bidangtanah",
      "bidanghasilukur",
      "persil",
      "parcel",
      "parcels",
      "lot",
      "lots",
      "plot",
      "plots",
      "kavling",
      "tanah",
      "batasbidang",
      "boundary",
      "boundaries",
      "hatch",
      "hatches",
      "area",
      "areas",
      "polygon",
      "polygons",
      "poligon",
    ],
  },
  {
    target: "jalan",
    confidence: "high",
    aliases: [
      "jalan",
      "jalur",
      "road",
      "roads",
      "street",
      "streets",
      "centerline",
      "centreline",
      "asjalan",
      "row",
      "rightofway",
      "path",
      "paths",
    ],
  },
  {
    target: "saluran",
    confidence: "high",
    aliases: [
      "saluran",
      "drain",
      "drainase",
      "drainage",
      "pipa",
      "pipe",
      "pipes",
      "irigasi",
      "irrigation",
      "channel",
      "channels",
      "got",
      "selokan",
      "gorong",
      "culvert",
      "utilitas",
      "utility",
      "utilities",
    ],
  },
  {
    target: "titik",
    confidence: "high",
    aliases: [
      "titik",
      "titikukur",
      "titiklapangan",
      "point",
      "points",
      "patok",
      "patokbatas",
      "bm",
      "benchmark",
      "control",
      "controlpoint",
      "controlpoints",
      "surveypoint",
      "surveypoints",
      "gps",
      "stake",
      "stakes",
    ],
  },
  {
    target: "skip",
    confidence: "medium",
    aliases: [
      "text",
      "teks",
      "dim",
      "dims",
      "dimension",
      "dimensions",
      "annot",
      "annotation",
      "annotations",
      "legend",
      "legenda",
      "viewport",
      "viewports",
      "frame",
      "titleblock",
      "kartu",
    ],
  },
];

/** Normalisasi nama layer untuk pencocokan alias. */
export function normalizeDxfLayerNameForAlias(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function isSystemSkipLayer(layerName: string): boolean {
  const raw = layerName.trim().toLowerCase();
  if (!raw) return true;
  if (SYSTEM_SKIP_LAYERS.has(raw)) return true;
  if (raw.startsWith("*")) return true;
  const norm = normalizeDxfLayerNameForAlias(layerName);
  return norm === "defpoints";
}

/**
 * Cocokkan nama layer ke alias target. Prioritas: exact → prefix/suffix token → includes.
 */
export function matchDxfLayerAlias(
  layerName: string
): DxfLayerAliasMatch | null {
  const norm = normalizeDxfLayerNameForAlias(layerName);
  if (!norm || norm === "0" || norm === "layer" || norm === "layer0") {
    return null;
  }

  let best: DxfLayerAliasMatch | null = null;
  let bestScore = 0;

  for (const rule of LAYER_ALIAS_RULES) {
    for (const alias of rule.aliases) {
      if (!alias) continue;
      let score = 0;
      if (norm === alias) {
        score = 100;
      } else if (norm.startsWith(alias) || norm.endsWith(alias)) {
        // Hindari alias pendek yang terlalu longgar (mis. "bm", "row").
        if (alias.length < 3 && norm !== alias) continue;
        score = 70 + Math.min(alias.length, 20);
      } else if (alias.length >= 4 && norm.includes(alias)) {
        score = 50 + Math.min(alias.length, 20);
      } else {
        continue;
      }

      if (score > bestScore) {
        bestScore = score;
        best = {
          target: rule.target,
          matchedAlias: alias,
          confidence: score >= 90 ? rule.confidence : "medium",
        };
      }
    }
  }

  return best;
}

function emptyCounts(): DxfLayerGeomCounts {
  return {
    closedPolygonCount: 0,
    hatchCount: 0,
    openLineCount: 0,
    pointCount: 0,
    lineSegmentCount: 0,
    polygonizeRingCount: 0,
  };
}

function totalClosed(counts: DxfLayerGeomCounts): number {
  return counts.closedPolygonCount + counts.hatchCount;
}

function hasAnyGeometry(counts: DxfLayerGeomCounts): boolean {
  return (
    totalClosed(counts) > 0 ||
    counts.openLineCount > 0 ||
    counts.pointCount > 0 ||
    counts.lineSegmentCount > 0
  );
}

/**
 * Hitung isi geometri per layer CAD (untuk scan + heuristik B).
 * Uji polygonize hanya bila tidak ada poligon tertutup tapi ada jaringan garis.
 */
export function scanDxfLayerGeometry(
  dxf: IDxf,
  layerName: string,
  dxfSource?: string,
  polygonizeOptions?: DxfPolygonizeOptions
): DxfLayerGeomCounts {
  const name = layerName.trim();
  if (!name) return emptyCounts();

  const closedWithoutHatch = extractClosedPolygonRingsFromDxfLayer(
    dxf,
    name,
    undefined
  );
  const hatchRings =
    dxfSource && dxfSource.trim()
      ? extractClosedHatchRingsFromDxfSource(dxfSource, name)
      : [];
  const openLines = extractOpenLineStringsFromDxfLayer(dxf, name);
  const points = extractPointsFromDxfLayer(dxf, name);
  const segments = extractLineSegmentsFromDxfLayer(dxf, name);

  const counts: DxfLayerGeomCounts = {
    closedPolygonCount: closedWithoutHatch.length,
    hatchCount: hatchRings.length,
    openLineCount: openLines.length,
    pointCount: points.length,
    lineSegmentCount: segments.length,
    polygonizeRingCount: 0,
  };

  const closed = totalClosed(counts);
  if (
    closed === 0 &&
    counts.pointCount === 0 &&
    segments.length >= 3
  ) {
    const result = polygonizeLineSegments(segments, {
      snapTolerance:
        polygonizeOptions?.snapTolerance ?? DEFAULT_DXF_POLYGONIZE_SNAP_METERS,
      minArea: polygonizeOptions?.minArea,
      dropLargestFace: polygonizeOptions?.dropLargestFace ?? true,
    });
    counts.polygonizeRingCount = result.rings.length;
  }

  return counts;
}

function geometryKindPresence(counts: DxfLayerGeomCounts): {
  polygon: boolean;
  linestring: boolean;
  point: boolean;
  polygonize: boolean;
} {
  return {
    polygon: totalClosed(counts) > 0,
    linestring: counts.openLineCount > 0,
    point: counts.pointCount > 0,
    polygonize:
      totalClosed(counts) === 0 &&
      counts.pointCount === 0 &&
      counts.polygonizeRingCount > 0,
  };
}

function countPresentKinds(
  presence: ReturnType<typeof geometryKindPresence>
): number {
  return (
    Number(presence.polygon) +
    Number(presence.linestring) +
    Number(presence.point) +
    Number(presence.polygonize && !presence.linestring ? 1 : 0)
  );
}

/**
 * Bangun pecahan saran untuk layer campuran / jaringan garis.
 * Kebijakan: jalan vs saluran tidak 100% otomatis — default garis = Jalan.
 */
export function buildSplitGroupsFromGeometry(
  counts: DxfLayerGeomCounts,
  lineDefault: DxfSplitTargetKind = "jalan"
): DxfLayerSplitGroupSuggestion[] {
  const groups: DxfLayerSplitGroupSuggestion[] = [];
  const closed = totalClosed(counts);

  if (closed > 0) {
    groups.push({
      geomKind: "polygon",
      suggestedTarget: "bidang",
      count: closed,
      reason:
        counts.hatchCount > 0 && counts.closedPolygonCount > 0
          ? `${counts.closedPolygonCount} poligon tertutup + ${counts.hatchCount} hatch → Bidang`
          : counts.hatchCount > 0
            ? `${counts.hatchCount} hatch → Bidang`
            : `${closed} poligon tertutup → Bidang`,
    });
  }

  if (counts.pointCount > 0) {
    groups.push({
      geomKind: "point",
      suggestedTarget: "titik",
      count: counts.pointCount,
      reason: `${counts.pointCount} POINT → Titik lapangan`,
    });
  }

  if (
    closed === 0 &&
    counts.pointCount === 0 &&
    counts.polygonizeRingCount > 0
  ) {
    groups.push({
      geomKind: "polygonize",
      suggestedTarget: "bidang",
      count: counts.polygonizeRingCount,
      reason: `Jaringan garis membentuk ${counts.polygonizeRingCount} loop → Bidang (polygonize)`,
    });
    if (counts.openLineCount > 0) {
      groups.push({
        geomKind: "linestring",
        suggestedTarget: lineDefault,
        count: counts.openLineCount,
        reason: `Sisa / garis terbuka (${counts.openLineCount}) → ${DXF_SPLIT_TARGET_LABELS[lineDefault]} (default; ubah ke Saluran bila perlu)`,
      });
    }
  } else if (counts.openLineCount > 0) {
    groups.push({
      geomKind: "linestring",
      suggestedTarget: lineDefault,
      count: counts.openLineCount,
      reason: `${counts.openLineCount} garis terbuka → ${DXF_SPLIT_TARGET_LABELS[lineDefault]} (default; ubah ke Saluran bila perlu)`,
    });
  }

  return groups;
}

function classifyFromGeometryOnly(
  layerName: string,
  counts: DxfLayerGeomCounts
): DxfLayerClassificationSuggestion {
  if (!hasAnyGeometry(counts)) {
    return {
      layerName,
      counts,
      suggestedTarget: "skip",
      confidence: "high",
      reason: "Layer tanpa geometri yang dikenali — lewati",
      source: "empty",
      aliasMatch: null,
      splitGroups: [],
    };
  }

  const presence = geometryKindPresence(counts);
  const closed = totalClosed(counts);
  const splitGroups = buildSplitGroupsFromGeometry(counts);

  // Homogen: hanya titik
  if (presence.point && !presence.polygon && !presence.linestring && !presence.polygonize) {
    return {
      layerName,
      counts,
      suggestedTarget: "titik",
      confidence: "high",
      reason: `${counts.pointCount} POINT → Titik lapangan`,
      source: "geometry",
      aliasMatch: null,
      splitGroups,
    };
  }

  // Homogen: hanya poligon/hatch tertutup
  if (presence.polygon && !presence.point && !presence.linestring) {
    return {
      layerName,
      counts,
      suggestedTarget: "bidang",
      confidence: "high",
      reason:
        counts.hatchCount > 0 && counts.closedPolygonCount === 0
          ? `${counts.hatchCount} hatch → Bidang`
          : `${closed} poligon tertutup → Bidang`,
      source: "geometry",
      aliasMatch: null,
      splitGroups,
    };
  }

  // Homogen: hanya garis — polygonize berhasil → Bidang; else Jalan
  if (!presence.polygon && !presence.point && (presence.linestring || presence.polygonize)) {
    if (counts.polygonizeRingCount > 0) {
      return {
        layerName,
        counts,
        suggestedTarget: null,
        confidence: "medium",
        reason:
          "Jaringan garis: saran pecah polygonize → Bidang; garis terbuka → Jalan (review)",
        source: "mixed",
        aliasMatch: null,
        splitGroups,
      };
    }
    return {
      layerName,
      counts,
      suggestedTarget: "jalan",
      confidence: "medium",
      reason: `${counts.openLineCount} garis terbuka → Jalan (default; pilih Saluran di mapping bila perlu)`,
      source: "geometry",
      aliasMatch: null,
      splitGroups,
    };
  }

  // Campuran beberapa jenis geom
  return {
    layerName,
    counts,
    suggestedTarget: null,
    confidence: "low",
    reason: "Layer campuran — pecah per jenis geometri (review mapping)",
    source: "mixed",
    aliasMatch: null,
    splitGroups,
  };
}

/**
 * Gabungkan alias nama layer (A) + heuristik geometri (B) menjadi saran mapping.
 */
export function classifyDxfLayer(
  layerName: string,
  counts: DxfLayerGeomCounts
): DxfLayerClassificationSuggestion {
  const name = layerName.trim() || "(tanpa nama)";

  if (isSystemSkipLayer(name)) {
    return {
      layerName: name,
      counts,
      suggestedTarget: "skip",
      confidence: "high",
      reason: "Layer sistem CAD — lewati",
      source: "skip_system",
      aliasMatch: null,
      splitGroups: [],
    };
  }

  if (!hasAnyGeometry(counts)) {
    return {
      layerName: name,
      counts,
      suggestedTarget: "skip",
      confidence: "high",
      reason: "Layer tanpa geometri yang dikenali — lewati",
      source: "empty",
      aliasMatch: null,
      splitGroups: [],
    };
  }

  const alias = matchDxfLayerAlias(name);
  const geomResult = classifyFromGeometryOnly(name, counts);
  const presence = geometryKindPresence(counts);
  const mixedGeom =
    geomResult.source === "mixed" ||
    countPresentKinds(presence) > 1 ||
    (presence.polygon && presence.point) ||
    (presence.polygon && presence.linestring) ||
    (presence.point && presence.linestring);

  if (!alias) {
    return geomResult;
  }

  // Alias skip (teks/dimensi) — hormati kecuali layer penuh geometri survey
  if (alias.target === "skip") {
    if (mixedGeom || totalClosed(counts) > 0 || counts.pointCount > 0) {
      return {
        ...geomResult,
        aliasMatch: alias,
        confidence: "low",
        reason: `Nama layer mengarah ke anotasi (${alias.matchedAlias}), tetapi ada geometri — ikuti pecahan geom (review)`,
        source: mixedGeom ? "mixed" : "geometry",
      };
    }
    return {
      layerName: name,
      counts,
      suggestedTarget: "skip",
      confidence: alias.confidence,
      reason: `Nama layer «${alias.matchedAlias}» → Lewati`,
      source: "layer_alias",
      aliasMatch: alias,
      splitGroups: [],
    };
  }

  // Layer campuran: alias memberi default untuk jenis yang cocok, tetap pecah
  if (mixedGeom) {
    const splitGroups = buildSplitGroupsFromGeometry(
      counts,
      alias.target === "saluran" ? "saluran" : "jalan"
    ).map((g) => {
      if (g.geomKind === "point" && alias.target === "titik") {
        return {
          ...g,
          suggestedTarget: "titik" as const,
          reason: `${g.reason} (alias layer: ${alias.matchedAlias})`,
        };
      }
      if (
        (g.geomKind === "polygon" || g.geomKind === "polygonize") &&
        alias.target === "bidang"
      ) {
        return {
          ...g,
          suggestedTarget: "bidang" as const,
          reason: `${g.reason} (alias layer: ${alias.matchedAlias})`,
        };
      }
      if (
        g.geomKind === "linestring" &&
        (alias.target === "jalan" || alias.target === "saluran")
      ) {
        return {
          ...g,
          suggestedTarget: alias.target,
          reason: `${counts.openLineCount} garis terbuka → ${DXF_SPLIT_TARGET_LABELS[alias.target]} (alias: ${alias.matchedAlias})`,
        };
      }
      return g;
    });

    return {
      layerName: name,
      counts,
      suggestedTarget: null,
      confidence: "low",
      reason: `Layer campuran; alias «${alias.matchedAlias}» dipakai sebagai petunjuk pecahan`,
      source: "mixed",
      aliasMatch: alias,
      splitGroups,
    };
  }

  // Homogen + alias: validasi kesesuaian alias vs geom
  const geomTarget = geomResult.suggestedTarget;
  if (geomTarget && geomTarget !== "skip" && geomTarget !== alias.target) {
    // Alias saluran/jalan sama-sama LineString — hormati alias
    if (
      geomTarget === "jalan" &&
      (alias.target === "jalan" || alias.target === "saluran")
    ) {
      return {
        layerName: name,
        counts,
        suggestedTarget: alias.target,
        confidence: alias.confidence,
        reason: `${counts.openLineCount} garis terbuka + alias «${alias.matchedAlias}» → ${DXF_SPLIT_TARGET_LABELS[alias.target]}`,
        source: "layer_alias",
        aliasMatch: alias,
        splitGroups: buildSplitGroupsFromGeometry(counts, alias.target),
      };
    }

    // Konflik (mis. nama BIDANG tapi isinya POINT) — utamakan geometri, turunkan confidence
    return {
      ...geomResult,
      aliasMatch: alias,
      confidence: "low",
      reason: `Alias «${alias.matchedAlias}» (${DXF_SPLIT_TARGET_LABELS[alias.target]}) bertentangan dengan geometri → ikuti geometri: ${geomResult.reason}`,
      source: "geometry",
    };
  }

  // Alias selaras dengan geom (atau geom null karena polygonize split sudah ditangani di mixed)
  if (geomTarget === alias.target || geomTarget === null) {
    const splitGroups =
      alias.target === "jalan" || alias.target === "saluran"
        ? buildSplitGroupsFromGeometry(counts, alias.target)
        : geomResult.splitGroups;
    return {
      layerName: name,
      counts,
      suggestedTarget: alias.target,
      confidence: alias.confidence,
      reason: `Nama layer «${alias.matchedAlias}» → ${DXF_SPLIT_TARGET_LABELS[alias.target]}`,
      source: "layer_alias",
      aliasMatch: alias,
      splitGroups,
    };
  }

  return {
    layerName: name,
    counts,
    suggestedTarget: alias.target,
    confidence: alias.confidence,
    reason: `Nama layer «${alias.matchedAlias}» → ${DXF_SPLIT_TARGET_LABELS[alias.target]}`,
    source: "layer_alias",
    aliasMatch: alias,
    splitGroups: geomResult.splitGroups,
  };
}

export type ClassifyDxfDocumentOptions = {
  polygonizeOptions?: DxfPolygonizeOptions;
  /** Sertakan layer kosong / sistem (default: ya, agar UI bisa menampilkan «lewati»). */
  includeEmptyLayers?: boolean;
};

/**
 * Scan semua layer DXF + saran klasifikasi (A+B) untuk wizard Fase 7.
 */
export function classifyDxfDocument(
  dxf: IDxf,
  dxfSource?: string,
  options?: ClassifyDxfDocumentOptions
): DxfLayerClassificationSuggestion[] {
  const includeEmpty = options?.includeEmptyLayers !== false;
  const names = listDxfLayerNames(dxf, dxfSource);
  const out: DxfLayerClassificationSuggestion[] = [];

  for (const layerName of names) {
    const counts = scanDxfLayerGeometry(
      dxf,
      layerName,
      dxfSource,
      options?.polygonizeOptions
    );
    const suggestion = classifyDxfLayer(layerName, counts);
    if (
      !includeEmpty &&
      (suggestion.source === "empty" || suggestion.source === "skip_system")
    ) {
      continue;
    }
    out.push(suggestion);
  }

  return out;
}

export function parseDxfSplitTargetKind(
  raw: string
): DxfSplitTargetKind | null {
  const v = raw.trim().toLowerCase();
  if (
    v === "bidang" ||
    v === "jalan" ||
    v === "saluran" ||
    v === "titik" ||
    v === "skip" ||
    v === "lewati"
  ) {
    return v === "lewati" ? "skip" : v;
  }
  return null;
}
