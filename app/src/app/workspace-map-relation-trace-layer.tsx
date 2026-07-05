"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { RelationTraceSegment } from "@/lib/workspace-map-relation-trace";

type Props = {
  map: L.Map | null;
  segments: RelationTraceSegment[];
  enabled: boolean;
};

const TRACE_COLOR = "#ea580c";

export function WorkspaceMapRelationTraceLayer({
  map,
  segments,
  enabled,
}: Props) {
  const groupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!map) return;

    if (groupRef.current) {
      groupRef.current.remove();
      groupRef.current = null;
    }

    if (!enabled || segments.length === 0) return;

    const group = L.layerGroup().addTo(map);
    groupRef.current = group;

    for (const seg of segments) {
      const from = L.latLng(seg.from.lat, seg.from.lng);
      const to = L.latLng(seg.to.lat, seg.to.lng);

      L.polyline([from, to], {
        color: TRACE_COLOR,
        weight: 2.5,
        dashArray: "8 6",
        opacity: 0.88,
        lineCap: "round",
      }).addTo(group);

      L.circleMarker(from, {
        radius: 4,
        color: TRACE_COLOR,
        fillColor: "#fff7ed",
        fillOpacity: 1,
        weight: 2,
      }).addTo(group);

      L.circleMarker(to, {
        radius: 4,
        color: TRACE_COLOR,
        fillColor: TRACE_COLOR,
        fillOpacity: 0.85,
        weight: 2,
      }).addTo(group);

      if (seg.label) {
        const mid = L.latLng(
          (from.lat + to.lat) / 2,
          (from.lng + to.lng) / 2
        );
        L.circleMarker(mid, {
          radius: 0,
          opacity: 0,
          interactive: false,
        })
          .bindTooltip(seg.label, {
            permanent: false,
            direction: "top",
            className: "workspace-map-relation-trace-tip",
          })
          .addTo(group);
      }
    }

    return () => {
      group.remove();
      if (groupRef.current === group) {
        groupRef.current = null;
      }
    };
  }, [map, segments, enabled]);

  return null;
}
