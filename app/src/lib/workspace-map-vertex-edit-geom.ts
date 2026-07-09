import type { Geometry, Position } from "geojson";
import type { LatLngPoint, LatLngSegment } from "@/lib/workspace-map-draw-bidang";
import { asGeometry } from "@/lib/workspace-map-geo-utils";
import { geometryKindFromStored } from "@/lib/workspace-map-translate-geom";

export type MoveGeomVertexEdits = Record<
  number,
  { lat: number; lng: number }
>;

export type EditableVertexPosition = {
  index: number;
  lat: number;
  lng: number;
};

function geometryFromStored(stored: unknown): Geometry | null {
  if (!stored || typeof stored !== "object") return null;
  const obj = stored as { type?: string; geometry?: Geometry };
  if (obj.type === "Feature" && obj.geometry) return obj.geometry;
  return asGeometry(stored);
}

function positionsEqual(a: Position, b: Position): boolean {
  return (
    Math.abs(a[0]! - b[0]!) < 1e-12 && Math.abs(a[1]! - b[1]!) < 1e-12
  );
}

function ringEditableCount(ring: Position[]): number {
  if (ring.length === 0) return 0;
  if (ring.length > 1 && positionsEqual(ring[0]!, ring[ring.length - 1]!)) {
    return ring.length - 1;
  }
  return ring.length;
}

/** Daftar vertex yang bisa diedit (ring luar / LineString / Point). */
export function extractEditableVertexPositions(
  stored: unknown
): EditableVertexPosition[] {
  const geom = geometryFromStored(stored);
  if (!geom) return [];

  if (geom.type === "Point") {
    const [lng, lat] = geom.coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];
    return [{ index: 0, lat, lng }];
  }

  if (geom.type === "LineString") {
    return geom.coordinates
      .map((c, index) => ({
        index,
        lat: c[1]!,
        lng: c[0]!,
      }))
      .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng));
  }

  if (geom.type === "Polygon" && geom.coordinates[0]) {
    const ring = geom.coordinates[0];
    const count = ringEditableCount(ring);
    const out: EditableVertexPosition[] = [];
    for (let index = 0; index < count; index++) {
      const c = ring[index]!;
      if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
      out.push({ index, lat: c[1]!, lng: c[0]! });
    }
    return out;
  }

  if (geom.type === "MultiLineString" && geom.coordinates[0]) {
    return geom.coordinates[0]
      .map((c, index) => ({
        index,
        lat: c[1]!,
        lng: c[0]!,
      }))
      .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng));
  }

  if (geom.type === "MultiPolygon" && geom.coordinates[0]?.[0]) {
    const ring = geom.coordinates[0][0];
    const count = ringEditableCount(ring);
    const out: EditableVertexPosition[] = [];
    for (let index = 0; index < count; index++) {
      const c = ring[index]!;
      if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
      out.push({ index, lat: c[1]!, lng: c[0]! });
    }
    return out;
  }

  return [];
}

/** Segmen sisi (poligon / LineString) dari geometri tersimpan. */
export function extractEditableEdgeSegments(stored: unknown): LatLngSegment[] {
  const kind = geometryKindFromStored(stored);
  const verts = extractEditableVertexPositions(stored);
  if (verts.length < 2) return [];
  const out: LatLngSegment[] = [];
  if (kind === "polygon") {
    for (let i = 0; i < verts.length; i++) {
      out.push({
        a: verts[i]!,
        b: verts[(i + 1) % verts.length]!,
      });
    }
    return out;
  }
  if (kind === "linestring") {
    for (let i = 0; i < verts.length - 1; i++) {
      out.push({ a: verts[i]!, b: verts[i + 1]! });
    }
  }
  return out;
}

export function supportsMoveGeomVertexEdit(stored: unknown): boolean {
  return extractEditableVertexPositions(stored).length > 0;
}

