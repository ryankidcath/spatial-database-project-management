const STYLE_KEY_PREFIX = "spatial-pm-layer-style-v1:";

export type LayerDashStyle = "solid" | "dashed" | "dotted";

export type SpatialLayerSymbolStyle = {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  dash?: LayerDashStyle;
};

export type SpatialLayerStyleByTable = Record<string, SpatialLayerSymbolStyle>;

export function dashArrayForStyle(
  dash: LayerDashStyle | undefined
): string | undefined {
  switch (dash) {
    case "dashed":
      return "8 5";
    case "dotted":
      return "2 4";
    default:
      return undefined;
  }
}

export function loadSpatialLayerStyles(
  projectId: string
): SpatialLayerStyleByTable {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`${STYLE_KEY_PREFIX}${projectId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SpatialLayerStyleByTable;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

export function saveSpatialLayerStyles(
  projectId: string,
  styles: SpatialLayerStyleByTable
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STYLE_KEY_PREFIX}${projectId}`, JSON.stringify(styles));
  } catch {
    /* quota */
  }
}

export function resolveLayerSymbolStyle(
  styles: SpatialLayerStyleByTable,
  tableId: string
): SpatialLayerSymbolStyle | undefined {
  return styles[tableId];
}
