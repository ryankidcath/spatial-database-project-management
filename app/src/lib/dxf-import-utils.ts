import DxfParser from "dxf-parser";
import type {
  IDxf,
  IEntity,
  IInsertEntity,
  ILineEntity,
  ILwpolylineEntity,
  IPolylineEntity,
} from "dxf-parser";
import {
  defaultMinAreaForSrid,
  defaultSnapToleranceForSrid,
  DEFAULT_DXF_POLYGONIZE_SNAP_METERS,
  polygonizeLineSegments,
  type DxfPolygonizeOptions,
  type DxfPolygonizeResult,
  type LineSegment,
} from "@/lib/dxf-line-polygonize";

export type { DxfPolygonizeOptions, DxfPolygonizeResult, LineSegment };
export {
  defaultMinAreaForSrid,
  defaultSnapToleranceForSrid,
  DEFAULT_DXF_POLYGONIZE_SNAP_METERS,
} from "@/lib/dxf-line-polygonize";

export type DxfGeometryExtractionMode = "closed" | "polygonize";
export type DxfPoint = [number, number];
/** Jalur garis terbuka (≥2 vertex) dalam koordinat sumber DXF. */
export type DxfLinePath = [number, number][];

export type LinearRing = [number, number][];
type PolygonCoords = LinearRing[];
export type MultiPolygonCoords = PolygonCoords[];

function closeRingIfNeeded(ring: LinearRing): LinearRing {
  if (ring.length === 0) return ring;
  const [ax, ay] = ring[0]!;
  const [bx, by] = ring[ring.length - 1]!;
  if (ax === bx && ay === by) return ring;
  return [...ring, ring[0]!];
}

/** WKT MULTIPOLYGON untuk satu polygon sederhana (satu outer ring). */
export function multiPolygonToWKT(coords: MultiPolygonCoords): string {
  const polyText = coords
    .map((poly) => {
      const rings = poly
        .map((ring) => `(${ring.map(([x, y]) => `${x} ${y}`).join(", ")})`)
        .join(", ");
      return `(${rings})`;
    })
    .join(", ");
  return `MULTIPOLYGON(${polyText})`;
}

function verticesToClosedRing(
  pts: Array<{ x: number; y: number }>
): LinearRing | null {
  if (pts.length < 3) return null;
  const ring: LinearRing = pts.map((p) => [p.x, p.y]);
  const [fx, fy] = ring[0]!;
  const [lx, ly] = ring[ring.length - 1]!;
  if (fx !== lx || fy !== ly) {
    ring.push([fx, fy]);
  }
  if (ring.length < 4) return null;
  return closeRingIfNeeded(ring);
}

function layerMatches(ent: IEntity, layerName: string): boolean {
  return String(ent.layer ?? "").trim() === layerName.trim();
}

/** Titik blok lokal (OCS 2D) → WCS: skala XY, rotasi (derajat di INSERT), lalu translasi. */
function transformInsertLocalToWorldXY(
  ins: IInsertEntity,
  lx: number,
  ly: number
): [number, number] {
  const sx = Number.isFinite(ins.xScale) && ins.xScale !== 0 ? ins.xScale : 1;
  const sy = Number.isFinite(ins.yScale) && ins.yScale !== 0 ? ins.yScale : 1;
  const deg = ins.rotation ?? 0;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const xs = lx * sx;
  const ys = ly * sy;
  const rx = xs * cos - ys * sin;
  const ry = xs * sin + ys * cos;
  const px = ins.position?.x ?? 0;
  const py = ins.position?.y ?? 0;
  return [rx + px, ry + py];
}

function pointFromPointEntity(ent: IEntity): DxfPoint | null {
  if (ent.type !== "POINT") return null;
  const pos = (ent as { position?: { x?: number; y?: number } }).position;
  const x = pos?.x;
  const y = pos?.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [Number(x), Number(y)];
}

function closedRingFromLwpolyline(lw: ILwpolylineEntity): LinearRing | null {
  if (!lw.vertices || lw.vertices.length < 3) return null;
  const last = lw.vertices[lw.vertices.length - 1]!;
  const first = lw.vertices[0]!;
  const isClosed =
    lw.shape ||
    (lw.vertices.length >= 2 && first.x === last.x && first.y === last.y);
  if (!isClosed) return null;
  const explicitDupClose =
    lw.vertices.length >= 2 && first.x === last.x && first.y === last.y;
  const closedForFlatten = Boolean(lw.shape) && !explicitDupClose;
  const flat = flattenLwPolylineVertices(
    lw.vertices.map((v) => ({
      x: v.x,
      y: v.y,
      bulge: v.bulge,
    })),
    closedForFlatten
  );
  return verticesToClosedRing(flat);
}