function updateRingVertex(
  ring: Position[],
  index: number,
  lng: number,
  lat: number
): Position[] {
  const next = ring.map((c) => [...c] as Position);
  if (index < 0 || index >= ringEditableCount(ring)) return next;
  next[index] = [lng, lat];
  if (
    ring.length > 1 &&
    positionsEqual(ring[0]!, ring[ring.length - 1]!) &&
    index === 0
  ) {
    next[ring.length - 1] = [lng, lat];
  }
  return next;
}

function applyEditsToGeometry(
  geom: Geometry,
  edits: MoveGeomVertexEdits
): Geometry {
  if (Object.keys(edits).length === 0) return geom;

  if (geom.type === "Point") {
    const edit = edits[0];
    if (!edit) return geom;
    return { type: "Point", coordinates: [edit.lng, edit.lat] };
  }

  if (geom.type === "LineString") {
    const coords = geom.coordinates.map((c) => [...c] as Position);
    for (const [key, edit] of Object.entries(edits)) {
      const index = Number(key);
      if (index >= 0 && index < coords.length) {
        coords[index] = [edit.lng, edit.lat];
      }
    }
    return { type: "LineString", coordinates: coords };
  }

  if (geom.type === "Polygon") {
    const rings = geom.coordinates.map((ring) =>
      ring.map((c) => [...c] as Position)
    );
    const outer = rings[0];
    if (!outer) return geom;
    let updated = outer;
    for (const [key, edit] of Object.entries(edits)) {
      const index = Number(key);
      updated = updateRingVertex(updated, index, edit.lng, edit.lat);
    }
    rings[0] = updated;
    return { type: "Polygon", coordinates: rings };
  }

  if (geom.type === "MultiLineString" && geom.coordinates[0]) {
    const lines = geom.coordinates.map((line) =>
      line.map((c) => [...c] as Position)
    );
    const first = lines[0]!;
    for (const [key, edit] of Object.entries(edits)) {
      const index = Number(key);
      if (index >= 0 && index < first.length) {
        first[index] = [edit.lng, edit.lat];
      }
    }
    lines[0] = first;
    return { type: "MultiLineString", coordinates: lines };
  }

  if (geom.type === "MultiPolygon" && geom.coordinates[0]?.[0]) {
    const polys = geom.coordinates.map((poly) =>
      poly.map((ring) => ring.map((c) => [...c] as Position))
    );
    const outer = polys[0]![0]!;
    let updated = outer;
    for (const [key, edit] of Object.entries(edits)) {
      const index = Number(key);
      updated = updateRingVertex(updated, index, edit.lng, edit.lat);
    }
    polys[0]![0] = updated;
    return { type: "MultiPolygon", coordinates: polys };
  }

  return geom;
}

/** Terapkan override posisi vertex pada Feature/Geometry mentah. */
export function applyVertexEditsToStored(
  stored: unknown,
  edits: MoveGeomVertexEdits
): unknown | null {
  if (!stored || typeof stored !== "object") return null;
  if (Object.keys(edits).length === 0) return stored;

  const obj = stored as {
    type?: string;
    geometry?: Geometry;
    properties?: Record<string, unknown>;
  };

  if (obj.type === "Feature" && obj.geometry) {
    return {
      ...obj,
      geometry: applyEditsToGeometry(obj.geometry, edits),
      properties: obj.properties ? { ...obj.properties } : {},
    };
  }

  const geom = asGeometry(stored);
  if (!geom) return null;
  return applyEditsToGeometry(geom, edits);
}

/** Posisi handle vertex setelah translasi/rotasi + override edit. */
export function resolveVertexHandlePositions(
  stored: unknown,
  baseStored: unknown,
  vertexEdits: MoveGeomVertexEdits
): EditableVertexPosition[] {
  const base = extractEditableVertexPositions(baseStored);
  return base.map((v) => {
    const edit = vertexEdits[v.index];
    return edit
      ? { index: v.index, lat: edit.lat, lng: edit.lng }
      : v;
  });
}

export function hasMoveGeomVertexEdits(
  vertexEdits: MoveGeomVertexEdits
): boolean {
  return Object.keys(vertexEdits).length > 0;
}
