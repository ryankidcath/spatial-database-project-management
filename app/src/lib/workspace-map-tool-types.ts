import type { MapFootprintLayerKind } from "@/app/workspace-map";

export type WorkspaceMapToolMode =
  | "navigate"
  | "measure-line"
  | "measure-area"
  | "identify"
  | "draw-bidang"
  | "draw-garis";

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