function closedRingFromPolyline(pl: IPolylineEntity): LinearRing | null {
  if (pl.isPolyfaceMesh) return null;
  if (!pl.vertices || pl.vertices.length < 3) return null;
  const a = pl.vertices[0]!;
  const b = pl.vertices[pl.vertices.length - 1]!;
  const isClosed =
    pl.shape || (pl.vertices.length >= 2 && a.x === b.x && a.y === b.y);
  if (!isClosed) return null;
  const explicitDupClose =
    pl.vertices.length >= 2 && a.x === b.x && a.y === b.y;
  const closedForFlatten = Boolean(pl.shape) && !explicitDupClose;
  const flat = flattenLwPolylineVertices(
    pl.vertices.map((v) => ({
      x: v.x,
      y: v.y,
      bulge: v.bulge,
    })),
    closedForFlatten
  );
  return verticesToClosedRing(flat);
}

/**
 * Poligon tertutup LW/PL dari daftar entitas.
 * `filterLayer` diisi = hanya entitas pada layer itu; `undefined` = semua layer (untuk isi blok).
 */
function collectClosedLwPlRingsFromEntities(
  entities: IEntity[],
  filterLayer?: string
): LinearRing[] {
  const rings: LinearRing[] = [];
  const useFilter =
    filterLayer != null && String(filterLayer).trim().length > 0;
  const layer = filterLayer?.trim() ?? "";
  for (const ent of entities) {
    const base = ent as IEntity;
    if (base.visible === false) continue;
    if (useFilter && !layerMatches(base, layer)) continue;
    if (ent.type === "LWPOLYLINE") {
      const ring = closedRingFromLwpolyline(ent as ILwpolylineEntity);
      if (ring) rings.push(ring);
    } else if (ent.type === "POLYLINE") {
      const ring = closedRingFromPolyline(ent as IPolylineEntity);
      if (ring) rings.push(ring);
    }
  }
  return rings;
}

/** Satu INSERT: poligon tertutup di definisi blok → WCS (array kolom/baris sederhana). */
function expandInsertToWorldRings(dxf: IDxf, ins: IInsertEntity): LinearRing[] {
  const blk = dxf.blocks?.[ins.name];
  if (!blk?.entities?.length) return [];
  const localRings = collectClosedLwPlRingsFromEntities(blk.entities);
  const cols = Math.max(1, Math.floor(Number(ins.columnCount)) || 1);
  const rows = Math.max(1, Math.floor(Number(ins.rowCount)) || 1);
  const cs = Number(ins.columnSpacing) || 0;
  const rs = Number(ins.rowSpacing) || 0;
  const out: LinearRing[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const ring of localRings) {
        out.push(
          ring.map(([x, y]) =>
            transformInsertLocalToWorldXY(ins, x + c * cs, y + r * rs)
          )
        );
      }
    }
  }
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

type XY = { x: number; y: number };

/**
 * Titik sepanjang busur AutoCAD dari (x1,y1) ke (x2,y2); bulge melekat di titik awal segmen.
 * Mengembalikan titik **termasuk ujung**, tanpa titik awal (sudah ada di path).
 */
function tessellateBulgeSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bulge: number,
  minSteps = 4,
  maxSteps = 192
): XY[] {
  const b = Number(bulge);
  if (!Number.isFinite(b) || Math.abs(b) < 1e-14) {
    return [{ x: x2, y: y2 }];
  }

  const theta = 4 * Math.atan(b);
  const chord = Math.hypot(x2 - x1, y2 - y1);
  if (chord < 1e-14) return [];

  const absTheta = Math.abs(theta);
  const sinHalf = Math.sin(absTheta / 2);
  if (Math.abs(sinHalf) < 1e-14) {
    return [{ x: x2, y: y2 }];
  }
  const r = Math.abs(chord / 2 / sinHalf);
  if (!Number.isFinite(r) || r > 1e15 || r < 1e-10) {
    return [{ x: x2, y: y2 }];
  }

  const gamma = (Math.PI - absTheta) / 2;
  const chordAng = Math.atan2(y2 - y1, x2 - x1);
  const phi = chordAng + gamma * (b < 0 ? -1 : 1);
  const cx = x1 + r * Math.cos(phi);
  const cy = y1 + r * Math.sin(phi);

  const startAng = Math.atan2(y1 - cy, x1 - cx);
  const arcLen = Math.abs(r * theta);
  let steps = Math.ceil(arcLen / (chord * 0.22));
  steps = clamp(steps, minSteps, maxSteps);

  const pts: XY[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ang = startAng + theta * t;
    pts.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
  }
  return pts;
}

