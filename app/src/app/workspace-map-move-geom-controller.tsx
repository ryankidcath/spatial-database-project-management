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

const NON_INTERACTIVE_MARKER: L.CircleMarkerOptions = {
  interactive: false,
  bubblingMouseEvents: false,
};

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

function latLngFromClient(
  map: L.Map,
  clientX: number,
  clientY: number
): L.LatLng {
  const container = map.getContainer();
  const rect = container.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return map.containerPointToLatLng(L.point(x, y));
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
  const detachDocumentDragRef = useRef<(() => void) | null>(null);

  const selectionRef = useRef(selection);
  const deltaRef = useRef({ dLat: deltaLat, dLng: deltaLng });
  const rotationRef = useRef(rotationDeg);
  const vertexEditsRef = useRef(vertexEdits);
  const subModeRef = useRef(editSubMode);
  const footprintsRef = useRef(footprints);
  const snapFootprintsRef = useRef(snapFootprints);
  const snapEnabledRef = useRef(snapEnabled);
  const rotationSupportedRef = useRef(rotationSupported);
  const vertexEditSupportedRef = useRef(vertexEditSupported);
  const onSelectRef = useRef(onSelect);
  const onDeltaChangeRef = useRef(onDeltaChange);
  const onRotationChangeRef = useRef(onRotationChange);
  const onVertexEditChangeRef = useRef(onVertexEditChange);
  const onDragStartRef = useRef(onDragStart);
  const onDragEndRef = useRef(onDragEnd);

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
  useEffect(() => {
    footprintsRef.current = footprints;
  }, [footprints]);
  useEffect(() => {
    snapFootprintsRef.current = snapFootprints;
  }, [snapFootprints]);
  useEffect(() => {
    snapEnabledRef.current = snapEnabled;
  }, [snapEnabled]);
  useEffect(() => {
    rotationSupportedRef.current = rotationSupported;
  }, [rotationSupported]);
  useEffect(() => {
    vertexEditSupportedRef.current = vertexEditSupported;
  }, [vertexEditSupported]);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    onDeltaChangeRef.current = onDeltaChange;
  }, [onDeltaChange]);
  useEffect(() => {
    onRotationChangeRef.current = onRotationChange;
  }, [onRotationChange]);
  useEffect(() => {
    onVertexEditChangeRef.current = onVertexEditChange;
  }, [onVertexEditChange]);
  useEffect(() => {
    onDragStartRef.current = onDragStart;
  }, [onDragStart]);
  useEffect(() => {
    onDragEndRef.current = onDragEnd;
  }, [onDragEnd]);

  const detachDocumentListeners = useCallback(() => {
    detachDocumentDragRef.current?.();
    detachDocumentDragRef.current = null;
  }, []);

  const endDragSession = useCallback(() => {
    detachDocumentListeners();
    const wasDragging =
      translateDraggingRef.current ||
      rotateDraggingRef.current ||
      vertexDraggingRef.current;
    translateDraggingRef.current = false;
    rotateDraggingRef.current = false;
    vertexDraggingRef.current = false;
    draggedVertexIndexRef.current = null;
    dragStartRef.current = null;
    map?.dragging.enable();
    if (wasDragging) {
      onDragEndRef.current?.();
    }
  }, [map, detachDocumentListeners]);

  const beginDocumentDrag = useCallback(
    (onDocumentMove: (e: MouseEvent) => void) => {
      detachDocumentListeners();
      const onDocumentUp = () => endDragSession();
      document.addEventListener("mousemove", onDocumentMove);
      document.addEventListener("mouseup", onDocumentUp);
      detachDocumentDragRef.current = () => {
        document.removeEventListener("mousemove", onDocumentMove);
        document.removeEventListener("mouseup", onDocumentUp);
      };
    },
    [detachDocumentListeners, endDragSession]
  );

  const currentTransform = useCallback(
    () => ({
      deltaLng: deltaRef.current.dLng,
      deltaLat: deltaRef.current.dLat,
      rotationDeg: rotationRef.current,
      vertexEdits: vertexEditsRef.current,
    }),
    []
  );

  const snapVertices = useCallback(() => {
    const excludeId = selectionRef.current?.footprintId;
    const refs = snapFootprintsRef.current.filter(
      (fp) => fp.id !== excludeId
    );
    return collectSnapVerticesFromFootprints(refs);
  }, []);

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
        interactive: false,
        style: {
          color: PREVIEW_COLOR,
          fillColor: PREVIEW_FILL,
          fillOpacity: 0.35,
          weight: 3,
          dashArray: "6 4",
        },
        pointToLayer: (_f, latlng) =>
          L.circleMarker(latlng, {
            ...NON_INTERACTIVE_MARKER,
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

    if (subModeRef.current === "rotate" && rotationSupportedRef.current) {
      const pivot = pivotLatLng(
        sel,
        deltaRef.current.dLng,
        deltaRef.current.dLat
      );
      if (!pivot) return;

      L.circleMarker(pivot, {
        ...NON_INTERACTIVE_MARKER,
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
        ...NON_INTERACTIVE_MARKER,
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

    if (subModeRef.current === "vertex" && vertexEditSupportedRef.current) {
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
          ...NON_INTERACTIVE_MARKER,
          radius: 6,
          color: VERTEX_HANDLE_COLOR,
          fillColor: "#6ee7b7",
          fillOpacity: 0.95,
          weight: 2,
        }).addTo(group);
      }
    }
  }, [map]);

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
      endDragSession();
      return;
    }

    const vertexHandles = () => {
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
      if (!sel || !rotationSupportedRef.current) return false;
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

    const applyDragAtLatLng = (latlng: L.LatLng) => {
      if (vertexDraggingRef.current) {
        const index = draggedVertexIndexRef.current;
        if (index == null) return;
        let current = latlng;
        if (snapEnabledRef.current) {
          current = snapLatLng(map, current, snapVertices());
        }
        onVertexEditChangeRef.current(index, current.lat, current.lng);
        return;
      }

      if (rotateDraggingRef.current) {
        const sel = selectionRef.current;
        if (!sel) return;
        const pivot = pivotLatLng(
          sel,
          deltaRef.current.dLng,
          deltaRef.current.dLat
        );
        if (!pivot) return;
        const currentAngle = angleDegFromPivot(map, pivot, latlng);
        const deltaAngle = currentAngle - startAngleRef.current;
        onRotationChangeRef.current(
          sessionBaseRotationRef.current + deltaAngle
        );
        return;
      }

      if (!translateDraggingRef.current || !dragStartRef.current) return;
      let current = latlng;
      if (snapEnabledRef.current) {
        current = snapLatLng(map, current, snapVertices());
      }
      const dLat =
        sessionBaseRef.current.dLat +
        (current.lat - dragStartRef.current.lat);
      const dLng =
        sessionBaseRef.current.dLng +
        (current.lng - dragStartRef.current.lng);
      onDeltaChangeRef.current(dLat, dLng);
    };

    const onDocumentMove = (e: MouseEvent) => {
      if (
        !translateDraggingRef.current &&
        !rotateDraggingRef.current &&
        !vertexDraggingRef.current
      ) {
        return;
      }
      applyDragAtLatLng(latLngFromClient(map, e.clientX, e.clientY));
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
          footprintsRef.current,
          e.latlng.lat,
          e.latlng.lng
        );
        if (!fp) return;
        const sel = selectionFromFootprint(fp);
        if (sel) {
          L.DomEvent.stopPropagation(e);
          onSelectRef.current(sel);
        }
      }
    };

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      const sel = selectionRef.current;
      if (!sel) return;

      if (
        subModeRef.current === "vertex" &&
        vertexEditSupportedRef.current
      ) {
        const index = findVertexHandleIndex(e.latlng);
        if (index == null) return;
        vertexDraggingRef.current = true;
        draggedVertexIndexRef.current = index;
        map.dragging.disable();
        onDragStartRef.current?.();
        beginDocumentDrag(onDocumentMove);
        L.DomEvent.stopPropagation(e);
        if (e.originalEvent) {
          L.DomEvent.preventDefault(e.originalEvent);
        }
        return;
      }

      if (
        subModeRef.current === "rotate" &&
        rotationSupportedRef.current &&
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
        onDragStartRef.current?.();
        beginDocumentDrag(onDocumentMove);
        L.DomEvent.stopPropagation(e);
        if (e.originalEvent) {
          L.DomEvent.preventDefault(e.originalEvent);
        }
        return;
      }

      if (subModeRef.current !== "translate") return;

      translateDraggingRef.current = true;
      dragStartRef.current = e.latlng;
      sessionBaseRef.current = { ...deltaRef.current };
      map.dragging.disable();
      onDragStartRef.current?.();
      beginDocumentDrag(onDocumentMove);
      L.DomEvent.stopPropagation(e);
      if (e.originalEvent) {
        L.DomEvent.preventDefault(e.originalEvent);
      }
    };

    map.on("click", onMapClick);
    map.on("mousedown", onMouseDown);

    const cursor = !selectionRef.current
      ? "crosshair"
      : subModeRef.current === "vertex" && vertexEditSupportedRef.current
        ? "pointer"
        : subModeRef.current === "rotate" && rotationSupportedRef.current
          ? "grab"
          : subModeRef.current === "translate"
            ? "move"
            : "default";
    map.getContainer().style.cursor = cursor;

    return () => {
      map.off("click", onMapClick);
      map.off("mousedown", onMouseDown);
      endDragSession();
      map.getContainer().style.cursor = "";
    };
  }, [map, active, beginDocumentDrag, endDragSession, snapVertices, selection, editSubMode]);

  useEffect(() => {
    return () => {
      endDragSession();
      if (previewGroupRef.current && map) {
        map.removeLayer(previewGroupRef.current);
        previewGroupRef.current = null;
      }
      if (handlesGroupRef.current && map) {
        map.removeLayer(handlesGroupRef.current);
        handlesGroupRef.current = null;
      }
    };
  }, [map, endDragSession]);

  return null;
}
