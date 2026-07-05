import L from "leaflet";
import type { Map as LeafletMap, TileLayer } from "leaflet";

/** 0% = seluruh basemap kiri (primary); 100% = seluruh basemap kanan (compare). */
export function applyBasemapSwipeClips(
  map: LeafletMap,
  primary: TileLayer,
  compare: TileLayer,
  swipePercent: number
): void {
  const mapSize = map.getSize();
  if (mapSize.x <= 0 || mapSize.y <= 0) return;

  const clipLeftPx = Math.round((mapSize.x * (100 - swipePercent)) / 100);
  const nw = map.containerPointToLayerPoint(L.point(0, 0));
  const se = map.containerPointToLayerPoint(mapSize);
  const dividerX = map.containerPointToLayerPoint(L.point(clipLeftPx, 0)).x;

  const primaryEl = primary.getContainer();
  const compareEl = compare.getContainer();

  if (primaryEl) {
    primaryEl.style.clip = `rect(${nw.y}px, ${dividerX}px, ${se.y}px, ${nw.x}px)`;
    primaryEl.style.clipPath = "none";
  }
  if (compareEl) {
    compareEl.style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${dividerX}px)`;
    compareEl.style.clipPath = "none";
  }
}

export function clearBasemapSwipeClips(
  primary: TileLayer | null,
  compare: TileLayer | null
): void {
  for (const layer of [primary, compare]) {
    const el = layer?.getContainer();
    if (!el) continue;
    el.style.clip = "";
    el.style.clipPath = "";
  }
}

/** Garis pemisah swipe dalam piksel container (dari kiri). */
export function basemapSwipeDividerPx(
  map: LeafletMap,
  swipePercent: number
): number {
  const mapSize = map.getSize();
  return Math.round((mapSize.x * (100 - swipePercent)) / 100);
}
