"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import L from "leaflet";
import { cn } from "@/lib/utils";
import {
  getWorkspaceBasemap,
  type WorkspaceBasemapId,
} from "@/lib/workspace-map-basemaps";

type Props = {
  map: L.Map | null;
  basemapId: WorkspaceBasemapId;
  className?: string;
  style?: CSSProperties;
};

export function WorkspaceMapMinimap({ map, basemapId, className, style }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const miniMapRef = useRef<L.Map | null>(null);
  const viewportRectRef = useRef<L.Rectangle | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    const host = containerRef.current;
    if (!map || !host) return;

    const basemap = getWorkspaceBasemap(basemapId);
    const mini = L.map(host, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    });

    L.tileLayer(basemap.url, {
      maxZoom: basemap.maxZoom,
    }).addTo(mini);

    const viewport = L.rectangle(map.getBounds(), {
      color: "#ea580c",
      weight: 2,
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(mini);
    viewportRectRef.current = viewport;
    miniMapRef.current = mini;

    const syncMiniFromMain = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      const b = map.getBounds();
      viewport.setBounds(b);
      mini.fitBounds(b.pad(0.35), { animate: false });
      syncingRef.current = false;
    };

    const onMiniClick = (e: L.LeafletMouseEvent) => {
      syncingRef.current = true;
      map.panTo(e.latlng, { animate: true });
      syncingRef.current = false;
    };

    map.on("moveend", syncMiniFromMain);
    map.on("zoomend", syncMiniFromMain);
    mini.on("click", onMiniClick);
    syncMiniFromMain();

    return () => {
      map.off("moveend", syncMiniFromMain);
      map.off("zoomend", syncMiniFromMain);
      mini.off("click", onMiniClick);
      mini.remove();
      miniMapRef.current = null;
      viewportRectRef.current = null;
    };
  }, [map, basemapId]);

  return (
    <div
      className={cn(
        "pointer-events-auto absolute bottom-10 right-2 z-[440] overflow-hidden rounded-md border border-border bg-background/95 shadow-md sm:bottom-9",
        className
      )}
      style={style}
      data-testid="workspace-map-minimap"
    >
      <p className="border-b border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        Overview
      </p>
      <div ref={containerRef} className="h-24 w-32 sm:h-28 sm:w-36" />
    </div>
  );
}
