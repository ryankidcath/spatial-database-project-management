"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import {
  buildGraticuleGrid,
  formatDegreeLabel,
  GRATICULE_PANE,
} from "@/lib/workspace-map-graticule";

type Props = {
  map: L.Map | null;
  enabled: boolean;
};

const LINE_STYLE: L.PolylineOptions = {
  color: "#64748b",
  weight: 1,
  opacity: 0.45,
  interactive: false,
  pane: GRATICULE_PANE,
};

function ensureGraticulePane(map: L.Map): void {
  if (map.getPane(GRATICULE_PANE)) return;
  const pane = map.createPane(GRATICULE_PANE);
  pane.style.zIndex = "350";
  pane.style.pointerEvents = "none";
}

export function WorkspaceMapGraticuleLayer({ map, enabled }: Props) {
  const groupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!map) return;

    if (groupRef.current) {
      groupRef.current.remove();
      groupRef.current = null;
    }

    if (!enabled) return;

    ensureGraticulePane(map);
    const group = L.layerGroup().addTo(map);
    groupRef.current = group;

    const redraw = () => {
      group.clearLayers();
      const bounds = map.getBounds();
      const south = bounds.getSouth();
      const north = bounds.getNorth();
      const west = bounds.getWest();
      const east = bounds.getEast();

      const grid = buildGraticuleGrid({ south, north, west, east });

      for (const lat of grid.latLines) {
        L.polyline(
          [
            [lat, west],
            [lat, east],
          ],
          LINE_STYLE
        ).addTo(group);

        L.marker([lat, west], {
          interactive: false,
          keyboard: false,
          pane: GRATICULE_PANE,
          icon: L.divIcon({
            className: "workspace-map-graticule-label workspace-map-graticule-label--lat",
            html: formatDegreeLabel(lat, grid.latStep),
          }),
        }).addTo(group);
      }

      for (const lng of grid.lngLines) {
        L.polyline(
          [
            [south, lng],
            [north, lng],
          ],
          LINE_STYLE
        ).addTo(group);

        L.marker([south, lng], {
          interactive: false,
          keyboard: false,
          pane: GRATICULE_PANE,
          icon: L.divIcon({
            className: "workspace-map-graticule-label workspace-map-graticule-label--lng",
            html: formatDegreeLabel(lng, grid.lngStep),
          }),
        }).addTo(group);
      }
    };

    redraw();
    map.on("moveend", redraw);
    map.on("zoomend", redraw);
    map.on("resize", redraw);

    return () => {
      map.off("moveend", redraw);
      map.off("zoomend", redraw);
      map.off("resize", redraw);
      group.remove();
      if (groupRef.current === group) {
        groupRef.current = null;
      }
    };
  }, [map, enabled]);

  return null;
}
