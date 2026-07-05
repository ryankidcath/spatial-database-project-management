import L from "leaflet";
import { getOfflineTileBlob } from "@/lib/workspace-spatial-offline-tiles";

type CachedTileLayerOptions = L.TileLayerOptions & {
  cacheBasemapId: string;
  offlineMode: boolean;
};

export function createCachedBasemapLayer(
  url: string,
  options: CachedTileLayerOptions
): L.TileLayer {
  const { cacheBasemapId, offlineMode, ...leafletOptions } = options;

  const CachedLayer = L.TileLayer.extend({
    createTile(
      this: L.TileLayer,
      coords: L.Coords,
      done: L.DoneCallback
    ): HTMLElement {
      const tile = document.createElement("img");
      tile.alt = "";
      tile.setAttribute("role", "presentation");

      void (async () => {
        const cached = await getOfflineTileBlob(
          cacheBasemapId,
          coords.z,
          coords.x,
          coords.y
        );
        if (cached) {
          tile.src = URL.createObjectURL(cached);
          done(undefined, tile);
          return;
        }
        if (offlineMode) {
          tile.classList.add("leaflet-tile");
          done(undefined, tile);
          return;
        }
        const url = (this as L.TileLayer).getTileUrl(coords);
        tile.crossOrigin = "anonymous";
        tile.onload = () => done(undefined, tile);
        tile.onerror = () => done(new Error("Tile load failed"), tile);
        tile.src = url;
      })();

      return tile;
    },
  });

  type CachedTileLayerClass = new (
    url: string,
    options?: L.TileLayerOptions
  ) => L.TileLayer;

  return new (CachedLayer as CachedTileLayerClass)(url, {
    ...leafletOptions,
    crossOrigin: true,
  });
}
