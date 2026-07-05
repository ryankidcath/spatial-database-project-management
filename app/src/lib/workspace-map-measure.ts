import area from "@turf/area";
import length from "@turf/length";
import { lineString, polygon } from "@turf/helpers";
import type { MapMeasureResult } from "./workspace-map-tool-types";

export function formatMeasureLength(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (meters >= 1000) {
    return `${(meters / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} km`;
  }
  return `${meters.toLocaleString("id-ID", { maximumFractionDigits: 1 })} m`;
}

export function formatMeasureArea(squareMeters: number): string {
  if (!Number.isFinite(squareMeters) || squareMeters < 0) return "—";
  const ha = squareMeters / 10_000;
  if (ha >= 1) {
    return `${ha.toLocaleString("id-ID", { maximumFractionDigits: 3 })} ha (${squareMeters.toLocaleString("id-ID", { maximumFractionDigits: 0 })} m²)`;
  }
  return `${squareMeters.toLocaleString("id-ID", { maximumFractionDigits: 1 })} m²`;
}

export function measureLineFromLatLngs(
  points: Array<{ lat: number; lng: number }>
): MapMeasureResult | null {
  if (points.length < 2) return null;
  const coords = points.map((p) => [p.lng, p.lat] as [number, number]);
  const line = lineString(coords);
  const meters = length(line, { units: "meters" });
  return { kind: "line", squareMeters: meters, pointCount: points.length };
}

export function measureAreaFromLatLngs(
  points: Array<{ lat: number; lng: number }>
): MapMeasureResult | null {
  if (points.length < 3) return null;
  const ring = points.map((p) => [p.lng, p.lat] as [number, number]);
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  const poly = polygon([ring]);
  const squareMeters = area(poly);
  return { kind: "area", squareMeters, pointCount: points.length };
}

export function formatMeasureResult(result: MapMeasureResult): string {
  if (result.kind === "line") {
    return formatMeasureLength(result.squareMeters);
  }
  return formatMeasureArea(result.squareMeters);
}
