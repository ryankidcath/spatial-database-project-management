import type { MapFootprintLayerKind } from "@/app/workspace-map";
import type { MoveGeomVertexEdits } from "@/lib/workspace-map-vertex-edit-geom";

export type WorkspaceMapToolMode =
  | "navigate"
  | "measure-line"
  | "measure-area"
  | "identify"
  | "draw-bidang"
  | "draw-garis"
  | "move-geom";

export type MoveGeomSelection = {
  footprintId: string;
  label: string;
  virtualTableId: string;
  virtualRowId: string;
  geometryColumnSlug: string;
  originalGeojson: unknown;
};

export type MoveGeomEditSubMode = "translate" | "rotate" | "vertex";

export type MoveGeomDraftState = {
  selection: MoveGeomSelection | null;
  deltaLat: number;
  deltaLng: number;
  rotationDeg: number;
  /** null = pusat geometri; angka = indeks vertex/sudut sebagai sumbu putar */
  rotationPivotVertexIndex: number | null;
  vertexEdits: MoveGeomVertexEdits;
  subMode: MoveGeomEditSubMode;
};

export type DrawBidangDraftState = {
  pointCount: number;
  closed: boolean;
};

export type DrawLineDraftState = {
  pointCount: number;
  finished: boolean;
};

export type MapIdentifyHit = {
  footprintId: string;
  label: string;
  layerKind: MapFootprintLayerKind;
  virtualTableId?: string;
  virtualRowId?: string;
  properties: Record<string, unknown>;
};

export type MapMeasureResult = {
  kind: "line" | "area";
  /** Panjang (m) atau luas (m²). */
  squareMeters: number;
  pointCount: number;
};

export type CoordinateDisplayMode = "latlng" | "utm";