function flattenLwPolylineVertices(
  vertices: Array<{ x: number; y: number; bulge?: number }>,
  closed: boolean
): XY[] {
  const n = vertices.length;
  if (n < 2) return [];
  const out: XY[] = [{ x: vertices[0]!.x, y: vertices[0]!.y }];
  for (let i = 0; i < n - 1; i++) {
    const a = vertices[i]!;
    const b = vertices[i + 1]!;
    const bulge = a.bulge ?? 0;
    for (const p of tessellateBulgeSegment(a.x, a.y, b.x, b.y, bulge)) {
      out.push(p);
    }
  }
  if (closed) {
    const last = vertices[n - 1]!;
    const first = vertices[0]!;
    const bulge = last.bulge ?? 0;
    for (const p of tessellateBulgeSegment(last.x, last.y, first.x, first.y, bulge)) {
      out.push(p);
    }
  }
  return out;
}


export function parseDxfDocument(source: string): IDxf {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error("File DXF kosong.");
  }
  const parser = new DxfParser();
  const dxf = parser.parseSync(trimmed);
  if (!dxf || !Array.isArray(dxf.entities)) {
    throw new Error("DXF tidak dapat dibaca (format tidak dikenali).");
  }
  return dxf;
}

type DxfGroup = { code: number; value: string };

function parseDxfGroupStream(source: string): DxfGroup[] {
  const lines = source.split(/\r\n|\r|\n/);
  const out: DxfGroup[] = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = Number(String(lines[i]).trim());
    const value = lines[i + 1] ?? "";
    if (!Number.isFinite(code)) continue;
    out.push({ code, value });
  }
  return out;
}

