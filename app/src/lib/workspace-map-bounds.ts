import type { MapFootprint } from "@/app/workspace-map";

export type LatLngBoundsTuple = [[number, number], [number, number]];

function extendBounds(
  bounds: LatLngBoundsTuple | null,
  lng: number,
  lat: number
): LatLngBoundsTuple {
  if (!bounds) return [[lat, lng], [lat, lng]];
  return [
    [Math.min(bounds[0][0], lat), Math.min(bounds[0][1], lng)],
    [Math.max(bounds[1][0], lat), Math.max(bounds[1][1], lng)],
  ];
}

function walkCoords(
  coords: unknown,
  bounds: LatLngBoundsTuple | null
): LatLngBoundsTuple | null {
  if (!Array.isArray(coords)) return bounds;
  if (coords.length >= 2 && typeof coords[0] === "number") {
    const lng = coords[0] as number;
    const lat = coords[1] as number;
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      return extendBounds(bounds, lng, lat);
    }
    return bounds;
  }
  let next = bounds;
  for (const c of coords) {
    next = walkCoords(c, next);
  }
  return next;
}

function boundsFromGeoJson(value: unknown): LatLngBoundsTuple | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as { type?: string; coordinates?: unknown; geometry?: unknown; features?: unknown[] };
  if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
    let bounds: LatLngBoundsTuple | null = null;
    for (const f of obj.features) {
      bounds = boundsFromGeoJson(f) ?? bounds;
      if (f && typeof f === "object") {
        const inner = boundsFromGeoJson((f as { geometry?: unknown }).geometry);
        if (inner) {
          bounds = bounds
            ? [
                [
                  Math.min(bounds[0][0], inner[0][0]),
                  Math.min(bounds[0][1], inner[0][1]),
                ],
                [
                  Math.max(bounds[1][0], inner[1][0]),
                  Math.max(bounds[1][1], inner[1][1]),
                ],
              ]
            : inner;
        }
      }
    }
    return bounds;
  }
  if (obj.type === "Feature" && obj.geometry) {
    return boundsFromGeoJson(obj.geometry);
  }
  if (obj.type && obj.coordinates) {
    return walkCoords(obj.coordinates, null);
  }
  return null;
}

export function computeFootprintsBounds(
  footprints: MapFootprint[]
): LatLngBoundsTuple | null {
  let bounds: LatLngBoundsTuple | null = null;
  for (const fp of footprints) {
    const b = boundsFromGeoJson(fp.geojson);
    if (!b) continue;
    bounds = bounds
      ? [
          [
            Math.min(bounds[0][0], b[0][0]),
            Math.min(bounds[0][1], b[0][1]),
          ],
          [
            Math.max(bounds[1][0], b[1][0]),
            Math.max(bounds[1][1], b[1][1]),
          ],
        ]
      : b;
  }
  return bounds;
}

export function filterFootprintsByTableId(
  footprints: MapFootprint[],
  tableId: string
): MapFootprint[] {
  return footprints.filter(
    (fp) =>
      fp.layerKind === "virtual_table" && fp.virtualTableId === tableId
  );
}
