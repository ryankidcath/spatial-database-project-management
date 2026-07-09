import { parseCsvLine, parseSimpleCsv, stripUtf8Bom } from "@/lib/csv-parse";
import type { LinearRing } from "@/lib/dxf-import-utils";
import {
  FIELD_SURVEY_GROUP_KEY,
  fieldPointDisplayLabel,
} from "@/lib/virtual-table-survey-points-bootstrap";

export type PointsImportColumnMap = {
  noBidang: string;
  x: string;
  y: string;
  urutan?: string;
  namaTitik?: string;
};

export type SurveyPoint = {
  bidangKey: string;
  x: number;
  y: number;
  urutan: number;
  namaTitik?: string;
  csvRow: number;
};

export type BidangPolygonBuild = {
  bidangKey: string;
  ring: LinearRing;
  points: SurveyPoint[];
  selfIntersect: boolean;
  warnings: string[];
};

const COLUMN_ALIASES: Record<keyof PointsImportColumnMap, string[]> = {
  noBidang: [
    "no_bidang",
    "nobidang",
    "nomor_bidang",
    "bidang",
    "nib",
    "no",
    "kode",
    "kode_bidang",
  ],
  x: [
    "x",
    "east",
    "e",
    "koord_x",
    "koordinat_x",
    "lon",
    "longitude",
    "lng",
  ],
  y: [
    "y",
    "north",
    "n",
    "koord_y",
    "koordinat_y",
    "lat",
    "latitude",
  ],
  urutan: ["urutan", "order", "seq", "urut", "no_titik", "titik_no", "point_no"],
  namaTitik: ["nama_titik", "nama", "point_name", "titik", "name"],
};

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** Ambil header dari baris pertama CSV. */
export function parseCsvHeaderNames(raw: string): string[] {
  const line = stripUtf8Bom(raw)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return [];
  return parseCsvLine(line).map((h) => h.trim()).filter(Boolean);
}

function pickColumn(
  headers: string[],
  aliases: string[],
  required: boolean
): string | undefined {
  const byNorm = new Map(headers.map((h) => [normHeader(h), h] as const));
  for (const alias of aliases) {
    const hit = byNorm.get(normHeader(alias));
    if (hit) return hit;
  }
  if (required) return undefined;
  for (const h of headers) {
    const n = normHeader(h);
    if (aliases.some((a) => n.includes(normHeader(a)))) return h;
  }
  return undefined;
}

export function detectPointsImportColumns(
  headers: string[]
): { ok: true; map: PointsImportColumnMap } | { ok: false; error: string } {
  const noBidang = pickColumn(headers, COLUMN_ALIASES.noBidang, true);
  const x = pickColumn(headers, COLUMN_ALIASES.x, true);
  const y = pickColumn(headers, COLUMN_ALIASES.y, true);
  if (!noBidang || !x || !y) {
    return {
      ok: false,
      error:
        "Header CSV harus punya kolom no_bidang (atau nib/bidang), x, dan y. Sesuaikan pemetaan kolom bila perlu.",
    };
  }
  const urutan = pickColumn(headers, COLUMN_ALIASES.urutan, false);
  const namaTitik = pickColumn(headers, COLUMN_ALIASES.namaTitik, false);
  return {
    ok: true,
    map: {
      noBidang,
      x,
      y,
      ...(urutan ? { urutan } : {}),
      ...(namaTitik ? { namaTitik } : {}),
    },
  };
}

export type FieldPointsImportColumnMap = {
  x: string;
  y: string;
  urutan?: string;
};

export function detectFieldPointsImportColumns(
  headers: string[]
): { ok: true; map: FieldPointsImportColumnMap } | { ok: false; error: string } {
  const x = pickColumn(headers, COLUMN_ALIASES.x, true);
  const y = pickColumn(headers, COLUMN_ALIASES.y, true);
  if (!x || !y) {
    return {
      ok: false,
      error:
        "Header CSV harus punya kolom x dan y (atau east/north, lon/lat). Kolom no_bidang tidak diperlukan untuk titik lapangan mentah.",
    };
  }
  const urutan = pickColumn(headers, COLUMN_ALIASES.urutan, false);
  return {
    ok: true,
    map: {
      x,
      y,
      ...(urutan ? { urutan } : {}),
    },
  };
}

