import type { MapFootprint } from "@/app/workspace-map";
import {
  defaultTitleFromFeature,
  extractMatchKeyFromProperties,
  parseFeatureCollectionForVirtualImport,
} from "@/lib/virtual-table-geojson-import";

/** Footprint pratinjau impor GeoJSON di tab Map (belum disimpan ke DB). */
export function buildVirtualTableImportPreviewFootprints(
  raw: string,
  tableDisplayName: string,
  matchColumnSlug = "no_bidang"
): { footprints: MapFootprint[] } | { error: string } {
  const parsed = parseFeatureCollectionForVirtualImport(raw);
  if (!parsed.ok) return { error: parsed.error };

  const footprints: MapFootprint[] = [];
  for (const row of parsed.rows) {
    const feat = parsed.fc.features[row.featureIndex];
    if (!feat || feat.type !== "Feature") continue;
    const matchKey =
      extractMatchKeyFromProperties(
        row.props,
        matchColumnSlug,
        row.featureIndex
      ) ?? `fitur-${row.featureIndex + 1}`;
    const title = defaultTitleFromFeature(row.props, matchKey);
    footprints.push({
      id: `vtable-preview:${row.featureIndex}`,
      label: `Pratinjau: ${title}`,
      geojson: feat,
      layerKind: "import_preview",
      popupProperties: {
        Tabel: `${tableDisplayName} (pratinjau)`,
        _popup_row_title: title,
        _preview: true,
      },
    });
  }
  return { footprints };
}

export function mapPreviewLayersSignature(layers: MapFootprint[] | null): string {
  if (!layers?.length) return "";
  return layers.map((l) => l.id).join("\u0001");
}
