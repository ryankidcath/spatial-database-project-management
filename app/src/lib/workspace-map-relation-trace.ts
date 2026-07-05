import type { MapFootprint } from "@/app/workspace-map";
import {
  footprintCentroid,
  footprintRowKey,
} from "@/lib/workspace-map-footprint-centroid";

export type RelationTraceEndpoint = {
  tableId: string;
  rowId: string;
  label: string;
};

export type RelationTraceTarget = RelationTraceEndpoint & {
  viaLabel?: string;
};

export type RelationTraceSegment = {
  id: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  label?: string;
};

function footprintPoint(
  footprints: MapFootprint[],
  tableId: string,
  rowId: string
): { lat: number; lng: number } | null {
  for (const fp of footprints) {
    if (
      fp.layerKind === "virtual_table" &&
      fp.virtualTableId === tableId &&
      fp.virtualRowId === rowId
    ) {
      return footprintCentroid(fp);
    }
  }
  return null;
}

export function buildRelationTraceSegments(args: {
  anchorTableId: string;
  anchorRowId: string;
  anchorEndpoints: RelationTraceEndpoint[];
  targets: RelationTraceTarget[];
  footprints: MapFootprint[];
}): RelationTraceSegment[] {
  const {
    anchorTableId,
    anchorRowId,
    anchorEndpoints,
    targets,
    footprints,
  } = args;

  const anchorKeys = new Set(
    anchorEndpoints.map((ep) => footprintRowKey(ep.tableId, ep.rowId))
  );
  anchorKeys.add(footprintRowKey(anchorTableId, anchorRowId));

  const anchorPoints: { lat: number; lng: number }[] = [];
  for (const ep of anchorEndpoints) {
    const p = footprintPoint(footprints, ep.tableId, ep.rowId);
    if (p) anchorPoints.push(p);
  }
  if (anchorPoints.length === 0) {
    const direct = footprintPoint(footprints, anchorTableId, anchorRowId);
    if (direct) anchorPoints.push(direct);
  }
  if (anchorPoints.length === 0) return [];

  const anchor = {
    lat:
      anchorPoints.reduce((sum, p) => sum + p.lat, 0) / anchorPoints.length,
    lng:
      anchorPoints.reduce((sum, p) => sum + p.lng, 0) / anchorPoints.length,
  };

  const segments: RelationTraceSegment[] = [];
  const seen = new Set<string>();

  for (const target of targets) {
    const key = footprintRowKey(target.tableId, target.rowId);
    if (anchorKeys.has(key)) continue;

    const to = footprintPoint(footprints, target.tableId, target.rowId);
    if (!to) continue;

    const segId = `${anchorRowId}->${target.rowId}`;
    if (seen.has(segId)) continue;
    seen.add(segId);

    segments.push({
      id: segId,
      from: anchor,
      to,
      label: target.viaLabel ?? target.label,
    });
  }

  return segments;
}