/** Titik lapangan mentah: hanya x,y; label T1,T2…; grup internal LAPANGAN. */
export function parseFieldPointsCsv(
  raw: string,
  columns: FieldPointsImportColumnMap,
  groupKey: string = FIELD_SURVEY_GROUP_KEY
): { points: SurveyPoint[]; errors: string[] } {
  const errors: string[] = [];
  const rows = parseSimpleCsv(raw.trim());
  if (rows.length === 0) {
    return { points: [], errors: ["CSV kosong atau hanya header."] };
  }

  const points: SurveyPoint[] = [];
  let nextUrutan = 1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const csvRow = i + 2;
    const x = parseCoord(String(row[columns.x] ?? ""));
    const y = parseCoord(String(row[columns.y] ?? ""));

    if (x == null || y == null) {
      errors.push(`Baris ${csvRow}: koordinat x/y tidak valid.`);
      continue;
    }

    let urutan = nextUrutan;
    if (columns.urutan) {
      const u = parseCoord(String(row[columns.urutan] ?? ""));
      if (u != null && u > 0) {
        urutan = Math.trunc(u);
      }
    }
    nextUrutan = Math.max(nextUrutan, urutan) + 1;

    points.push({
      bidangKey: groupKey,
      x,
      y,
      urutan,
      namaTitik: fieldPointDisplayLabel(urutan),
      csvRow,
    });
  }

  return { points, errors };
}

function parseCoord(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseSurveyPointsCsv(
  raw: string,
  columns: PointsImportColumnMap
): { points: SurveyPoint[]; errors: string[] } {
  const errors: string[] = [];
  const rows = parseSimpleCsv(raw.trim());
  if (rows.length === 0) {
    return { points: [], errors: ["CSV kosong atau hanya header."] };
  }

  const points: SurveyPoint[] = [];
  let seqFallback = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const csvRow = i + 2;
    const bidangKey = String(row[columns.noBidang] ?? "").trim();
    const x = parseCoord(String(row[columns.x] ?? ""));
    const y = parseCoord(String(row[columns.y] ?? ""));

    if (!bidangKey) {
      errors.push(`Baris ${csvRow}: no_bidang kosong.`);
      continue;
    }
    if (x == null || y == null) {
      errors.push(`Baris ${csvRow}: koordinat x/y tidak valid.`);
      continue;
    }

    let urutan = seqFallback;
    if (columns.urutan) {
      const u = parseCoord(String(row[columns.urutan] ?? ""));
      urutan = u != null ? u : points.filter((p) => p.bidangKey === bidangKey).length;
    } else {
      urutan = points.filter((p) => p.bidangKey === bidangKey).length;
    }
    seqFallback += 1;

    const namaRaw = columns.namaTitik
      ? String(row[columns.namaTitik] ?? "").trim()
      : "";
    points.push({
      bidangKey,
      x,
      y,
      urutan,
      ...(namaRaw ? { namaTitik: namaRaw } : {}),
      csvRow,
    });
  }

  return { points, errors };
}

function closeRing(ring: LinearRing): LinearRing {
  if (ring.length === 0) return ring;
  const [fx, fy] = ring[0]!;
  const [lx, ly] = ring[ring.length - 1]!;
  if (fx === lx && fy === ly) return ring;
  return [...ring, ring[0]!];
}

function segmentInteriorHit(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number],
  tol = 1e-9
): boolean {
  const x1 = a1[0];
  const y1 = a1[1];
  const x2 = a2[0];
  const y2 = a2[1];
  const x3 = b1[0];
  const y3 = b1[1];
  const x4 = b2[0];
  const y4 = b2[1];
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-20) return false;
  const t =
    ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u =
    ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / denom;
  return t > tol && t < 1 - tol && u > tol && u < 1 - tol;
}

