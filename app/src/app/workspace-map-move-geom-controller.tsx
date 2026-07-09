"use client";

import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import type { MapFootprint } from "./workspace-map";
import {
  collectSnapVerticesFromFootprints,
  DEFAULT_SNAP_PIXEL_TOLERANCE,
  type LatLngPoint,
} from "@/lib/workspace-map-draw-bidang";
import { pickVirtualTableFootprintAtPoint } from "@/lib/workspace-map-pick-footprint";
import { translateStoredGeometry } from "@/lib/workspace-map-translate-geom";
import type { MoveGeomSelection } from "@/lib/workspace-map-tool-types";

const PREVIEW_COLOR = "#c2410c";
const PREVIEW_FILL = "#ea580c";

type Props = {
  map: L.Map | null;
  active: boolean;
  footprints: MapFootprint[];
  snapEnabled: boolean;
  snapFootprints: MapFootprint[];
  selection: MoveGeomSelection | null;
  deltaLat: number;
  deltaLng: number;
  onSelect: (selection: MoveGeomSelection) => void;
  onDeltaChange: (deltaLat: number, deltaLng: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
};

function snapLatLng(
  map: L.Map,
  latlng: L.LatLng,
  vertices: LatLngPoint[]
): L.LatLng {
  if (vertices.length === 0) return latlng;
  const clickPt = map.latLngToContainerPoint(latlng);
  let best: LatLngPoint | null = null;
  let bestDist = DEFAULT_SNAP_PIXEL_TOLERANCE;
  for (const v of vertices) {
    const pt = map.latLngToContainerPoint(L.latLng(v.lat, v.lng));
    const d = Math.hypot(pt.x - clickPt.x, pt.y - clickPt.y);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best ? L.latLng(best.lat, best.lng) : latlng;
}

function selectionFromFootprint(fp: MapFootprint): MoveGeomSelection | null {
  if (!fp.virtualRowId || !fp.virtualTableId) return null;
  const parts = fp.id.split(":");
  const geometryColumnSlug =
    parts.length >= 3 && parts[0] === "vtable"
      ? parts.slice(2).join(":")
      : "geom";
  if (!geometryColumnSlug) return null;
  return {
    footprintId: fp.id,
    label: fp.label,
    virtualTableId: fp.virtualTableId,
    virtualRowId: fp.virtualRowId,
    geometryColumnSlug,
    originalGeojson: fp.geojson,
  };
}

export function WorkspaceMapMoveGeomController({
  map,
  active,
  footprints,
  snapEnabled,
  snapFootprints,
  selection,
  deltaLat,
  deltaLng,
  onSelect,
  onDeltaChange,
  onDragStart,
  onDragEnd,
}: Props) {
  const previewGroupRef = useRef<L.LayerGroup | null>(null);
  const draggingRef = useRef(false);
  const dragStartRef = useRef<L.LatLng | null>(null);
  const sessionBaseRef = useRef({ dLat: 0, dLng: 0 });
  const selectionRef = useRef(selection);
  const deltaRef = useRef({ dLat: deltaLat, dLng: deltaLng });

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    deltaRef.current = { dLat: deltaLat, dLng: deltaLng };
  }, [deltaLat, deltaLng]);

  const redrawPreview = useCallback(() => {
    const group = previewGroupRef.current;
    const sel = selectionRef.current;
    if (!group || !sel) return;
    group.clearLayers();
    const translated = translateStoredGeometry(
      sel.originalGeojson,
      deltaRef.current.dLng,
      deltaRef.current.dLat
    );
    if (!translated) return;
    try {
      L.geoJSON(translated as GeoJSON.GeoJsonObject, {
        style: {
          color: PREVIEW_COLOR,
          fillColor: PREVIEW_FILL,
          fillOpacity: 0.35,
          weight: 3,
          dashArray: "6 4",
        },
        pointToLayer: (_f, latlng) =>
          L.circleMarker(latlng, {
            radius: 7,
            color: PREVIEW_COLOR,
            fillColor: PREVIEW_FILL,
            fillOpacity: 0.9,
            weight: 2,
          }),
      }).addTo(group);
    } catch {
      /* invalid */
    }
  }, []);

  useEffect(() => {
    if (!map || !active) {
      previewGroupRef.current?.clearLayers();
      return;
    }
    if (!previewGroupRef.current) {
      previewGroupRef.current = L.layerGroup().addTo(map);
    }
    redrawPreview();
  }, [map, active, selection, deltaLat, deltaLng, redrawPreview]);

  useEffect(() => {
    redrawPreview();
  }, [deltaLat, deltaLng, selection, redrawPreview]);

  useEffect(() => {
    if (!map) return;
    if (!active) {
      draggingRef.current = false;
      dragStartRef.current = null;
      map.dragging.enable();
      return;
    }

    const snapVertices = () => {
      const excludeId = selectionRef.current?.footprintId;
      const refs = snapFootprints.filter((fp) => fp.id !== excludeId);
      return collectSnapVerticesFromFootprints(refs);
    };

    const onMapClick = (e: L.LeafletMouseEvent) => {
      if (draggingRef.current) return;
      if (!selectionRef.current) {
        const fp = pickVirtualTableFootprintAtPoint(
          footprints,
          e.latlng.lat,
          e.latlng.lng
        );
        if (!fp) return;
        const sel = selectionFromFootprint(fp);
        if (sel) {
          L.DomEvent.stopPropagation(e);
          onSelect(sel);
        }
        return;
      }
    };

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      if (!selectionRef.current) return;
      draggingRef.current = true;
      dragStartRef.current = e.latlng;
      sessionBaseRef.current = { ...deltaRef.current };
      map.dragging.disable();
      onDragStart?.();
      L.DomEvent.stopPropagation(e);
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!draggingRef.current || !dragStartRef.current) return;
      let current = e.latlng;
      if (snapEnabled) {
        current = snapLatLng(map, current, snapVertices());
      }
      const dLat =
        sessionBaseRef.current.dLat +
        (current.lat - dragStartRef.current.lat);
      const dLng =
        sessionBaseRef.current.dLng +
        (current.lng - dragStartRef.current.lng);
      onDeltaChange(dLat, dLng);
    };

    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      dragStartRef.current = null;
      map.dragging.enable();
      onDragEnd?.();
    };

    map.on("click", onMapClick);
    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);
    map.getContainer().style.cursor = selection ? "move" : "crosshair";

    return () => {
      map.off("click", onMapClick);
      map.off("mousedown", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUp);
      map.getContainer().style.cursor = "";
      map.dragging.enable();
      draggingRef.current = false;
    };
  }, [
    map,
    active,
    footprints,
    snapEnabled,
    snapFootprints,
    selection,
    onSelect,
    onDeltaChange,
    onDragStart,
    onDragEnd,
  ]);

  useEffect(() => {
    return () => {
      if (previewGroupRef.current && map) {
        map.removeLayer(previewGroupRef.current);
        previewGroupRef.current = null;
      }
    };
  }, [map]);

  return null;
}
