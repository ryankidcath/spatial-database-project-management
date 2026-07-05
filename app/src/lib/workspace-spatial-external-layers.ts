const EXTERNAL_LAYERS_KEY_PREFIX = "spatial-pm-external-layers-v1:";

export type ExternalLayerKind = "wms" | "wmts" | "geojson";

export type ExternalLayerStyle = {
  color: string;
  weight: number;
  fillColor: string;
  fillOpacity: number;
};

export type ExternalMapLayerConfig = {
  id: string;
  name: string;
  kind: ExternalLayerKind;
  visible: boolean;
  opacity: number;
  /** WMS GetMap base URL (tanpa query). */
  wmsUrl?: string;
  /** Nama layer WMS (comma-separated). */
  wmsLayers?: string;
  wmsFormat?: string;
  wmsTransparent?: boolean;
  /** Template XYZ/WMTS, mis. `https://…/{z}/{x}/{y}.png`. */
  tileUrl?: string;
  tileMaxZoom?: number;
  tileAttribution?: string;
  /** GeoJSON dari URL publik. */
  geojsonUrl?: string;
  /** GeoJSON unggahan — kunci IndexedDB (`workspace-spatial-geojson-store`). */
  geojsonStoreKey?: string;
  style?: ExternalLayerStyle;
};

export type ResolvedExternalMapLayer = ExternalMapLayerConfig & {
  geojsonData?: GeoJSON.GeoJsonObject | null;
};

const DEFAULT_STYLE: ExternalLayerStyle = {
  color: "#2563eb",
  weight: 2,
  fillColor: "#3b82f6",
  fillOpacity: 0.12,
};

export function defaultExternalLayerStyle(): ExternalLayerStyle {
  return { ...DEFAULT_STYLE };
}

export function createExternalLayerId(): string {
  return `ext_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function storageKey(projectId: string): string {
  return `${EXTERNAL_LAYERS_KEY_PREFIX}${projectId}`;
}

function sanitizeLayer(raw: unknown): ExternalMapLayerConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = o.kind;
  if (kind !== "wms" && kind !== "wmts" && kind !== "geojson") return null;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;

  const styleRaw = o.style;
  let style: ExternalLayerStyle | undefined;
  if (styleRaw && typeof styleRaw === "object") {
    const s = styleRaw as Record<string, unknown>;
    style = {
      color: typeof s.color === "string" ? s.color : DEFAULT_STYLE.color,
      weight: typeof s.weight === "number" ? s.weight : DEFAULT_STYLE.weight,
      fillColor:
        typeof s.fillColor === "string" ? s.fillColor : DEFAULT_STYLE.fillColor,
      fillOpacity:
        typeof s.fillOpacity === "number"
          ? Math.min(1, Math.max(0, s.fillOpacity))
          : DEFAULT_STYLE.fillOpacity,
    };
  }

  return {
    id: o.id,
    name: o.name.trim() || "Lapisan referensi",
    kind,
    visible: o.visible !== false,
    opacity:
      typeof o.opacity === "number"
        ? Math.min(1, Math.max(0, o.opacity))
        : 0.85,
    wmsUrl: typeof o.wmsUrl === "string" ? o.wmsUrl.trim() : undefined,
    wmsLayers: typeof o.wmsLayers === "string" ? o.wmsLayers.trim() : undefined,
    wmsFormat:
      typeof o.wmsFormat === "string" ? o.wmsFormat.trim() : "image/png",
    wmsTransparent: o.wmsTransparent !== false,
    tileUrl: typeof o.tileUrl === "string" ? o.tileUrl.trim() : undefined,
    tileMaxZoom:
      typeof o.tileMaxZoom === "number"
        ? Math.min(22, Math.max(0, o.tileMaxZoom))
        : 19,
    tileAttribution:
      typeof o.tileAttribution === "string" ? o.tileAttribution : undefined,
    geojsonUrl:
      typeof o.geojsonUrl === "string" ? o.geojsonUrl.trim() : undefined,
    geojsonStoreKey:
      typeof o.gejsonStoreKey === "string" ? o.gejsonStoreKey : undefined,
    style,
  };
}

export function loadExternalMapLayers(projectId: string): ExternalMapLayerConfig[] {
  if (typeof window === "undefined" || !projectId) return [];
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeLayer)
      .filter((layer): layer is ExternalMapLayerConfig => layer != null);
  } catch {
    return [];
  }
}

export function saveExternalMapLayers(
  projectId: string,
  layers: ExternalMapLayerConfig[]
): void {
  if (typeof window === "undefined" || !projectId) return;
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(layers));
  } catch {
    /* quota */
  }
}

export function externalLayerKindLabel(kind: ExternalLayerKind): string {
  switch (kind) {
    case "wms":
      return "WMS";
    case "wmts":
      return "WMTS / XYZ";
    case "geojson":
      return "GeoJSON";
  }
}
