import proj4 from "proj4";

const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

function ensureUtm(epsg: number, def: string): void {
  proj4.defs(`EPSG:${epsg}`, def);
}

ensureUtm(
  32748,
  "+proj=utm +zone=48 +south +datum=WGS84 +units=m +no_defs"
);
ensureUtm(
  32749,
  "+proj=utm +zone=49 +south +datum=WGS84 +units=m +no_defs"
);

export type GoToParseResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; error: string };

export function parseGoToLatLng(
  latRaw: string,
  lngRaw: string
): GoToParseResult {
  const lat = Number.parseFloat(latRaw.trim().replace(",", "."));
  const lng = Number.parseFloat(lngRaw.trim().replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "Latitude dan longitude harus angka valid." };
  }
  if (lat < -90 || lat > 90) {
    return { ok: false, error: "Latitude harus antara -90 dan 90." };
  }
  if (lng < -180 || lng > 180) {
    return { ok: false, error: "Longitude harus antara -180 dan 180." };
  }
  return { ok: true, lat, lng };
}

export function parseGoToUtm(
  zone: 48 | 49,
  eastRaw: string,
  northRaw: string
): GoToParseResult {
  const east = Number.parseFloat(eastRaw.trim().replace(",", "."));
  const north = Number.parseFloat(northRaw.trim().replace(",", "."));
  if (!Number.isFinite(east) || !Number.isFinite(north)) {
    return { ok: false, error: "Eastings dan northings harus angka valid." };
  }
  const epsg = zone === 48 ? "EPSG:32748" : "EPSG:32749";
  try {
    const [lng, lat] = proj4(epsg, WGS84, [east, north]) as [number, number];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, error: "Hasil konversi UTM tidak valid." };
    }
    return { ok: true, lat, lng };
  } catch {
    return { ok: false, error: "Gagal konversi UTM ke WGS84." };
  }
}
