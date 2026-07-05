import area from "@turf/area";
import centroid from "@turf/centroid";
import { featureCollection, lineString } from "@turf/helpers";
import length from "@turf/length";
import type { MapFootprint } from "@/app/workspace-map";
import {
  footprintToTurfFeatures,
  isPolygonalGeometry,
} from "./workspace-map-geo-utils";
import {
  formatMeasureArea,
  formatMeasureLength,
} from "./workspace-map-measure";

export type FootprintCompareResult = {
  footprintIdA: string;
  footprintIdB: string;
  labelA: string;
  labelB: string;
  centroidA: { lat: number; lng: number } | null;
  centroidB: { lat: number; lng: number } | null;
  centroidALabel: string;
  centroidBLabel: string;
  distanceMeters: number | null;
  distanceLabel: string;
  areaSqMA: number;
  areaSqMB: number;
  areaLabelA: string;
  areaLabelB: string;
  areaDeltaSqM: number;
  areaDeltaLabel: string;
  error: string | null;
};

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

function footprintCentroidLatLng(
  fp: MapFootprint
): { lat: number; lng: number } | null {
  const features = footprintToTurfFeatures(fp).filter((f) => f.geometry);
  if (features.length === 0) return null;

  try {
    const center = centroid(featureCollection(features));
    const coords = center.geometry.coordinates;
    if (coords.length < 2) return null;
    const lng = coords[0];
    const lat = coords[1];
    if (typeof lng !== "number" || typeof lat !== "number") return null;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

function formatCoord(lat: number, lng: number): string {
  return `${lat.toFixed(6)}°, ${lng.toFixed(6)}°`;
}

/**
 * G-D4 — Bandingkan dua fitur: jarak centroid (geodesik) dan selisih luas poligon.
 */
export function compareMapFootprints(
  footprints: MapFootprint[],
  footprintIdA: string,
  footprintIdB: string
): FootprintCompareResult | null {
  const fpA = footprints.find((fp) => fp.id === footprintIdA);
  const fpB = footprints.find((fp) => fp.id === footprintIdB);
  if (!fpA || !fpB) return null;

  const labelA = fpA.label;
  const labelB = fpB.label;

  if (footprintIdA === footprintIdB) {
    return {
      footprintIdA,
      footprintIdB,
      labelA,
      labelB,
      centroidA: footprintCentroidLatLng(fpA),
      centroidB: footprintCentroidLatLng(fpB),
      centroidALabel: "—",
      centroidBLabel: "—",
      distanceMeters: null,
      distanceLabel: "—",
      areaSqMA: footprintAreaSqM(fpA),
      areaSqMB: footprintAreaSqM(fpB),
      areaLabelA: formatMeasureArea(footprintAreaSqM(fpA)),
      areaLabelB: formatMeasureArea(footprintAreaSqM(fpB)),
      areaDeltaSqM: 0,
      areaDeltaLabel: "—",
      error: "Pilih dua fitur berbeda.",
    };
  }

  const centroidA = footprintCentroidLatLng(fpA);
  const centroidB = footprintCentroidLatLng(fpB);
  const areaSqMA = footprintAreaSqM(fpA);
  const areaSqMB = footprintAreaSqM(fpB);
  const areaDeltaSqM = areaSqMB - areaSqMA;

  let distanceMeters: number | null = null;
  let distanceLabel = "—";
  let error: string | null = null;

  if (!centroidA || !centroidB) {
    error = "Salah satu fitur tidak punya geometri untuk centroid.";
  } else {
    try {
      const line = lineString([
        [centroidA.lng, centroidA.lat],
        [centroidB.lng, centroidB.lat],
      ]);
      distanceMeters = length(line, { units: "meters" });
      distanceLabel = formatMeasureLength(distanceMeters);
    } catch {
      error = "Gagal menghitung jarak centroid.";
    }
  }

  const hasPolygonA = areaSqMA > 0;
  const hasPolygonB = areaSqMB > 0;
  let areaDeltaLabel = "—";
  if (hasPolygonA && hasPolygonB) {
    const sign = areaDeltaSqM >= 0 ? "+" : "−";
    areaDeltaLabel = `${sign}${formatMeasureArea(Math.abs(areaDeltaSqM))} (B − A)`;
  } else if (!hasPolygonA && !hasPolygonB) {
    areaDeltaLabel = "Keduanya tanpa luas poligon";
  } else {
    areaDeltaLabel = "Salah satu bukan poligon berluas";
  }

  return {
    footprintIdA,
    footprintIdB,
    labelA,
    labelB,
    centroidA,
    centroidB,
    centroidALabel: centroidA ? formatCoord(centroidA.lat, centroidA.lng) : "—",
    centroidBLabel: centroidB ? formatCoord(centroidB.lat, centroidB.lng) : "—",
    distanceMeters,
    distanceLabel,
    areaSqMA,
    areaSqMB,
    areaLabelA: hasPolygonA ? formatMeasureArea(areaSqMA) : "—",
    areaLabelB: hasPolygonB ? formatMeasureArea(areaSqMB) : "—",
    areaDeltaSqM,
    areaDeltaLabel,
    error,
  };
}

export function listComparableFootprints(
  footprints: MapFootprint[]
): Array<{ id: string; label: string }> {
  return footprints.map((fp) => ({
    id: fp.id,
    label: fp.label,
  }));
}
