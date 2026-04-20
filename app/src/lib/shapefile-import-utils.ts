import { parseZip } from "shpjs";

export type ShapefilePolygonLayer = {
  fileName: string;
  /** Hanya fitur Polygon / MultiPolygon; properti dari DBF dipertahankan. */
  featureCollection: GeoJSON.FeatureCollection;
  polygonFeatureCount: number;
};

function isPolygonOrMultiPolygon(geom: unknown): geom is GeoJSON.Polygon | GeoJSON.MultiPolygon {
  if (!geom || typeof geom !== "object") return false;
  const t = (geom as { type?: unknown }).type;
  return t === "Polygon" || t === "MultiPolygon";
}

function filterToPolygonFeatureCollection(
  fc: GeoJSON.FeatureCollection
): GeoJSON.FeatureCollection {
  const features = fc.features.filter(
    (f): f is GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> =>
      Boolean(
        f &&
          f.type === "Feature" &&
          f.geometry &&
          isPolygonOrMultiPolygon(f.geometry)
      )
  );
  return { type: "FeatureCollection", features };
}

/**
 * Membaca ZIP berisi set shapefile (.shp + …). Menggunakan `parseZip` dari shpjs
 * (dukungan .prj → koordinat umumnya sudah lon/lat; pilih EPSG:4326 di form).
 */
export async function parseShapefileZipToPolygonLayers(
  buffer: ArrayBuffer
): Promise<{ ok: true; layers: ShapefilePolygonLayer[] } | { ok: false; error: string }> {
  try {
    const raw = await parseZip(buffer);
    const list = (Array.isArray(raw) ? raw : [raw]) as Array<
      GeoJSON.FeatureCollection & { fileName?: string }
    >;
    const layers: ShapefilePolygonLayer[] = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item || item.type !== "FeatureCollection" || !Array.isArray(item.features)) {
        continue;
      }
      const fileName =
        typeof item.fileName === "string" && item.fileName.trim() !== ""
          ? item.fileName.trim()
          : `layer_${i + 1}`;
      const featureCollection = filterToPolygonFeatureCollection(item);
      const polygonFeatureCount = featureCollection.features.length;
      if (polygonFeatureCount === 0) {
        continue;
      }
      layers.push({ fileName, featureCollection, polygonFeatureCount });
    }
    if (layers.length === 0) {
      return {
        ok: false,
        error:
          "Tidak ada layer poligon (Polygon/MultiPolygon) di ZIP. Periksa isi .shp atau tipe geometri.",
      };
    }
    return { ok: true, layers };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/no layers found/i.test(msg)) {
      return {
        ok: false,
        error: "ZIP tidak berisi berkas .shp yang dikenali.",
      };
    }
    return { ok: false, error: msg || "Gagal membaca ZIP shapefile." };
  }
}