export function listDxfLayerNames(dxf: IDxf, rawSource?: string): string[] {
  const names = new Set<string>();
  const layersTable = dxf.tables?.layer?.layers;
  if (layersTable && typeof layersTable === "object") {
    for (const k of Object.keys(layersTable)) {
      const n = k.trim();
      if (n) names.add(n);
    }
  }
  for (const ent of dxf.entities) {
    const ly = String((ent as IEntity).layer ?? "").trim();
    if (ly) names.add(ly);
  }
  const raw = rawSource?.trim();
  if (raw) {
    const pairs = parseDxfGroupStream(raw);
    let section: string | null = null;
    let i = 0;
    while (i < pairs.length) {
      const g = pairs[i]!;
      if (g.code !== 0) {
        i++;
        continue;
      }
      const type = String(g.value).trim();
      i++;
      const body: DxfGroup[] = [];
      while (i < pairs.length && pairs[i]!.code !== 0) {
        body.push(pairs[i]!);
        i++;
      }
      if (type === "SECTION") {
        section = body.find((b) => b.code === 2)?.value.trim() ?? null;
      } else if (type === "ENDSEC") {
        section = null;
      } else if (section === "ENTITIES" && type === "HATCH") {
        const ly = body.find((b) => b.code === 8)?.value.trim();
        if (ly) names.add(ly);
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Sudut busur hatch (derajat atau radian) → radian bila nilai terlalu besar untuk radian biasa. */
function hatchAnglesToRadians(a0: number, a1: number): { a0: number; a1: number } {
  const maxAbs = Math.max(Math.abs(a0), Math.abs(a1));
  if (maxAbs > 2 * Math.PI + 0.01) {
    return { a0: (a0 * Math.PI) / 180, a1: (a1 * Math.PI) / 180 };
  }
  return { a0, a1 };
}

/** Titik sepanjang busur lingkaran (bukan bulge); tidak termasuk titik awal. */
function tessellateCircularArc(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  counterClockwise: boolean,
  minSteps = 6,
  maxSteps = 48
): XY[] {
  if (!Number.isFinite(r) || r < 1e-10) return [];
  let delta = a1 - a0;
  if (counterClockwise) {
    while (delta <= 0) delta += 2 * Math.PI;
    while (delta > 2 * Math.PI) delta -= 2 * Math.PI;
  } else {
    while (delta >= 0) delta -= 2 * Math.PI;
    while (delta < -2 * Math.PI) delta += 2 * Math.PI;
  }
  const arcLen = Math.abs(r * delta);
  let steps = Math.ceil(arcLen / (r * 0.35));
  steps = clamp(steps, minSteps, maxSteps);
  const pts: XY[] = [];
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const a = a0 + delta * t;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function parseHatchPolylineBoundary(
  body: DxfGroup[],
  start: number
): { ring: LinearRing | null; nextI: number } {
  let j = start;
  if (body[j]?.code !== 72) return { ring: null, nextI: start };
  const hasBulge = parseInt(body[j].value, 10) !== 0;
  j++;
  if (body[j]?.code !== 73) return { ring: null, nextI: j };
  const isClosedFlag = parseInt(body[j].value, 10) !== 0;
  j++;
  if (body[j]?.code !== 93) return { ring: null, nextI: j };
  const n = parseInt(body[j].value, 10);
  j++;
  if (!Number.isFinite(n) || n < 3) return { ring: null, nextI: j };

  const verts: Array<{ x: number; y: number; bulge?: number }> = [];
  for (let k = 0; k < n; k++) {
    if (body[j]?.code !== 10) return { ring: null, nextI: j };
    const x = parseFloat(body[j].value);
    j++;
    if (body[j]?.code !== 20) return { ring: null, nextI: j };
    const y = parseFloat(body[j].value);
    j++;
    let bulge = 0;
    if (body[j]?.code === 42) {
      bulge = parseFloat(body[j].value);
      j++;
    }
    verts.push({ x, y, bulge: hasBulge ? bulge : 0 });
  }
  const first = verts[0]!;
  const last = verts[n - 1]!;
  const explicitDupClose =
    verts.length >= 2 && first.x === last.x && first.y === last.y;
  const closedForFlatten = isClosedFlag && !explicitDupClose;
  const flat = flattenLwPolylineVertices(verts, closedForFlatten);
  const ring = verticesToClosedRing(flat);
  return { ring, nextI: j };
}

function parseHatchEdgeBoundary(
  body: DxfGroup[],
  start: number
): { ring: LinearRing | null; nextI: number } {
  let j = start;
  if (body[j]?.code !== 93) return { ring: null, nextI: start };
  const numEdges = parseInt(body[j].value, 10);
  j++;
  if (!Number.isFinite(numEdges) || numEdges < 1) return { ring: null, nextI: j };

  const pts: XY[] = [];
  for (let e = 0; e < numEdges; e++) {
    if (body[j]?.code !== 72) return { ring: null, nextI: j };
    const edgeType = parseInt(body[j].value, 10);
    j++;
    if (edgeType === 1) {
      if (body[j]?.code !== 10) return { ring: null, nextI: j };
      const x0 = parseFloat(body[j].value);
      j++;
      if (body[j]?.code !== 20) return { ring: null, nextI: j };
      const y0 = parseFloat(body[j].value);
      j++;
      if (body[j]?.code !== 11) return { ring: null, nextI: j };
      const x1 = parseFloat(body[j].value);
      j++;
      if (body[j]?.code !== 21) return { ring: null, nextI: j };
      const y1 = parseFloat(body[j].value);
      j++;
      if (pts.length === 0) pts.push({ x: x0, y: y0 });
      pts.push({ x: x1, y: y1 });
    } else if (edgeType === 2) {
      if (body[j]?.code !== 10) return { ring: null, nextI: j };
      const cx = parseFloat(body[j].value);
      j++;
      if (body[j]?.code !== 20) return { ring: null, nextI: j };
      const cy = parseFloat(body[j].value);
      j++;
      if (body[j]?.code !== 40) return { ring: null, nextI: j };
      const r = parseFloat(body[j].value);
      j++;
      if (body[j]?.code !== 50) return { ring: null, nextI: j };
      let a0 = parseFloat(body[j].value);
      j++;
      if (body[j]?.code !== 51) return { ring: null, nextI: j };
      let a1 = parseFloat(body[j].value);
      j++;
      const ccw = body[j]?.code === 73 ? parseInt(body[j].value, 10) !== 0 : true;
      if (body[j]?.code === 73) j++;

      const rad = hatchAnglesToRadians(a0, a1);
      a0 = rad.a0;
      a1 = rad.a1;
      const sx = cx + r * Math.cos(a0);
      const sy = cy + r * Math.sin(a0);
      const arcPts = tessellateCircularArc(cx, cy, r, a0, a1, ccw);
      if (pts.length === 0) pts.push({ x: sx, y: sy });
      for (const p of arcPts) pts.push(p);
    } else {
      return { ring: null, nextI: j };
    }
  }
  if (pts.length < 3) return { ring: null, nextI: j };
  const ring = verticesToClosedRing(pts);
  return { ring, nextI: j };
}

function parseHatchEntityBody(body: DxfGroup[], targetLayer: string): LinearRing[] {
  const layer = body.find((b) => b.code === 8)?.value.trim() ?? "";
  if (layer !== targetLayer.trim()) return [];

  const rings: LinearRing[] = [];
  const has91 = body.some((b) => b.code === 91);

  const consumePath = (i: number): { rings: LinearRing[]; nextI: number } => {
    const out: LinearRing[] = [];
    if (i >= body.length || body[i]?.code !== 92) return { rings: out, nextI: i };
    const flags = parseInt(body[i].value, 10) || 0;
    let j = i + 1;
    if (flags & 2) {
      const r = parseHatchPolylineBoundary(body, j);
      j = r.nextI;
      if (r.ring) out.push(r.ring);
    } else {
      const r = parseHatchEdgeBoundary(body, j);
      j = r.nextI;
      if (r.ring) out.push(r.ring);
    }
    return { rings: out, nextI: j };
  };

  if (has91) {
    let i = 0;
    while (i < body.length) {
      if (body[i]?.code !== 91) {
        i++;
        continue;
      }
      const numPaths = parseInt(body[i].value, 10);
      i++;
      if (!Number.isFinite(numPaths) || numPaths < 1) continue;
      for (let p = 0; p < numPaths; p++) {
        while (i < body.length && body[i].code !== 92) i++;
        if (i >= body.length) break;
        const pathStart = i;
        const { rings: sub, nextI } = consumePath(i);
        if (nextI <= pathStart) {
          i = pathStart + 1;
          break;
        }
        rings.push(...sub);
        i = nextI;
      }
    }
    return rings;
  }

  let i = 0;
  while (i < body.length) {
    if (body[i]?.code !== 92) {
      i++;
      continue;
    }
    const pathStart = i;
    const { rings: sub, nextI } = consumePath(i);
    if (nextI <= pathStart) {
      i = pathStart + 1;
      break;
    }
    rings.push(...sub);
    i = nextI;
  }
  return rings;
}

/**
 * Ekstrak boundary **HATCH** dari teks DXF (parser `dxf-parser` tidak memuat entitas HATCH).
 * Mendukung path **poliline** (bit 2 pada 92) dan path **garis + busur** (edge 1 / 2).
 */
export function extractClosedHatchRingsFromDxfSource(
  source: string,
  layerName: string
): LinearRing[] {
  const pairs = parseDxfGroupStream(source);
  const rings: LinearRing[] = [];
  let section: string | null = null;
  let i = 0;
  while (i < pairs.length) {
    const g = pairs[i]!;
    if (g.code !== 0) {
      i++;
      continue;
    }
    const type = String(g.value).trim();
    i++;
    const body: DxfGroup[] = [];
    while (i < pairs.length && pairs[i]!.code !== 0) {
      body.push(pairs[i]!);
      i++;
    }
    if (type === "SECTION") {
      section = body.find((b) => b.code === 2)?.value.trim() ?? null;
    } else if (type === "ENDSEC") {
      section = null;
    } else if (section === "ENTITIES" && type === "HATCH") {
      rings.push(...parseHatchEntityBody(body, layerName));
    }
  }
  return rings;
}

function isLwPlClosed(
  vertices: Array<{ x: number; y: number }>,
  shape?: boolean
): boolean {
  if (vertices.length < 2) return false;
  const first = vertices[0]!;
  const last = vertices[vertices.length - 1]!;
  return Boolean(shape) || (first.x === last.x && first.y === last.y);
}

function segmentsFromFlattenedPath(pts: XY[]): LineSegment[] {
  const out: LineSegment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    out.push([
      [a.x, a.y],
      [b.x, b.y],
    ]);
  }
  return out;
}

function openSegmentsFromLwpolyline(lw: ILwpolylineEntity): LineSegment[] {
  if (!lw.vertices || lw.vertices.length < 2) return [];
  if (isLwPlClosed(lw.vertices, lw.shape)) return [];
  const flat = flattenLwPolylineVertices(
    lw.vertices.map((v) => ({ x: v.x, y: v.y, bulge: v.bulge })),
    false
  );
  return segmentsFromFlattenedPath(flat);
}

function openSegmentsFromPolyline(pl: IPolylineEntity): LineSegment[] {
  if (pl.isPolyfaceMesh) return [];
  if (!pl.vertices || pl.vertices.length < 2) return [];
  if (isLwPlClosed(pl.vertices, pl.shape)) return [];
  const flat = flattenLwPolylineVertices(
    pl.vertices.map((v) => ({ x: v.x, y: v.y, bulge: v.bulge })),
    false
  );
  return segmentsFromFlattenedPath(flat);
}

function closedLwPlToBoundarySegments(
  lw: ILwpolylineEntity | IPolylineEntity
): LineSegment[] {
  const verts = lw.vertices;
  if (!verts || verts.length < 2) return [];
  const isClosed = isLwPlClosed(
    verts,
    (lw as ILwpolylineEntity).shape ?? (lw as IPolylineEntity).shape
  );
  if (!isClosed) return [];
  const explicitDupClose =
    verts.length >= 2 &&
    verts[0]!.x === verts[verts.length - 1]!.x &&
    verts[0]!.y === verts[verts.length - 1]!.y;
  const closedForFlatten = Boolean(
    (lw as ILwpolylineEntity).shape ?? (lw as IPolylineEntity).shape
  ) && !explicitDupClose;
  const flat = flattenLwPolylineVertices(
    verts.map((v) => ({ x: v.x, y: v.y, bulge: v.bulge })),
    closedForFlatten
  );
  return segmentsFromFlattenedPath(flat);
}

function segmentFromLine(line: ILineEntity): LineSegment | null {
  const v = line.vertices;
  if (!v || v.length < 2) return null;
  const a = v[0]!;
  const b = v[v.length - 1]!;
  return [
    [a.x, a.y],
    [b.x, b.y],
  ];
}

/** LINE + LW/PL terbuka (+ boundary LW/PL tertutup sebagai segmen) pada layer. */
function collectLineSegmentsFromEntities(
  entities: IEntity[],
  filterLayer?: string
): LineSegment[] {
  const out: LineSegment[] = [];
  const useFilter =
    filterLayer != null && String(filterLayer).trim().length > 0;
  const layer = filterLayer?.trim() ?? "";

  for (const ent of entities) {
    const base = ent as IEntity;
    if (base.visible === false) continue;
    if (useFilter && !layerMatches(base, layer)) continue;

    if (ent.type === "LINE") {
      const seg = segmentFromLine(ent as ILineEntity);
      if (seg) out.push(seg);
    } else if (ent.type === "LWPOLYLINE") {
      const lw = ent as ILwpolylineEntity;
      out.push(...openSegmentsFromLwpolyline(lw));
      out.push(...closedLwPlToBoundarySegments(lw));
    } else if (ent.type === "POLYLINE") {
      const pl = ent as IPolylineEntity;
      out.push(...openSegmentsFromPolyline(pl));
      out.push(...closedLwPlToBoundarySegments(pl));
    }
  }
  return out;
}

function expandInsertToWorldSegments(
  dxf: IDxf,
  ins: IInsertEntity
): LineSegment[] {
  const blk = dxf.blocks?.[ins.name];
  if (!blk?.entities?.length) return [];
  const localSegs = collectLineSegmentsFromEntities(blk.entities);
  const cols = Math.max(1, Math.floor(Number(ins.columnCount)) || 1);
  const rows = Math.max(1, Math.floor(Number(ins.rowCount)) || 1);
  const cs = Number(ins.columnSpacing) || 0;
  const rs = Number(ins.rowSpacing) || 0;
  const out: LineSegment[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [[x0, y0], [x1, y1]] of localSegs) {
        const a = transformInsertLocalToWorldXY(ins, x0 + c * cs, y0 + r * rs);
        const b = transformInsertLocalToWorldXY(ins, x1 + c * cs, y1 + r * rs);
        out.push([a, b]);
      }
    }
  }
  return out;
}

function collectPointsFromEntities(
  entities: IEntity[],
  filterLayer?: string
): DxfPoint[] {
  const out: DxfPoint[] = [];
  const useFilter =
    filterLayer != null && String(filterLayer).trim().length > 0;
  const layer = filterLayer?.trim() ?? "";
  for (const ent of entities) {
    const base = ent as IEntity;
    if (base.visible === false) continue;
    if (useFilter && !layerMatches(base, layer)) continue;
    const point = pointFromPointEntity(base);
    if (point) out.push(point);
  }
  return out;
}

function expandInsertToWorldPoints(dxf: IDxf, ins: IInsertEntity): DxfPoint[] {
  const blk = dxf.blocks?.[ins.name];
  if (!blk?.entities?.length) return [];
  const localPoints = collectPointsFromEntities(blk.entities);
  const cols = Math.max(1, Math.floor(Number(ins.columnCount)) || 1);
  const rows = Math.max(1, Math.floor(Number(ins.rowCount)) || 1);
  const cs = Number(ins.columnSpacing) || 0;
  const rs = Number(ins.rowSpacing) || 0;
  const out: DxfPoint[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [x, y] of localPoints) {
        out.push(transformInsertLocalToWorldXY(ins, x + c * cs, y + r * rs));
      }
    }
  }
  return out;
}

