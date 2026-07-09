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
import {
  applyMoveGeomTransform,
  centroidOfStoredGeometry,
} from "@/lib/workspace-map-transform-geom";
import { translateStoredGeometry } from "@/lib/workspace-map-translate-geom";
import {
  resolveVertexHandlePositions,
  type MoveGeomVertexEdits,
} from "@/lib/workspace-map-vertex-edit-geom";
import type {
  MoveGeomEditSubMode,
  MoveGeomSelection,
} from "@/lib/workspace-map-tool-types";

const PREVIEW_COLOR = "#c2410c";
const PREVIEW_FILL = "#ea580c";
const ROTATE_HANDLE_COLOR = "#1d4ed8";
const PIVOT_COLOR = "#64748b";
const VERTEX_HANDLE_COLOR = "#059669";
const ROTATE_HANDLE_HIT_PX = 14;
const VERTEX_HANDLE_HIT_PX = 12;
const ROTATE_HANDLE_OFFSET_PX = 44;

type Props = {
  map: L.Map | null;
  active: boolean;
  footprints: MapFootprint[];
  snapEnabled: boolean;
  snapFootprints: MapFootprint[];
  selection: MoveGeomSelection | null;
  editSubMode: MoveGeomEditSubMode;
  deltaLat: number;
  deltaLng: number;
  rotationDeg: number;
  vertexEdits: MoveGeomVertexEdits;
  rotationSupported: boolean;
  vertexEditSupported: boolean;
  onSelect: (selection: MoveGeomSelection) => void;
  onDeltaChange: (deltaLat: number, deltaLng: number) => void;
  onRotationChange: (rotationDeg: number) => void;
  onVertexEditChange: (index: number, lat: number, lng: number) => void;
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

function angleDegFromPivot(
  map: L.Map,
  pivot: L.LatLng,
  point: L.LatLng
): number {
  const p = map.latLngToContainerPoint(pivot);
  const t = map.latLngToContainerPoint(point);
  return (Math.atan2(t.y - p.y, t.x - p.x) * 180) / Math.PI;
}

function handleLatLngForRotation(
  map: L.Map,
  pivot: L.LatLng,
  rotationDeg: number
): L.LatLng {
  const p = map.latLngToContainerPoint(pivot);
  const rad = ((rotationDeg - 90) * Math.PI) / 180;
  const hx = p.x + ROTATE_HANDLE_OFFSET_PX * Math.cos(rad);
  const hy = p.y + ROTATE_HANDLE_OFFSET_PX * Math.sin(rad);
  return map.containerPointToLatLng(L.point(hx, hy));
}

function pivotLatLng(
  selection: MoveGeomSelection,
  deltaLng: number,
  deltaLat: number
): L.LatLng | null {
  const translated = translateStoredGeometry(
    selection.originalGeojson,
    deltaLng,
    deltaLat
  );
  if (!translated) return null;
  const pivot = centroidOfStoredGeometry(translated);
  if (!pivot) return null;
  return L.latLng(pivot[1]!, pivot[0]!);
}

function baseGeometryAfterTranslateRotate(
  selection: MoveGeomSelection,
  deltaLng: number,
  deltaLat: number,
  rotationDeg: number
): unknown | null {
  return applyMoveGeomTransform(selection.originalGeojson, {
    deltaLng,
    deltaLat,
    rotationDeg,
    vertexEdits: {},
  });
}

export function WorkspaceMapMoveGeomController({
  map,
  active,
  footprints,
  snapEnabled,
  snapFootprints,
  selection,
  editSubMode,
  deltaLat,
  deltaLng,
  rotationDeg,
  vertexEdits,
  rotationSupported,
  vertexEditSupported,
  onSelect,
  onDeltaChange,
  onRotationChange,
  onVertexEditChange,
  onDragStart,
  onDragEnd,
}: Props) {
  const previewGroupRef = useRef<L.LayerGroup | null>(null);
  const handlesGroupRef = useRef<L.LayerGroup | null>(null);
  const translateDraggingRef = useRef(false);
  const rotateDraggingRef = useRef(false);
  const vertexDraggingRef = useRef(false);
  const draggedVertexIndexRef = useRef<number | null>(null);
  const dragStartRef = useRef<L.LatLng | null>(null);
  const sessionBaseRef = useRef({ dLat: 0, dLng: 0 });
  const sessionBaseRotationRef = useRef(0);
  const startAngleRef = useRef(0);
  const selectionRef = useRef(selection);
  const deltaRef = useRef({ dLat: deltaLat, dLng: deltaLng });
  const rotationRef = useRef(rotationDeg);
  const vertexEditsRef = useRef(vertexEdits);
  const subModeRef = useRef(editSubMode);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    deltaRef.current = { dLat: deltaLat, dLng: deltaLng };
  }, [deltaLat, deltaLng]);

  useEffect(() => {
    rotationRef.current = rotationDeg;
  }, [rotationDeg]);

  useEffect(() => {
    vertexEditsRef.current = vertexEdits;
  }, [vertexEdits]);

  useEffect(() => {
    subModeRef.current = editSubMode;
  }, [editSubMode]);

  const currentTransform = useCallback(
    () => ({
      deltaLng: deltaRef.current.dLng,
      deltaLat: deltaRef.current.dLat,
      rotationDeg: rotationRef.current,
      vertexEdits: vertexEditsRef.current,
    }),
    []
  );

  const redrawPreview = useCallback(() => {
    const group = previewGroupRef.current;
    const sel = selectionRef.current;
    if (!group || !sel) return;
    group.clearLayers();
    const transformed = applyMoveGeomTransform(
      sel.originalGeojson,
      currentTransform()
    );
    if (!transformed) return;
    try {
      L.geoJSON(transformed as GeoJSON.GeoJsonObject, {
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
  }, [currentTransform]);

  const redrawHandles = useCallback(() => {
    const group = handlesGroupRef.current;
    const sel = selectionRef.current;
    if (!group || !map || !sel) return;
    group.clearLayers();

    if (subModeRef.current === "rotate" && rotationSupported) {
      const pivot = pivotLatLng(
        sel,
        deltaRef.current.dLng,
        deltaRef.current.dLat
      );
      if (!pivot) return;

      L.circleMarker(pivot, {
        radius: 5,
        color: PIVOT_COLOR,
        fillColor: "#f8fafc",
        fillOpacity: 1,
        weight: 2,
      }).addTo(group);

      const handle = handleLatLngForRotation(
        map,
        pivot,
        rotationRef.current
      );
      L.circleMarker(handle, {
        radius: 8,
        color: ROTATE_HANDLE_COLOR,
        fillColor: "#93c5fd",
        fillOpacity: 0.95,
        weight: 2,
      }).addTo(group);

      L.polyline([pivot, handle], {
        color: ROTATE_HANDLE_COLOR,
        weight: 1,
        dashArray: "3 3",
        interactive: false,
      }).addTo(group);
      return;
    }

    if (subModeRef.current === "vertex" && vertexEditSupported) {
      const base = baseGeometryAfterTranslateRotate(
        sel,
        deltaRef.current.dLng,
        deltaRef.current.dLat,
        rotationRef.current
      );
      if (!base) return;
      const handles = resolveVertexHandlePositions(
        sel.originalGeojson,
        base,
        vertexEditsRef.current
      );
      for (const v of handles) {
        L.circleMarker([v.lat, v.lng], {
          radius: 6,
          color: VERTEX_HANDLE_COLOR,
          fillColor: "#6ee7b7",
          fillOpacity: 0.95,
          weight: 2,
        }).addTo(group);
      }
    }
  }, [map, rotationSupported, vertexEditSupported]);

  const redrawAll = useCallback(() => {
    redrawPreview();
    redrawHandles();
  }, [redrawPreview, redrawHandles]);

  useEffect(() => {
    if (!map || !active) {
      previewGroupRef.current?.clearLayers();
      handlesGroupRef.current?.clearLayers();
      return;
    }
    if (!previewGroupRef.current) {
      previewGroupRef.current = L.layerGroup().addTo(map);
    }
    if (!handlesGroupRef.current) {
      handlesGroupRef.current = L.layerGroup().addTo(map);
    }
    redrawAll();
  }, [
    map,
    active,
    selection,
    deltaLat,
    deltaLng,
    rotationDeg,
    vertexEdits,
    editSubMode,
    redrawAll,
  ]);

  useEffect(() => {
    redrawAll();
  }, [
    deltaLat,
    deltaLng,
    rotationDeg,
    vertexEdits,
    selection,
    editSubMode,
    redrawAll,
  ]);

  useEffect(() => {
    if (!map || !active) return;
    const onViewChange = () => redrawHandles();
    map.on("move", onViewChange);
    map.on("zoom", onViewChange);
    return () => {
      map.off("move", onViewChange);
      map.off("zoom", onViewChange);
    };
  }, [map, active, redrawHandles]);

  useEffect(() => {
    if (!map) return;
    if (!active) {
      translateDraggingRef.current = false;
      rotateDraggingRef.current = false;
      vertexDraggingRef.current = false;
      draggedVertexIndexRef.current = null;
      dragStartRef.current = null;
      map.dragging.enable();
      return;
    }

    const snapVertices = () => {
      const excludeId = selectionRef.current?.footprintId;
      const refs = snapFootprints.filter((fp) => fp.id !== excludeId);
      return collectSnapVerticesFromFootprints(refs);
    };

    const vertexHandles = (): Array<{
      index: number;
      lat: number;
      lng: number;
    }> => {
      const sel = selectionRef.current;
      if (!sel) return [];
      const base = baseGeometryAfterTranslateRotate(
        sel,
        deltaRef.current.dLng,
        deltaRef.current.dLat,
        rotationRef.current
      );
      if (!base) return [];
      return resolveVertexHandlePositions(
        sel.originalGeojson,
        base,
        vertexEditsRef.current
      );
    };

    const findVertexHandleIndex = (latlng: L.LatLng): number | null => {
      const clickPt = map.latLngToContainerPoint(latlng);
      let bestIndex: number | null = null;
      let bestDist = VERTEX_HANDLE_HIT_PX;
      for (const v of vertexHandles()) {
        const pt = map.latLngToContainerPoint(L.latLng(v.lat, v.lng));
        const d = Math.hypot(pt.x - clickPt.x, pt.y - clickPt.y);
        if (d < bestDist) {
          bestDist = d;
          bestIndex = v.index;
        }
      }
      return bestIndex;
    };

    const isNearRotationHandle = (latlng: L.LatLng): boolean => {
      const sel = selectionRef.current;
      if (!sel || !rotationSupported) return false;
      const pivot = pivotLatLng(
        sel,
        deltaRef.current.dLng,
        deltaRef.current.dLat
      );
      if (!pivot) return false;
      const handle = handleLatLngForRotation(
        map,
        pivot,
        rotationRef.current
      );
      const clickPt = map.latLngToContainerPoint(latlng);
      const handlePt = map.latLngToContainerPoint(handle);
      return (
        Math.hypot(clickPt.x - handlePt.x, clickPt.y - handlePt.y) <
        ROTATE_HANDLE_HIT_PX
      );
    };

    const onMapClick = (e: L.LeafletMouseEvent) => {
      if (
        translateDraggingRef.current ||
        rotateDraggingRef.current ||
        vertexDraggingRef.current
      ) {
        return;
      }
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
      }
    };

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      const sel = selectionRef.current;
      if (!sel) return;

      if (
        subModeRef.current === "vertex" &&
        vertexEditSupported
      ) {
        const index = findVertexHandleIndex(e.latlng);
        if (index == null) return;
        vertexDraggingRef.current = true;
        draggedVertexIndexRef.current = index;
        map.dragging.disable();
        onDragStart?.();
        L.DomEvent.stopPropagation(e);
        return;
      }

      if (
        subModeRef.current === "rotate" &&
        rotationSupported &&
        isNearRotationHandle(e.latlng)
      ) {
        const pivot = pivotLatLng(
          sel,
          deltaRef.current.dLng,
          deltaRef.current.dLat
        );
        if (!pivot) return;
        rotateDraggingRef.current = true;
        dragStartRef.current = e.latlng;
        sessionBaseRotationRef.current = rotationRef.current;
        startAngleRef.current = angleDegFromPivot(map, pivot, e.latlng);
        map.dragging.disable();
        onDragStart?.();
        L.DomEvent.stopPropagation(e);
        return;
      }

      if (subModeRef.current !== "translate") return;

      translateDraggingRef.current = true;
      dragStartRef.current = e.latlng;
      sessionBaseRef.current = { ...deltaRef.current };
      map.dragging.disable();
      onDragStart?.();
      L.DomEvent.stopPropagation(e);
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (vertexDraggingRef.current) {
        const index = draggedVertexIndexRef.current;
        if (index == null) return;
        let current = e.latlng;
        if (snapEnabled) {
          current = snapLatLng(map, current, snapVertices());
        }
        onVertexEditChange(index, current.lat, current.lng);
        return;
      }

      if (rotateDraggingRef.current && dragStartRef.current) {
        const sel = selectionRef.current;
        if (!sel) return;
        const pivot = pivotLatLng(
          sel,
          deltaRef.current.dLng,
          deltaRef.current.dLat
        );
        if (!pivot) return;
        const currentAngle = angleDegFromPivot(map, pivot, e.latlng);
        const deltaAngle = currentAngle - startAngleRef.current;
        onRotationChange(sessionBaseRotationRef.current + deltaAngle);
        return;
      }

      if (!translateDraggingRef.current || !dragStartRef.current) return;
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
      if (
        !translateDraggingRef.current &&
        !rotateDraggingRef.current &&
        !vertexDraggingRef.current
      ) {
        return;
      }
      translateDraggingRef.current = false;
      rotateDraggingRef.current = false;
      vertexDraggingRef.current = false;
      draggedVertexIndexRef.current = null;
      dragStartRef.current = null;
      map.dragging.enable();
      onDragEnd?.();
    };

    map.on("click", onMapClick);
    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);

    const cursor = !selection
      ? "crosshair"
      : subModeRef.current === "vertex" && vertexEditSupported
        ? "pointer"
        : subModeRef.current === "rotate" && rotationSupported
          ? "grab"
          : subModeRef.current === "translate"
            ? "move"
            : "default";
    map.getContainer().style.cursor = cursor;

    return () => {
      map.off("click", onMapClick);
      map.off("mousedown", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUp);
      map.getContainer().style.cursor = "";
      map.dragging.enable();
      translateDraggingRef.current = false;
      rotateDraggingRef.current = false;
      vertexDraggingRef.current = false;
    };
  }, [
    map,
    active,
    footprints,
    snapEnabled,
    snapFootprints,
    selection,
    rotationSupported,
    vertexEditSupported,
    editSubMode,
    onSelect,
    onDeltaChange,
    onRotationChange,
    onVertexEditChange,
    onDragStart,
    onDragEnd,
  ]);

  useEffect(() => {
    return () => {
      if (previewGroupRef.current && map) {
        map.removeLayer(previewGroupRef.current);
        previewGroupRef.current = null;
      }
      if (handlesGroupRef.current && map) {
        map.removeLayer(handlesGroupRef.current);
        handlesGroupRef.current = null;
      }
    };
  }, [map]);

  return null;
}
