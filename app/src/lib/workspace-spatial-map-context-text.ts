import type { MapExtentBookmark } from "@/lib/workspace-spatial-map-preferences";

export type MapContextSnapshot = {
  projectName?: string | null;
  view?: MapExtentBookmark | null;
  activeLayerCount?: number;
  featureCount?: number;
  rowLabel?: string | null;
  rowCoordinates?: { lat: number; lng: number } | null;
};

/** G-E3 — teks ringkas untuk ditempel ke chat atau clipboard. */
export function formatSpatialMapContextText(snapshot: MapContextSnapshot): string {
  const lines: string[] = ["📍 Konteks peta"];
  if (snapshot.projectName) {
    lines.push(`Ruang kerja: ${snapshot.projectName}`);
  }
  if (snapshot.rowLabel) {
    lines.push(`Baris: ${snapshot.rowLabel}`);
  }
  if (snapshot.rowCoordinates) {
    const { lat, lng } = snapshot.rowCoordinates;
    lines.push(`Centroid: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
  }
  if (snapshot.view) {
    lines.push(
      `Pusat peta: ${snapshot.view.lat.toFixed(6)}, ${snapshot.view.lng.toFixed(6)} (zoom ${snapshot.view.zoom})`
    );
  }
  if (snapshot.activeLayerCount != null) {
    lines.push(
      `Lapisan aktif: ${snapshot.activeLayerCount}${snapshot.featureCount != null ? ` · ${snapshot.featureCount} fitur` : ""}`
    );
  }
  return lines.join("\n");
}