function linePathFromLine(line: ILineEntity): DxfLinePath | null {
  const v = line.vertices;
  if (!v || v.length < 2) return null;
  const a = v[0]!;
  const b = v[v.length - 1]!;
  return [
    [a.x, a.y],
    [b.x, b.y],
  ];
}

function openPathFromLwpolyline(lw: ILwpolylineEntity): DxfLinePath | null {
  if (!lw.vertices || lw.vertices.length < 2) return null;
  if (isLwPlClosed(lw.vertices, lw.shape)) return null;
  const flat = flattenLwPolylineVertices(
    lw.vertices.map((v) => ({ x: v.x, y: v.y, bulge: v.bulge })),
    false
  );
  if (flat.length < 2) return null;
  return flat.map((p) => [p.x, p.y]);
}

function openPathFromPolyline(pl: IPolylineEntity): DxfLinePath | null {
  if (pl.isPolyfaceMesh) return null;
  if (!pl.vertices || pl.vertices.length < 2) return null;
  if (isLwPlClosed(pl.vertices, pl.shape)) return null;
  const flat = flattenLwPolylineVertices(
    pl.vertices.map((v) => ({ x: v.x, y: v.y, bulge: v.bulge })),
    false
  );
  if (flat.length < 2) return null;
  return flat.map((p) => [p.x, p.y]);
}