export function ringHasSelfIntersection(ring: LinearRing): boolean {
  const closed = closeRing(ring);
  const n = closed.length;
  if (n < 4) return false;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j < n - 1; j++) {
      if (i === 0 && j === n - 2) continue;
      if (
        segmentInteriorHit(closed[i]!, closed[i + 1]!, closed[j]!, closed[j + 1]!)
      ) {
        return true;
      }
    }
  }
  return false;
}

function orderPointsForBidang(
  pts: SurveyPoint[],
  columns: PointsImportColumnMap,
  orderOverride?: number[]
): SurveyPoint[] {
  if (orderOverride && orderOverride.length === pts.length) {
    const ordered: SurveyPoint[] = [];
    for (const idx of orderOverride) {
      const p = pts[idx];
      if (p) ordered.push(p);
    }
    if (ordered.length === pts.length) return ordered;
  }
  const copy = [...pts];
  if (columns.urutan) {
    copy.sort((a, b) => a.urutan - b.urutan || a.csvRow - b.csvRow);
  }
  return copy;
}

export function buildBidangPolygonsFromPoints(
  points: SurveyPoint[],
  columns: PointsImportColumnMap,
  orderOverrides?: Record<string, number[]>
): { polygons: BidangPolygonBuild[]; errors: string[] } {
  const errors: string[] = [];
  const byBidang = new Map<string, SurveyPoint[]>();
  for (const p of points) {
    const list = byBidang.get(p.bidangKey) ?? [];
    list.push(p);
    byBidang.set(p.bidangKey, list);
  }

  const polygons: BidangPolygonBuild[] = [];
  const keys = [...byBidang.keys()].sort((a, b) => a.localeCompare(b));

  for (const bidangKey of keys) {
    const rawPts = byBidang.get(bidangKey)!;
    const ordered = orderPointsForBidang(
      rawPts,
      columns,
      orderOverrides?.[bidangKey]
    );

    if (ordered.length < 3) {
      errors.push(
        `${bidangKey}: minimal 3 titik untuk membentuk bidang (ada ${ordered.length}).`
      );
      continue;
    }

    const unique = new Set(ordered.map((p) => `${p.x},${p.y}`));
    if (unique.size < 3) {
      errors.push(`${bidangKey}: minimal 3 titik unik (koordinat ganda).`);
      continue;
    }

    const ring = closeRing(ordered.map((p) => [p.x, p.y] as [number, number]));
    const selfIntersect = ringHasSelfIntersection(ring);
    const warnings: string[] = [];
    if (selfIntersect) {
      warnings.push("Poligon self-intersect — periksa urutan titik.");
    }

    polygons.push({
      bidangKey,
      ring,
      points: ordered,
      selfIntersect,
      warnings,
    });
  }

  return { polygons, errors };
}

export function fieldPointsTemplateCsv(): string {
  const rows = [
    "x,y",
    "500100.00,9876500.00",
    "500120.00,9876500.00",
    "500120.00,9876520.00",
    "500100.00,9876520.00",
  ];
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

export function surveyPointsTemplateCsv(): string {
  const rows = [
    "no_bidang,x,y,urutan,nama_titik",
    "BAB-001,500100.00,9876500.00,1,T1",
    "BAB-001,500120.00,9876500.00,2,T2",
    "BAB-001,500120.00,9876520.00,3,T3",
    "BAB-001,500100.00,9876520.00,4,T4",
    "BAB-002,500200.00,9876600.00,1,P1",
    "BAB-002,500220.00,9876600.00,2,P2",
    "BAB-002,500220.00,9876620.00,3,P3",
    "BAB-002,500200.00,9876620.00,4,P4",
  ];
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

export const MAX_SURVEY_POINTS_ROWS = 20000;
