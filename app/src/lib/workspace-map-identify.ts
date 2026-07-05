import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { MapFootprint } from "@/app/workspace-map";
import type { MapIdentifyHit } from "./workspace-map-tool-types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function footprintFeatures(geojson: unknown): GeoJSON.Feature[] {
  if (!geojson || typeof geojson !== "object") return [];
  const g = geojson as { type?: string; features?: GeoJSON.Feature[]; geometry?: GeoJSON.Geometry; properties?: unknown };
  if (g.type === "FeatureCollection" && Array.isArray(g.features)) {
    return g.features;
  }
  if (g.type === "Feature") {
    return [geojson as GeoJSON.Feature];
  }
  if (g.type && g.geometry) {
    return [{ type: "Feature", properties: {}, geometry: g.geometry }];
  }
  if (g.type && "coordinates" in g) {
    return [
      {
        type: "Feature",
        properties: {},
        geometry: g as GeoJSON.Geometry,
      },
    ];
  }
  return [];
}

function mergedProperties(
  fp: MapFootprint,
  feature: GeoJSON.Feature
): Record<string, unknown> {
  const featureProps = isRecord(feature.properties) ? feature.properties : {};
  const fallback = isRecord(fp.popupProperties) ? fp.popupProperties : {};
  return { ...featureProps, ...fallback };
}

/** G-B2 — fitur di titik klik (urutan: lapisan atas / later in list first). */
export function identifyFootprintsAtPoint(
  footprints: MapFootprint[],
  lat: number,
  lng: number
): MapIdentifyHit[] {
  const pt = point([lng, lat]);
  const hits: MapIdentifyHit[] = [];

  for (let i = footprints.length - 1; i >= 0; i--) {
    const fp = footprints[i]!;
    const features = footprintFeatures(fp.geojson);
    for (const feature of features) {
      if (!feature.geometry) continue;
      try {
        if (!booleanPointInPolygon(pt, feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>)) {
          continue;
        }
      } catch {
        continue;
      }
      const props = mergedProperties(fp, feature);
      hits.push({
        footprintId: fp.id,
        label: fp.label,
        layerKind: fp.layerKind ?? "demo",
        virtualTableId: fp.virtualTableId,
        virtualRowId: fp.virtualRowId,
        properties: props,
      });
      break;
    }
  }

  return hits;
}