function collectOpenLinePathsFromEntities(
  entities: IEntity[],
  filterLayer?: string
): DxfLinePath[] {
  const out: DxfLinePath[] = [];
  const useFilter =
    filterLayer != null && String(filterLayer).trim().length > 0;
  const layer = filterLayer?.trim() ?? "";

  for (const ent of entities) {
    const base = ent as IEntity;
    if (base.visible === false) continue;
    if (useFilter && !layerMatches(base, layer)) continue;

    if (ent.type === "LINE") {
      const path = linePathFromLine(ent as ILineEntity);
      if (path) out.push(path);
    } else if (ent.type === "LWPOLYLINE") {
      const path = openPathFromLwpolyline(ent as ILwpolylineEntity);
      if (path) out.push(path);
    } else if (ent.type === "POLYLINE") {
      const path = openPathFromPolyline(ent as IPolylineEntity);
      if (path) out.push(path);
    }
  }
  return out;
}

function transformLinePathInsertOffset(
  ins: IInsertEntity,
  path: DxfLinePath,
  colOffset: number,
  rowOffset: number
): DxfLinePath {
  return path.map(([x, y]) =>
    transformInsertLocalToWorldXY(ins, x + colOffset, y + rowOffset)
  );
}

function expandInsertToWorldLinePaths(
  dxf: IDxf,
  ins: IInsertEntity
): DxfLinePath[] {
  const blk = dxf.blocks?.[ins.name];
  if (!blk?.entities?.length) return [];
  const localPaths = collectOpenLinePathsFromEntities(blk.entities);
  const cols = Math.max(1, Math.floor(Number(ins.columnCount)) || 1);
  const rows = Math.max(1, Math.floor(Number(ins.rowCount)) || 1);
  const cs = Number(ins.columnSpacing) || 0;
  const rs = Number(ins.rowSpacing) || 0;
  const out: DxfLinePath[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const path of localPaths) {
        out.push(transformLinePathInsertOffset(ins, path, c * cs, r * rs));
      }
    }
  }
  return out;
}

