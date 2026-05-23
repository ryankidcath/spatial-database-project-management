import type { LinearRing } from "@/lib/dxf-import-utils";
import { reprojectLinearRingTo4326 } from "@/lib/crs-reproject";

/** Opsi SRID yang didukung pratinjau & impor DXF ke virtual table (WGS84 di payload). */
export const VIRTUAL_TABLE_DXF_SOURCE_SRID_OPTIONS: Array<{
  value: string;
  label: string;
}> = [
  { value: "4326", label: "EPSG:4326 - WGS84 (Lat/Lon)" },
  { value: "32748", label: "EPSG:32748 - UTM Zone 48S" },
  { value: "32749", label: "EPSG:32749 - UTM Zone 49S" },
  { value: "23833", label: "EPSG:23833 - TM-3 48.1" },
  { value: "23834", label: "EPSG:23834 - TM-3 48.2" },
  { value: "23835", label: "EPSG:23835 - TM-3 49.1" },
  { value: "23836", label: "EPSG:23836 - TM-3 49.2" },
];

export function parseVirtualTableDxfSourceSrid(
  raw: string
): { ok: true; srid: number } | { ok: false; error: string } {
  const val = raw.trim();
  if (!val) return { ok: true, srid: 4326 };
  const num = Number(val);
  if (!Number.isInteger(num) || num <= 0) {
    return {
      ok: false,
      error:
        "EPSG/SRID sumber harus bilangan bulat positif (contoh: 32748).",
    };
  }
  return { ok: true, srid: num };
}

/** CSV UTF-8 (BOM) untuk kolom kunci + label — urutan baris = urutan poligon DXF. */
export function virtualTableDxfKeyMappingTemplateCsv(
  matchColumnSlug: string
): string {
  const keyCol = matchColumnSlug.trim() || "no_bidang";
  const rows = [
    `${keyCol},title`,
    "contoh-bidang-1,",
    "contoh-bidang-2,",
    '"contoh-dengan-koma","Label opsional"',
  ];
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

/** FeatureCollection WGS84 untuk impor virtual_rows (satu poligon = satu feature). */
export function buildVirtualTableDxfFeatureCollection(
  rings: LinearRing[],
  matchKeys: string[],
  labels: (string | null)[],
  matchColumnSlug: string,
  layerName: string,
  sourceEpsg: number
): GeoJSON.FeatureCollection {
  const slug = matchColumnSlug.trim();
  if (!slug) {
    throw new Error("match_column_slug kosong");
  }
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i]!;
    const matchKey = matchKeys[i]!.trim();
    if (!matchKey) {
      throw new Error(`Poligon #${i + 1}: kunci pencocokan kosong`);
    }
    const ll = reprojectLinearRingTo4326(ring, sourceEpsg);
    if (ll.length < 4) {
      throw new Error(
        `Poligon #${i + 1} tidak valid setelah proyeksi (terlalu sedikit titik).`
      );
    }
    const customLabel = labels[i];
    const title =
      customLabel != null && customLabel.trim() !== ""
        ? customLabel.trim()
        : `DXF ${layerName} #${i + 1}`;
    features.push({
      type: "Feature",
      properties: {
        [slug]: matchKey,
        title,
        source: "dxf",
        dxf_layer: layerName,
        dxf_polygon_index: i + 1,
      },
      geometry: {
        type: "Polygon",
        coordinates: [ll.map(([lng, lat]) => [lng, lat])],
      },
    });
  }
  return { type: "FeatureCollection", features };
}
