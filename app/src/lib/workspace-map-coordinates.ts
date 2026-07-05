import proj4 from "proj4";

const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";
const UTM48S =
  "+proj=utm +zone=48 +south +datum=WGS84 +units=m +no_defs";
const UTM49S =
  "+proj=utm +zone=49 +south +datum=WGS84 +units=m +no_defs";

let utmRegistered = false;

function ensureUtmDefs(): void {
  if (utmRegistered) return;
  proj4.defs("WGS84", WGS84);
  proj4.defs("EPSG:32748", UTM48S);
  proj4.defs("EPSG:32749", UTM49S);
  utmRegistered = true;
}

/** Heuristik Indonesia: lon < 108° → UTM 48S, else 49S. */
export function utmZoneForLng(lng: number): 48 | 49 {
  return lng < 108 ? 48 : 49;
}

export function formatLatLng(lat: number, lng: number): string {
  return `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;
}

export function formatUtm(lat: number, lng: number): string {
  ensureUtmDefs();
  const zone = utmZoneForLng(lng);
  const epsg = zone === 48 ? "EPSG:32748" : "EPSG:32749";
  const [e, n] = proj4("WGS84", epsg, [lng, lat]) as [number, number];
  if (!Number.isFinite(e) || !Number.isFinite(n)) return "—";
  return `UTM ${zone}S  E ${Math.round(e)}  N ${Math.round(n)}`;
}

/** Perkiraan skala 1:N di titik lintang tertentu (Web Mercator). */
export function approximateMapScaleDenominator(
  zoom: number,
  lat: number
): number {
  const metersPerPixel =
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  return Math.round(metersPerPixel * 39.37 * 96);
}

export function formatMapScale(zoom: number, lat: number): string {
  const denom = approximateMapScaleDenominator(zoom, lat);
  if (!Number.isFinite(denom) || denom <= 0) return "—";
  return `1:${denom.toLocaleString("id-ID")}`;
}
