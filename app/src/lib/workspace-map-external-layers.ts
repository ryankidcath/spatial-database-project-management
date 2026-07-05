import L from "leaflet";
import type { ResolvedExternalMapLayer } from "@/lib/workspace-spatial-external-layers";
import { defaultExternalLayerStyle } from "@/lib/workspace-spatial-external-layers";

export const EXTERNAL_REFERENCE_PANE = "externalReference";

export function ensureExternalReferencePane(map: L.Map): void {
  if (map.getPane(EXTERNAL_REFERENCE_PANE)) return;
  const pane = map.createPane(EXTERNAL_REFERENCE_PANE);
  pane.style.zIndex = "350";
}

export function createExternalLeafletLayer(
  layer: ResolvedExternalMapLayer
): L.Layer | null {
  if (!layer.visible) return null;

  const pane = EXTERNAL_REFERENCE_PANE;
  const opacity = layer.opacity;

  if (layer.kind === "wms") {
    if (!layer.wmsUrl || !layer.wmsLayers) return null;
    return L.tileLayer.wms(layer.wmsUrl, {
      layers: layer.wmsLayers,
      format: layer.wmsFormat ?? "image/png",
      transparent: layer.wmsTransparent !== false,
      opacity,
      pane,
    });
  }

  if (layer.kind === "wmts") {
    if (!layer.tileUrl) return null;
    return L.tileLayer(layer.tileUrl, {
      maxZoom: layer.tileMaxZoom ?? 19,
      opacity,
      pane,
      attribution: layer.tileAttribution ?? "",
    });
  }

  if (layer.kind === "geojson") {
    const data = layer.geojsonData;
    if (!data) return null;
    const style = layer.style ?? defaultExternalLayerStyle();
    return L.geoJSON(data, {
      pane,
      style: {
        color: style.color,
        weight: style.weight,
        fillColor: style.fillColor,
        fillOpacity: style.fillOpacity * opacity,
        opacity,
      },
    });
  }

  return null;
}

export function externalLayerBounds(
  layer: ResolvedExternalMapLayer
): L.LatLngBounds | null {
  if (layer.kind !== "geojson" || !layer.geojsonData) return null;
  try {
    const gj = L.geoJSON(layer.geojsonData);
    const bounds = gj.getBounds();
    gj.remove();
    return bounds.isValid() ? bounds : null;
  } catch {
    return null;
  }
}
