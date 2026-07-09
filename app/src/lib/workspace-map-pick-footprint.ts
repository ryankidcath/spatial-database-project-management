import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import buffer from "@turf/buffer";
import { point } from "@turf/helpers";
import type { MapFootprint } from "@/app/workspace-map";
import { asGeometry } from "@/lib/workspace-map-geo-utils";

function footprintFeatures(geojson: unknown): GeoJSON.Feature[] {
  if (!geojson || typeof geojson !== "object") return [];
  const g = geojson as {
    type?: string;
    features?: GeoJSON.Feature[];
    geometry?: GeoJSON.Geometry;
  };
  if (g.type === "FeatureCollection" && Array.isArray(g.features)) {
    return g.features;
  }
  if (g.type === "Feature") {
    return [geojson as GeoJSON.Feature];
  }
  const geom = asGeometry(geojson);
  if (geom) {
    return [{ type: "Feature", properties: {}, geometry: geom }];
  }
  return [];
}

function pointHitsFeature(
  pt: GeoJSON.Feature<GeoJSON.Point>,
  feature: GeoJSON.Feature,
  lineHitMeters: number
): boolean {
  const geom = feature.geometry;
  if (!geom) return false;
  if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
    try {
      return booleanPointInPolygon(
        pt,
        feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
      );
    } catch {
      return false;
    }
  }
  if (geom.type === "LineString" || geom.type === "MultiLineString") {
    try {
      const poly = buffer(feature, lineHitMeters, { units: "meters" });
      if (!poly) return false;
      return booleanPointInPolygon(
        pt,
        poly as GeoJSON.Feature<GeoJSON.Polygon>
      );
    } catch {
      return false;
    }
  }
  if (geom.type === "Point") {
    const coords = geom.coordinates;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
    const dx = (lng - pt.geometry.coordinates[0]!) * 111_320;
    const dy = (lat - pt.geometry.coordinates[1]!) * 111_320;
    return Math.hypot(dx, dy) <= lineHitMeters;
  }
  return false;
}

/**
 * Pilih footprint virtual_table di titik klik (poligon / garis / titik).
 * Urutan: lapisan atas (later in list) first.
 */
export function pickVirtualTableFootprintAtPoint(
  footprints: MapFootprint[],
  lat: number,
  lng: number,
  lineHitMeters = 4
): MapFootprint | null {
  const pt = point([lng, lat]);
  for (let i = footprints.length - 1; i >= 0; i--) {
    const fp = footprints[i]!;
    if (fp.layerKind !== "virtual_table") continue;
    if (!fp.virtualRowId || !fp.virtualTableId) continue;
    const features = footprintFeatures(fp.geojson);
    for (const feature of features) {
      if (pointHitsFeature(pt, feature, lineHitMeters)) {
        return fp;
      }
    }
  }
  return null;
}
