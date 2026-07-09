import proj4 from "proj4";

import type { DxfLinePath, DxfPoint, LinearRing } from "./dxf-import-utils";

const WGS84_LNG_LAT = "+proj=longlat +datum=WGS84 +no_defs";

/** Definisi PROJ untuk SRID yang dipakai form impor (pratinjau peta DXF). */
const EPSG_PROJ4: Record<number, string> = {
  4326: WGS84_LNG_LAT,
  32748: "+proj=utm +zone=48 +south +datum=WGS84 +units=m +no_defs",
  32749: "+proj=utm +zone=49 +south +datum=WGS84 +units=m +no_defs",
  23833:
    "+proj=tmerc +lat_0=0 +lon_0=103.5 +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  23834:
    "+proj=tmerc +lat_0=0 +lon_0=106.5 +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  23835:
    "+proj=tmerc +lat_0=0 +lon_0=109.5 +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  23836:
    "+proj=tmerc +lat_0=0 +lon_0=112.5 +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
};

const registered = new Set<number>();

function ensureEpsgDef(epsg: number): void {
  if (registered.has(epsg)) return;
  const def = EPSG_PROJ4[epsg];
  if (!def) {
    throw new Error(`EPSG:${epsg} belum didukung untuk pratinjau peta.`);
  }
  proj4.defs(`EPSG:${epsg}`, def);
  registered.add(epsg);
}

export function isPreviewSourceSridSupported(epsg: number): boolean {
  return Object.prototype.hasOwnProperty.call(EPSG_PROJ4, epsg);
}

/** Ring DXF (x,y di CRS sumber) → ring GeoJSON [lng, lat] di WGS84. */
export function reprojectLinearRingTo4326(
  ring: LinearRing,
  sourceEpsg: number
): LinearRing {
  if (sourceEpsg === 4326) {
    return ring.map(([x, y]) => [x, y] as [number, number]);
  }
  ensureEpsgDef(sourceEpsg);
  ensureEpsgDef(4326);
  const from = `EPSG:${sourceEpsg}`;
  const to = `EPSG:4326`;
  return ring.map(([x, y]) => {
    const [lng, lat] = proj4(from, to, [x, y]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      throw new Error("Titik hasil proyeksi tidak valid.");
    }
    return [lng, lat] as [number, number];
  });
}

export function reprojectDxfPointTo4326(
  point: DxfPoint,
  sourceEpsg: number
): DxfPoint {
  const [x, y] = point;
  if (sourceEpsg === 4326) {
    return [x, y];
  }
  ensureEpsgDef(sourceEpsg);
  ensureEpsgDef(4326);
  const from = `EPSG:${sourceEpsg}`;
  const to = `EPSG:4326`;
  const [lng, lat] = proj4(from, to, [x, y]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error("Titik hasil proyeksi tidak valid.");
  }
  return [lng, lat];
}

/** FeatureCollection untuk Leaflet; `dxfPolygonIndex` = indeks 0-based sama baris tabel mapping. */
export function dxfRingsToWgs84PreviewFeatureCollection(
  rings: LinearRing[],
  sourceEpsg: number
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i]!;
    const ll = reprojectLinearRingTo4326(ring, sourceEpsg);
    if (ll.length < 4) {
      throw new Error(`Poligon #${i + 1} tidak valid setelah proyeksi (terlalu sedikit titik).`);
    }
    features.push({
      type: "Feature",
      properties: { dxfPolygonIndex: i },
      geometry: {
        type: "Polygon",
        coordinates: [ll.map(([lng, lat]) => [lng, lat])],
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function reprojectDxfLinePathTo4326(
  path: DxfLinePath,
  sourceEpsg: number
): DxfLinePath {
  const out = path.map((pt) => reprojectDxfPointTo4326(pt, sourceEpsg));
  if (out.length < 2) {
    throw new Error("Garis hasil proyeksi tidak valid (terlalu sedikit titik).");
  }
  return out;
}

/** FeatureCollection LineString untuk pratinjau DXF. */
export function dxfLinePathsToWgs84PreviewFeatureCollection(
  paths: DxfLinePath[],
  sourceEpsg: number
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < paths.length; i++) {
    const ll = reprojectDxfLinePathTo4326(paths[i]!, sourceEpsg);
    features.push({
      type: "Feature",
      properties: { dxfPolygonIndex: i },
      geometry: {
        type: "LineString",
        coordinates: ll.map(([lng, lat]) => [lng, lat]),
      },
    });
  }
  return { type: "FeatureCollection", features };
}

/** FeatureCollection Point untuk pratinjau DXF. */
export function dxfPointsToWgs84PreviewFeatureCollection(
  points: DxfPoint[],
  sourceEpsg: number
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < points.length; i++) {
    const [lng, lat] = reprojectDxfPointTo4326(points[i]!, sourceEpsg);
    features.push({
      type: "Feature",
      properties: { dxfPolygonIndex: i },
      geometry: {
        type: "Point",
        coordinates: [lng, lat],
      },
    });
  }
  return { type: "FeatureCollection", features };
}
