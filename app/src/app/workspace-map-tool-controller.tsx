"use client";

import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import type { MapFootprint } from "./workspace-map";
import { identifyFootprintsAtPoint } from "@/lib/workspace-map-identify";
import {
  measureAreaFromLatLngs,
  measureLineFromLatLngs,
} from "@/lib/workspace-map-measure";
import type {
  MapIdentifyHit,
  MapMeasureResult,
  WorkspaceMapToolMode,
} from "@/lib/workspace-map-tool-types";

export type MeasureDraftState = {
  pointCount: number;
  liveResult: MapMeasureResult | null;
};

type Props = {
  map: L.Map | null;
  toolMode: WorkspaceMapToolMode;
  identifyFootprints: MapFootprint[];
  onIdentifyResults: (hits: MapIdentifyHit[], lat: number, lng: number) => void;
  onMeasureDraftChange: (draft: MeasureDraftState) => void;
  onMeasureFinished: (result: MapMeasureResult) => void;
  finishMeasureSignal: number;
  clearMeasureSignal: number;
};

function latLngPoints(pts: L.LatLng[]): Array<{ lat: number; lng: number }> {
  return pts.map((p) => ({ lat: p.lat, lng: p.lng }));
}

function redrawMeasureLayers(
  group: L.LayerGroup,
  points: L.LatLng[],
  toolMode: WorkspaceMapToolMode
): void {
  group.clearLayers();
  for (const p of points) {
    L.circleMarker(p, {
      radius: 5,
      color: "#1d4ed8",
      fillColor: "#3b82f6",
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(group);
  }
  if (points.length >= 2) {
    L.polyline(points, {
      color: "#1d4ed8",
      weight: 3,
      dashArray: toolMode === "measure-area" ? "6 4" : undefined,
    }).addTo(group);
  }
  if (toolMode === "measure-area" && points.length >= 3) {
    L.polygon(points, {
      color: "#1d4ed8",
      fillColor: "#3b82f6",
      fillOpacity: 0.15,
      weight: 2,
    }).addTo(group);
  }
}

export function WorkspaceMapToolController({
  map,
  toolMode,
  identifyFootprints,
  onIdentifyResults,
  onMeasureDraftChange,
  onMeasureFinished,
  finishMeasureSignal,
  clearMeasureSignal,
}: Props) {
  const measureGroupRef = useRef<L.LayerGroup | null>(null);
  const pointsRef = useRef<L.LatLng[]>([]);
  const toolModeRef = useRef(toolMode);
  toolModeRef.current = toolMode;

  const syncDraft = useCallback(() => {
    const pts = latLngPoints(pointsRef.current);
    const mode = toolModeRef.current;
    let liveResult: MapMeasureResult | null = null;
    if (mode === "measure-line") {
      liveResult = measureLineFromLatLngs(pts);
    } else if (mode === "measure-area") {
      liveResult = measureAreaFromLatLngs(pts);
    }
    onMeasureDraftChange({
      pointCount: pts.length,
      liveResult,
    });
  }, [onMeasureDraftChange]);

  const clearMeasure = useCallback(() => {
    pointsRef.current = [];
    measureGroupRef.current?.clearLayers();
    onMeasureDraftChange({ pointCount: 0, liveResult: null });
  }, [onMeasureDraftChange]);

  useEffect(() => {
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    measureGroupRef.current = group;
    return () => {
      group.remove();
      measureGroupRef.current = null;
      pointsRef.current = [];
    };
  }, [map]);

  useEffect(() => {
    clearMeasure();
  }, [toolMode, clearMeasure]);

  useEffect(() => {
    if (clearMeasureSignal === 0) return;
    clearMeasure();
  }, [clearMeasureSignal, clearMeasure]);

  useEffect(() => {
    if (finishMeasureSignal === 0) return;
    const mode = toolModeRef.current;
    const pts = latLngPoints(pointsRef.current);
    if (mode === "measure-line") {
      const result = measureLineFromLatLngs(pts);
      if (result) onMeasureFinished(result);
    } else if (mode === "measure-area") {
      const result = measureAreaFromLatLngs(pts);
      if (result) onMeasureFinished(result);
    }
  }, [finishMeasureSignal, onMeasureFinished]);

  useEffect(() => {
    if (!map) return;

    const onClick = (e: L.LeafletMouseEvent) => {
      const mode = toolModeRef.current;
      if (mode === "identify") {
        L.DomEvent.stopPropagation(e);
        const hits = identifyFootprintsAtPoint(
          identifyFootprints,
          e.latlng.lat,
          e.latlng.lng
        );
        onIdentifyResults(hits, e.latlng.lat, e.latlng.lng);
        return;
      }
      if (mode === "measure-line" || mode === "measure-area") {
        L.DomEvent.stopPropagation(e);
        pointsRef.current.push(e.latlng);
        const group = measureGroupRef.current;
        if (group) {
          redrawMeasureLayers(group, pointsRef.current, mode);
        }
        syncDraft();
      }
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, identifyFootprints, onIdentifyResults, syncDraft]);

  useEffect(() => {
    if (!map) return;
    const el = map.getContainer();
    if (toolMode === "navigate") {
      el.style.cursor = "";
    } else if (
      toolMode === "identify" ||
      toolMode === "draw-bidang" ||
      toolMode === "draw-garis"
    ) {
      el.style.cursor = "crosshair";
    } else {
      el.style.cursor = "cell";
    }
    return () => {
      el.style.cursor = "";
    };
  }, [map, toolMode]);

  return null;
}
