"use client";

import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import type { MapFootprint } from "./workspace-map";
import {
  collectSnapVerticesFromFootprints,
  DEFAULT_SNAP_PIXEL_TOLERANCE,
  type LatLngPoint,
} from "@/lib/workspace-map-draw-bidang";

export type DrawBidangControllerState = {
  pointCount: number;
  closed: boolean;
};

type Props = {
  map: L.Map | null;
  active: boolean;
  snapEnabled: boolean;
  snapFootprints: MapFootprint[];
  onDraftChange: (state: DrawBidangControllerState) => void;
  onRingClosed: (ring: LatLngPoint[]) => void;
  closeRingSignal: number;
  undoPointSignal: number;
  clearDrawSignal: number;
};

const DRAW_COLOR = "#c2410c";
const DRAW_FILL = "#ea580c";
const SNAP_PANE = "drawSnapIndicator";

const SNAP_MARKER_ICON = L.divIcon({
  className: "workspace-map-snap-indicator",
  html: '<div class="workspace-map-snap-indicator__box" aria-hidden="true"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function ensureSnapPane(map: L.Map): string {
  if (!map.getPane(SNAP_PANE)) {
    const pane = map.createPane(SNAP_PANE);
    pane.style.zIndex = "650";
  }
  return SNAP_PANE;
}

function findSnapVertex(
  map: L.Map,
  latlng: L.LatLng,
  layerVertices: LatLngPoint[],
  draftVertices: LatLngPoint[],
  pixelTolerance = DEFAULT_SNAP_PIXEL_TOLERANCE
): LatLngPoint | null {
  const vertices = [...layerVertices, ...draftVertices];
  if (vertices.length === 0) return null;
  const clickPt = map.latLngToContainerPoint(latlng);
  let best: LatLngPoint | null = null;
  let bestDist = pixelTolerance;
  for (const v of vertices) {
    const pt = map.latLngToContainerPoint(L.latLng(v.lat, v.lng));
    const d = Math.hypot(pt.x - clickPt.x, pt.y - clickPt.y);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}

function redrawDrawLayers(
  group: L.LayerGroup,
  points: L.LatLng[],
  closed: boolean
): void {
  group.clearLayers();
  for (const p of points) {
    L.circleMarker(p, {
      radius: 6,
      color: DRAW_COLOR,
      fillColor: DRAW_FILL,
      fillOpacity: 0.95,
      weight: 2,
      interactive: false,
    }).addTo(group);
  }
  if (points.length >= 2) {
    L.polyline(points, {
      color: DRAW_COLOR,
      weight: 3,
      dashArray: closed ? undefined : "8 5",
      interactive: false,
    }).addTo(group);
  }
  if (closed && points.length >= 3) {
    L.polygon(points, {
      color: DRAW_COLOR,
      fillColor: DRAW_FILL,
      fillOpacity: 0.2,
      weight: 2,
      interactive: false,
    }).addTo(group);
  } else if (!closed && points.length >= 3) {
    L.polygon(points, {
      color: DRAW_COLOR,
      fillColor: DRAW_FILL,
      fillOpacity: 0.08,
      weight: 1,
      dashArray: "4 4",
      interactive: false,
    }).addTo(group);
  }
}

function snapLatLng(
  map: L.Map,
  latlng: L.LatLng,
  layerVertices: LatLngPoint[],
  draftVertices: LatLngPoint[]
): L.LatLng {
  const best = findSnapVertex(
    map,
    latlng,
    layerVertices,
    draftVertices,
    DEFAULT_SNAP_PIXEL_TOLERANCE
  );
  return best ? L.latLng(best.lat, best.lng) : latlng;
}

export function WorkspaceMapDrawBidangController({
  map,
  active,
  snapEnabled,
  snapFootprints,
  onDraftChange,
  onRingClosed,
  closeRingSignal,
  undoPointSignal,
  clearDrawSignal,
}: Props) {
  const groupRef = useRef<L.LayerGroup | null>(null);
  const pointsRef = useRef<L.LatLng[]>([]);
  const closedRef = useRef(false);
  const snapVerticesRef = useRef<LatLngPoint[]>([]);
  const snapMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    snapVerticesRef.current = collectSnapVerticesFromFootprints(snapFootprints);
  }, [snapFootprints]);

  const clearSnapIndicator = useCallback(() => {
    if (snapMarkerRef.current) {
      snapMarkerRef.current.remove();
      snapMarkerRef.current = null;
    }
  }, []);

  const updateSnapIndicator = useCallback(
    (target: LatLngPoint | null) => {
      if (!map || !target) {
        clearSnapIndicator();
        return;
      }
      const latlng = L.latLng(target.lat, target.lng);
      const pane = ensureSnapPane(map);
      if (!snapMarkerRef.current) {
        snapMarkerRef.current = L.marker(latlng, {
          icon: SNAP_MARKER_ICON,
          interactive: false,
          keyboard: false,
          pane,
          zIndexOffset: 1000,
        }).addTo(map);
      } else {
        snapMarkerRef.current.setLatLng(latlng);
      }
    },
    [map, clearSnapIndicator]
  );

  const syncDraft = useCallback(() => {
    onDraftChange({
      pointCount: pointsRef.current.length,
      closed: closedRef.current,
    });
  }, [onDraftChange]);

  const clearDraw = useCallback(() => {
    pointsRef.current = [];
    closedRef.current = false;
    groupRef.current?.clearLayers();
    clearSnapIndicator();
    syncDraft();
  }, [syncDraft, clearSnapIndicator]);

  const emitClosedRing = useCallback(() => {
    const ring: LatLngPoint[] = pointsRef.current.map((p) => ({
      lat: p.lat,
      lng: p.lng,
    }));
    onRingClosed(ring);
  }, [onRingClosed]);

  useEffect(() => {
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    groupRef.current = group;
    return () => {
      group.remove();
      groupRef.current = null;
      pointsRef.current = [];
      closedRef.current = false;
      clearSnapIndicator();
    };
  }, [map, clearSnapIndicator]);

  useEffect(() => {
    if (!active) {
      clearDraw();
    }
  }, [active, clearDraw]);

  useEffect(() => {
    if (clearDrawSignal === 0) return;
    clearDraw();
  }, [clearDrawSignal, clearDraw]);

  useEffect(() => {
    if (undoPointSignal === 0 || closedRef.current) return;
    pointsRef.current = pointsRef.current.slice(0, -1);
    const group = groupRef.current;
    if (group) {
      redrawDrawLayers(group, pointsRef.current, false);
    }
    syncDraft();
  }, [undoPointSignal, syncDraft]);

  useEffect(() => {
    if (closeRingSignal === 0) return;
    if (pointsRef.current.length < 3 || closedRef.current) return;
    closedRef.current = true;
    clearSnapIndicator();
    const group = groupRef.current;
    if (group) {
      redrawDrawLayers(group, pointsRef.current, true);
    }
    syncDraft();
    emitClosedRing();
  }, [closeRingSignal, syncDraft, emitClosedRing, clearSnapIndicator]);

  useEffect(() => {
    if (!map || !active) return;

    const onClick = (e: L.LeafletMouseEvent) => {
      if (closedRef.current) return;
      L.DomEvent.stopPropagation(e);
      let latlng = e.latlng;
      if (snapEnabled) {
        const draftVerts = pointsRef.current.map((p) => ({
          lat: p.lat,
          lng: p.lng,
        }));
        latlng = snapLatLng(
          map,
          latlng,
          snapVerticesRef.current,
          draftVerts
        );
      }
      pointsRef.current.push(latlng);
      const group = groupRef.current;
      if (group) {
        redrawDrawLayers(group, pointsRef.current, false);
      }
      syncDraft();
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, active, snapEnabled, syncDraft]);

  useEffect(() => {
    if (!map || !active || !snapEnabled) {
      clearSnapIndicator();
      return;
    }

    const container = map.getContainer();

    const onMove = (e: MouseEvent) => {
      if (closedRef.current) {
        clearSnapIndicator();
        return;
      }
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        clearSnapIndicator();
        return;
      }
      const latlng = map.containerPointToLatLng(L.point(x, y));
      const draftVerts = pointsRef.current.map((p) => ({
        lat: p.lat,
        lng: p.lng,
      }));
      const target = findSnapVertex(
        map,
        latlng,
        snapVerticesRef.current,
        draftVerts,
        DEFAULT_SNAP_PIXEL_TOLERANCE
      );
      updateSnapIndicator(target);
    };

    container.addEventListener("mousemove", onMove);
    container.addEventListener("mouseleave", clearSnapIndicator);
    return () => {
      container.removeEventListener("mousemove", onMove);
      container.removeEventListener("mouseleave", clearSnapIndicator);
      clearSnapIndicator();
    };
  }, [
    map,
    active,
    snapEnabled,
    clearSnapIndicator,
    updateSnapIndicator,
  ]);

  useEffect(() => {
    if (!map) return;
    const el = map.getContainer();
    if (active) {
      el.style.cursor = "crosshair";
    }
    return () => {
      if (active) el.style.cursor = "";
    };
  }, [map, active]);

  return null;
}
