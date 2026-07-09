"use client";

import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import type { MapFootprint } from "./workspace-map";
import {
  collectSnapVerticesFromFootprints,
  DEFAULT_SNAP_PIXEL_TOLERANCE,
  type LatLngPoint,
} from "@/lib/workspace-map-draw-bidang";

export type DrawLineControllerState = {
  pointCount: number;
  finished: boolean;
};

type Props = {
  map: L.Map | null;
  active: boolean;
  snapEnabled: boolean;
  snapFootprints: MapFootprint[];
  onDraftChange: (state: DrawLineControllerState) => void;
  onLineFinished: (points: LatLngPoint[]) => void;
  finishLineSignal: number;
  undoPointSignal: number;
  clearDrawSignal: number;
};

const DRAW_COLOR = "#15803d";
const DRAW_FILL = "#22c55e";
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

function redrawLineLayers(group: L.LayerGroup, points: L.LatLng[]): void {
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
      weight: 4,
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

export function WorkspaceMapDrawLineController({
  map,
  active,
  snapEnabled,
  snapFootprints,
  onDraftChange,
  onLineFinished,
  finishLineSignal,
  undoPointSignal,
  clearDrawSignal,
}: Props) {
  const groupRef = useRef<L.LayerGroup | null>(null);
  const pointsRef = useRef<L.LatLng[]>([]);
  const finishedRef = useRef(false);
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
      finished: finishedRef.current,
    });
  }, [onDraftChange]);

  const clearDraw = useCallback(() => {
    pointsRef.current = [];
    finishedRef.current = false;
    groupRef.current?.clearLayers();
    clearSnapIndicator();
    syncDraft();
  }, [syncDraft, clearSnapIndicator]);

  const emitFinishedLine = useCallback(() => {
    const line: LatLngPoint[] = pointsRef.current.map((p) => ({
      lat: p.lat,
      lng: p.lng,
    }));
    onLineFinished(line);
  }, [onLineFinished]);

  useEffect(() => {
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    groupRef.current = group;
    return () => {
      group.remove();
      groupRef.current = null;
      pointsRef.current = [];
      finishedRef.current = false;
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
    if (undoPointSignal === 0 || finishedRef.current) return;
    pointsRef.current = pointsRef.current.slice(0, -1);
    const group = groupRef.current;
    if (group) {
      redrawLineLayers(group, pointsRef.current);
    }
    syncDraft();
  }, [undoPointSignal, syncDraft]);

  useEffect(() => {
    if (finishLineSignal === 0) return;
    if (pointsRef.current.length < 2 || finishedRef.current) return;
    finishedRef.current = true;
    clearSnapIndicator();
    const group = groupRef.current;
    if (group) {
      redrawLineLayers(group, pointsRef.current);
    }
    syncDraft();
    emitFinishedLine();
  }, [finishLineSignal, syncDraft, emitFinishedLine, clearSnapIndicator]);

  useEffect(() => {
    if (!map || !active) return;

    const onClick = (e: L.LeafletMouseEvent) => {
      if (finishedRef.current) return;
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
        redrawLineLayers(group, pointsRef.current);
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
      if (finishedRef.current) {
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