/** Ekstrak POINT dari layer DXF (termasuk POINT dalam blok INSERT pada layer itu). */
export function extractPointsFromDxfLayer(
  dxf: IDxf,
  layerName: string
): DxfPoint[] {
  const name = layerName.trim();
  if (!name) return [];
  const points: DxfPoint[] = [];
  for (const ent of dxf.entities) {
    const base = ent as IEntity;
    if (base.visible === false) continue;
    if (ent.type === "INSERT") {
      const ins = ent as IInsertEntity;
      if (!layerMatches(base, name)) continue;
      points.push(...expandInsertToWorldPoints(dxf, ins));
      continue;
    }
    if (!layerMatches(base, name)) continue;
    const point = pointFromPointEntity(base);
    if (point) points.push(point);
  }
  return points;
}

/**
 * Ekstrak garis terbuka dari layer DXF: `LINE`, LW/PL tidak tertutup,
 * dan garis dalam blok INSERT (bukan boundary poligon tertutup).
 */
export function extractOpenLineStringsFromDxfLayer(
  dxf: IDxf,
  layerName: string
): DxfLinePath[] {
  const name = layerName.trim();
  if (!name) return [];
  const paths: DxfLinePath[] = [];
  for (const ent of dxf.entities) {
    const base = ent as IEntity;
    if (base.visible === false) continue;

    if (ent.type === "INSERT") {
      const ins = ent as IInsertEntity;
      if (!layerMatches(base, name)) continue;
      paths.push(...expandInsertToWorldLinePaths(dxf, ins));
      continue;
    }

    if (!layerMatches(base, name)) continue;
    if (ent.type === "LINE") {
      const path = linePathFromLine(ent as ILineEntity);
      if (path) paths.push(path);
    } else if (ent.type === "LWPOLYLINE") {
      const path = openPathFromLwpolyline(ent as ILwpolylineEntity);
      if (path) paths.push(path);
    } else if (ent.type === "POLYLINE") {
      const path = openPathFromPolyline(ent as IPolylineEntity);
      if (path) paths.push(path);
    }
  }
  return paths;
}

/**
 * Ekstrak segmen garis dari layer DXF untuk mode polygonize:
 * `LINE`, LW/PL terbuka, boundary LW/PL tertutup (sebagai segmen), dan INSERT blok.
 */
export function extractLineSegmentsFromDxfLayer(
  dxf: IDxf,
  layerName: string
): LineSegment[] {
  const name = layerName.trim();
  if (!name) return [];

  const segments: LineSegment[] = [];
  for (const ent of dxf.entities) {
    const base = ent as IEntity;
    if (base.visible === false) continue;

    if (ent.type === "INSERT") {
      const ins = ent as IInsertEntity;
      if (!layerMatches(base, name)) continue;
      segments.push(...expandInsertToWorldSegments(dxf, ins));
      continue;
    }

    if (!layerMatches(base, name)) continue;
    if (ent.type === "LINE") {
      const seg = segmentFromLine(ent as ILineEntity);
      if (seg) segments.push(seg);
    } else if (ent.type === "LWPOLYLINE") {
      const lw = ent as ILwpolylineEntity;
      segments.push(...openSegmentsFromLwpolyline(lw));
      segments.push(...closedLwPlToBoundarySegments(lw));
    } else if (ent.type === "POLYLINE") {
      const pl = ent as IPolylineEntity;
      segments.push(...openSegmentsFromPolyline(pl));
      segments.push(...closedLwPlToBoundarySegments(pl));
    }
  }
  return segments;
}

