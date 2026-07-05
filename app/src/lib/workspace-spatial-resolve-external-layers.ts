import type {
  ExternalMapLayerConfig,
  ResolvedExternalMapLayer,
} from "@/lib/workspace-spatial-external-layers";
import { loadGeoJsonBlob } from "@/lib/workspace-spatial-geojson-store";

export async function resolveExternalMapLayers(
  configs: ExternalMapLayerConfig[]
): Promise<ResolvedExternalMapLayer[]> {
  const resolved: ResolvedExternalMapLayer[] = [];

  for (const cfg of configs) {
    if (cfg.kind !== "geojson") {
      resolved.push({ ...cfg });
      continue;
    }

    let geojsonData: GeoJSON.GeoJsonObject | null = null;
    if (cfg.geojsonStoreKey) {
      geojsonData = await loadGeoJsonBlob(cfg.geojsonStoreKey);
    } else if (cfg.geojsonUrl) {
      try {
        const res = await fetch(cfg.geojsonUrl);
        if (res.ok) {
          geojsonData = (await res.json()) as GeoJSON.GeoJsonObject;
        }
      } catch {
        geojsonData = null;
      }
    }

    resolved.push({ ...cfg, geojsonData });
  }

  return resolved;
}

export function externalLayersResolveKey(
  configs: ExternalMapLayerConfig[]
): string {
  return configs
    .map(
      (c) =>
        `${c.id}:${c.visible}:${c.opacity}:${c.kind}:${c.wmsUrl ?? ""}:${c.wmsLayers ?? ""}:${c.tileUrl ?? ""}:${c.geojsonUrl ?? ""}:${c.geojsonStoreKey ?? ""}`
    )
    .join("|");
}
