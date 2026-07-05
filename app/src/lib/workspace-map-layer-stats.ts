import area from "@turf/area";
import type { MapFootprint } from "@/app/workspace-map";
import { computeFootprintsBounds } from "./workspace-map-bounds";
import {
  filterFootprintsByVirtualTable,
  footprintToTurfFeatures,
  isPolygonalGeometry,
} from "./workspace-map-geo-utils";
import { formatMeasureArea } from "./workspace-map-measure";

export type LayerExtentStat = {
  tableId: string;
  displayName: string;
  featureCount: number;
  totalAreaSqM: number;
  totalAreaLabel: string;
  bbox: [[number, number], [number, number]] | null;
  bboxLabel: string;
};

function formatBboxLabel(
  bbox: [[number, number], [number, number]] | null
): string {
  if (!bbox) return "—";
  const [[minLat, minLng], [maxLat, maxLng]] = bbox;
  return `${minLat.toFixed(5)}°, ${minLng.toFixed(5)}° → ${maxLat.toFixed(5)}°, ${maxLng.toFixed(5)}°`;
}

function footprintAreaSqM(fp: MapFootprint): number {
  const features = footprintToTurfFeatures(fp);
  let total = 0;
  for (const f of features) {
    if (!f.geometry || !isPolygonalGeometry(f.geometry)) continue;
    try {
      total += area(f);
    } catch {
      /* skip invalid */
    }
  }
  return total;
}

/**
 * G-D3 — Statistik extent per lapisan aktif: jumlah fitur, total luas, bbox.
 */
export function computeLayerExtentStats(
  footprints: MapFootprint[],
  layers: Array<{ tableId: string; displayName: string }>
): LayerExtentStat[] {
  return layers.map(({ tableId, displayName }) => {
    const layerFps = filterFootprintsByVirtualTable(footprints, tableId);
    const totalAreaSqM = layerFps.reduce(
      (sum, fp) => sum + footprintAreaSqM(fp),
      0
    );
    const bbox = computeFootprintsBounds(layerFps);
    return {
      tableId,
      displayName,
      featureCount: layerFps.length,
      totalAreaSqM,
      totalAreaLabel: formatMeasureArea(totalAreaSqM),
      bbox,
      bboxLabel: formatBboxLabel(bbox),
    };
  });
}

export function computeAllVisibleLayerStats(
  footprints: MapFootprint[],
  layerRows: Array<{
    tableId: string;
    displayName: string;
    visible: boolean;
    featureCount: number;
  }>
): LayerExtentStat[] {
  const active = layerRows.filter((r) => r.visible && r.featureCount > 0);
  return computeLayerExtentStats(footprints, active);
}

export function computeCombinedVisibleStats(
  stats: LayerExtentStat[]
): {
  featureCount: number;
  totalAreaSqM: number;
  totalAreaLabel: string;
} {
  const featureCount = stats.reduce((s, x) => s + x.featureCount, 0);
  const totalAreaSqM = stats.reduce((s, x) => s + x.totalAreaSqM, 0);
  return {
    featureCount,
    totalAreaSqM,
    totalAreaLabel: formatMeasureArea(totalAreaSqM),
  };
}