/** Polygonize garis layer DXF → ring poligon (CRS sumber). */
export function polygonizeDxfLayerToRings(
  dxf: IDxf,
  layerName: string,
  options: DxfPolygonizeOptions
): DxfPolygonizeResult {
  const segments = extractLineSegmentsFromDxfLayer(dxf, layerName);
  return polygonizeLineSegments(segments, options);
}

export function extractPolygonRingsFromDxfLayer(
  dxf: IDxf,
  layerName: string,
  dxfSource: string | undefined,
  mode: DxfGeometryExtractionMode,
  polygonizeOptions?: DxfPolygonizeOptions
): { rings: LinearRing[]; polygonizeMeta?: DxfPolygonizeResult } {
  if (mode === "closed") {
    return {
      rings: extractClosedPolygonRingsFromDxfLayer(dxf, layerName, dxfSource),
    };
  }
  const result = polygonizeDxfLayerToRings(
    dxf,
    layerName,
    polygonizeOptions ?? {
      snapTolerance: DEFAULT_DXF_POLYGONIZE_SNAP_METERS,
    }
  );
  return { rings: result.rings, polygonizeMeta: result };
}

export function parseDxfGeometryMode(
  raw: string
): DxfGeometryExtractionMode {
  const v = raw.trim().toLowerCase();
  if (v === "polygonize" || v === "lines" || v === "from_lines") {
    return "polygonize";
  }
  return "closed";
}

export function buildDxfPolygonizeOptionsFromForm(
  sourceSrid: number,
  snapToleranceRaw?: string,
  minAreaRaw?: string
): DxfPolygonizeOptions {
  const snapParsed = snapToleranceRaw?.trim();
  let snapTolerance = defaultSnapToleranceForSrid(sourceSrid);
  if (snapParsed) {
    const n = Number(snapParsed);
    if (Number.isFinite(n) && n > 0) snapTolerance = n;
  }
  const minParsed = minAreaRaw?.trim();
  let minArea = defaultMinAreaForSrid(sourceSrid);
  if (minParsed) {
    const n = Number(minParsed);
    if (Number.isFinite(n) && n >= 0) minArea = n;
  }
  return { snapTolerance, minArea, dropLargestFace: true };
}

/**
 * LWPOLYLINE / POLYLINE tertutup pada layer yang dipilih, **INSERT** pada layer yang sama
 * (ekspansi blok: LW/PL tertutup di definisi blok → WCS; tanpa HATCH di dalam blok),
 * lalu opsional **HATCH** dari teks DXF.
 *
 * Urutan ring = urutan `dxf.entities` (INSERT inline), lalu hatch di akhir.
 */
export function extractClosedPolygonRingsFromDxfLayer(
  dxf: IDxf,
  layerName: string,
  dxfSource?: string
): LinearRing[] {
  const rings: LinearRing[] = [];
  const name = layerName.trim();
  if (!name) return rings;

  for (const ent of dxf.entities) {
    const base = ent as IEntity;
    if (base.visible === false) continue;

    if (ent.type === "INSERT") {
      const ins = ent as IInsertEntity;
      if (!layerMatches(base, name)) continue;
      rings.push(...expandInsertToWorldRings(dxf, ins));
      continue;
    }

    if (!layerMatches(base, name)) continue;
    if (ent.type === "LWPOLYLINE") {
      const ring = closedRingFromLwpolyline(ent as ILwpolylineEntity);
      if (ring) rings.push(ring);
    } else if (ent.type === "POLYLINE") {
      const ring = closedRingFromPolyline(ent as IPolylineEntity);
      if (ring) rings.push(ring);
    }
  }

  if (dxfSource && dxfSource.trim()) {
    rings.push(...extractClosedHatchRingsFromDxfSource(dxfSource, name));
  }

  return rings;
}

export function ringToSinglePolygonWkt(ring: LinearRing): string {
  const coords: MultiPolygonCoords = [[ring]];
  return multiPolygonToWKT(coords);
}

/** Prefix + slug layer + indeks (1-based), aman untuk URL-ish key. */
export function featureKeysForDxfPolygons(
  prefixRaw: string,
  layerName: string,
  count: number
): string[] {
  const prefix = prefixRaw.trim();
  const slug = layerName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "layer";
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    keys.push(`${prefix}${slug}-${i + 1}`);
  }
  return keys;
}
