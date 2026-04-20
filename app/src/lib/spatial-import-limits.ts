/**
 * Batas ukuran teks untuk payload geometri (GeoJSON / batch / DXF) di server action,
 * plus batas ZIP shapefile di klien sebelum konversi ke GeoJSON batch.
 */
export const MAX_SPATIAL_GEOMETRY_TEXT_CHARS = 12 * 1024 * 1024;

export const MAX_SPATIAL_GEOMETRY_TEXT_MB = 12;

/** Batas ukuran berkas ZIP shapefile di klien (bukan batas teks GeoJSON ke server). */
export const MAX_SHAPEFILE_ZIP_BYTES = 36 * 1024 * 1024;

export function shapefileZipTooLargeMessage(): string {
  const mb = Math.round(MAX_SHAPEFILE_ZIP_BYTES / (1024 * 1024));
  return `ZIP shapefile melebihi batas ~${mb} MB.`;
}

export function spatialGeometryTextTooLargeMessage(jenisBerkas: string): string {
  return `${jenisBerkas} melebihi batas ~${MAX_SPATIAL_GEOMETRY_TEXT_MB} MB teks. Perkecil file atau bagi beberapa batch.`;
}

/** CSV UTF-8 (BOM) untuk kolom `feature_key` + `label` — selaras dengan tabel mapping DXF & impor atribut. */
export function dxfKeyMappingTemplateCsv(): string {
  const rows = [
    "feature_key,label",
    "contoh-bidang-1,",
    "contoh-bidang-2,",
    '"contoh-dengan-koma","Label opsional"',
  ];
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

/** Satu kolom `feature_key` untuk contoh import atribut (tab Tabel). */
export function attributeFeatureKeyTemplateCsv(): string {
  const rows = ["feature_key", "contoh-001", "contoh-002"];
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}
