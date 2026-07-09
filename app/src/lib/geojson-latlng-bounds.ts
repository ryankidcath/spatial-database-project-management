import { extractMultiPolygonFromGeoJSON } from "@/lib/geojson-multipolygon";

/** [[south, west], [north, east]] — aman untuk SSR (tanpa Leaflet). */
export type GeoJsonLatLngBoundsTuple = [[number, number], [number, number]];

export function geoJsonLatLngBoundsTuple(
  geojson: unknown
): GeoJsonLatLngBoundsTuple | null {
  const mp = extractMultiPolygonFromGeoJSON(geojson);
  if (!mp) return null;

  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;

  for (const poly of mp) {
    for (const ring of poly) {
      for (const [lng, lat] of ring) {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        south = Math.min(south, lat);
        north = Math.max(north, lat);
        west = Math.min(west, lng);
        east = Math.max(east, lng);
      }
    }
  }

  if (!Number.isFinite(south)) return null;
  if (south === north && west === east) return null;
  return [
    [south, west],
    [north, east],
  ];
}
