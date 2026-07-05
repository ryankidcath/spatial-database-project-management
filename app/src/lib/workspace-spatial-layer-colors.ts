/** Palet tetap untuk layer tabel virtual di tab Spasial (SQ3: rotasi otomatis). */
export const SPATIAL_VTABLE_LAYER_COLORS = [
  "#fbbf24",
  "#60a5fa",
  "#34d399",
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#2dd4bf",
  "#818cf8",
] as const;

export function spatialLayerColorForTableIndex(index: number): string {
  const palette = SPATIAL_VTABLE_LAYER_COLORS;
  return palette[index % palette.length] ?? palette[0]!;
}

export const SPATIAL_IMPORT_PREVIEW_COLOR = "#5eead4";
