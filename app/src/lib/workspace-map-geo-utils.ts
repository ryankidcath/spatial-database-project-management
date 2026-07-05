import area from "@turf/area";
import intersect from "@turf/intersect";
import { feature, featureCollection } from "@turf/helpers";
import type { Geometry, MultiPolygon, Polygon } from "geojson";
import type { MapFootprint } from "@/app/workspace-map";

export const MIN_POLYGON_OVERLAP_AREA_SQ_M = 1e-4;

export function asGeometry(geojson: unknown): Geometry | null {
  if (!geojson || typeof geojson !== "object") return null;
  const g = geojson as { type?: string };
  const t = g.type;
  if (
    t === "Polygon" ||
    t === "MultiPolygon" ||
    t === "LineString" ||
    t === "MultiLineString" ||
    t === "Point" ||
    t === "MultiPoint" ||
    t === "GeometryCollection"
  ) {
    return geojson as Geometry;
  }
  return null;
}

export function isPolygonalGeometry(g: Geometry): boolean {
  return g.type === "Polygon" || g.type === "MultiPolygon";
}

export function footprintToTurfFeatures(fp: MapFootprint): GeoJSON.Feature[] {
  const geojson = fp.geojson;
  if (!geojson || typeof geojson !== "object") return [];
  const g = geojson as {
    type?: string;
    features?: GeoJSON.Feature[];
    geometry?: GeoJSON.Geometry;
    coordinates?: unknown;
  };
  if (g.type === "FeatureCollection" && Array.isArray(g.features)) {
    return g.features
      .filter((f) => f.geometry != null)
      .map((f) => ({
        ...f,
        properties: {
          ...(f.properties ?? {}),
          _fpId: fp.id,
          _fpLabel: fp.label,
        },
      }));
  }
  if (g.type === "Feature" && g.geometry) {
    return [
      {
        ...(geojson as GeoJSON.Feature),
        properties: {
          ...((geojson as GeoJSON.Feature).properties ?? {}),
          _fpId: fp.id,
          _fpLabel: fp.label,
        },
      },
    ];
  }
  const geom = asGeometry(geojson);
  if (geom) {
    return [
      feature(geom, { _fpId: fp.id, _fpLabel: fp.label }),
    ];
  }
  return [];
}

export function filterFootprintsByVirtualTable(
  footprints: MapFootprint[],
  tableId: string
): MapFootprint[] {
  return footprints.filter(
    (fp) => fp.layerKind === "virtual_table" && fp.virtualTableId === tableId
  );
}

export function polygonOverlapAreaSqM(a: Geometry, b: Geometry): number {
  if (!isPolygonalGeometry(a) || !isPolygonalGeometry(b)) return 0;
  try {
    const fc = featureCollection([
      feature(a as Polygon | MultiPolygon),
      feature(b as Polygon | MultiPolygon),
    ]);
    const ix = intersect(fc);
    if (ix == null) return 0;
    return area(ix);
  } catch {
    return 0;
  }
}

export function hasPolygonAreaOverlap(a: Geometry, b: Geometry): boolean {
  return polygonOverlapAreaSqM(a, b) > MIN_POLYGON_OVERLAP_AREA_SQ_M;
}
