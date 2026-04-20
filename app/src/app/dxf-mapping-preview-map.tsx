"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: L.LatLngExpression = [-6.74, 108.55];
const DEFAULT_ZOOM = 12;

function styleForIndex(
  idx: number | undefined,
  highlightIndex: number | null
): L.PathOptions {
  const on = idx != null && highlightIndex != null && idx === highlightIndex;
  if (on) {
    return {
      color: "#c2410c",
      fillColor: "#ea580c",
      fillOpacity: 0.48,
      weight: 3,
    };
  }
  return {
    color: "#1d4ed8",
    fillColor: "#60a5fa",
    fillOpacity: 0.32,
    weight: 2,
  };
}

type Props = {
  featureCollection: GeoJSON.FeatureCollection | null;
  highlightIndex: number | null;
  onSelectPolygon: (polygonIndex: number) => void;
};

/**
 * Peta OSM ringkas untuk pratinjau poligon DXF di dialog impor;
 * klik poligon memanggil `onSelectPolygon` dengan indeks 0-based.
 */
export function DxfMappingPreviewMap({
  featureCollection,
  highlightIndex,
  onSelectPolygon,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);
  const highlightRef = useRef(highlightIndex);

  useLayoutEffect(() => {
    highlightRef.current = highlightIndex;
  }, [highlightIndex]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, {
      zoomControl: true,
      scrollWheelZoom: true,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapRef.current = map;

    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      geoLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (geoLayerRef.current) {
      map.removeLayer(geoLayerRef.current);
      geoLayerRef.current = null;
    }

    if (!featureCollection || featureCollection.features.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    const layer = L.geoJSON(featureCollection, {
      style: (feat) => {
        const idx = (feat?.properties as { dxfPolygonIndex?: number } | undefined)
          ?.dxfPolygonIndex;
        return styleForIndex(idx, highlightRef.current);
      },
      onEachFeature: (feature, lyr) => {
        const idx = (feature.properties as { dxfPolygonIndex?: number } | undefined)
          ?.dxfPolygonIndex;
        if (typeof idx !== "number" || idx < 0) return;
        lyr.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectPolygon(idx);
        });
      },
    });

    geoLayerRef.current = layer;
    layer.addTo(map);
    const b = layer.getBounds();
    if (b.isValid()) {
      map.fitBounds(b, { padding: [18, 18], maxZoom: 18 });
    }
  }, [featureCollection, onSelectPolygon]);

  useEffect(() => {
    const lyr = geoLayerRef.current;
    if (!lyr) return;
    lyr.eachLayer((sub) => {
      const feat = (sub as L.Layer & { feature?: GeoJSON.Feature }).feature;
      const idx = (feat?.properties as { dxfPolygonIndex?: number } | undefined)
        ?.dxfPolygonIndex;
      if (typeof idx !== "number") return;
      (sub as L.Path).setStyle(styleForIndex(idx, highlightIndex));
    });
  }, [highlightIndex]);

  return (
    <div
      ref={containerRef}
      className="h-52 w-full min-h-[13rem] rounded-md border border-border bg-muted/30"
      role="presentation"
    />
  );
}
