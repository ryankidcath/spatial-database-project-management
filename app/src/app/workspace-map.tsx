"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapFootprintLayerKind = "demo" | "bidang_hasil_ukur";

export type MapFootprint = {
  id: string;
  label: string;
  geojson: unknown;
  /** Default `demo` — warna stroke/fill berbeda untuk hasil ukur PLM. */
  layerKind?: MapFootprintLayerKind;
  /** Hanya `bidang_hasil_ukur` — untuk sorotan berkas di peta (F4-3). */
  berkasId?: string;
};

const DEFAULT_CENTER: L.LatLngExpression = [-6.74, 108.55];
const DEFAULT_ZOOM = 12;

function escapePopupText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function polygonStyle(
  feature: GeoJSON.Feature | undefined,
  layerKind: MapFootprintLayerKind,
  isHighlight: boolean
): L.PathOptions {
  if (isHighlight) {
    return {
      color: "#c2410c",
      fillColor: "#ea580c",
      fillOpacity: 0.44,
      weight: 4,
    };
  }
  const props = feature?.properties as Record<string, unknown> | undefined;
  const defaultStroke = layerKind === "bidang_hasil_ukur" ? "#047857" : "#2563eb";
  const defaultFill = layerKind === "bidang_hasil_ukur" ? "#10b981" : "#3b82f6";
  const stroke =
    typeof props?.stroke === "string" ? props.stroke : defaultStroke;
  let fillColor =
    typeof props?.fill === "string" ? props.fill : defaultFill;
  let fillOpacity = 0.35;
  if (/^#[0-9a-fA-F]{8}$/.test(fillColor)) {
    fillOpacity = parseInt(fillColor.slice(7, 9), 16) / 255;
    fillColor = fillColor.slice(0, 7);
  }
  return {
    color: stroke,
    fillColor,
    fillOpacity,
    weight: 2,
  };
}

export function WorkspaceMap({
  footprints,
  highlightBerkasId = null,
}: {
  footprints: MapFootprint[];
  /** Sorot poligon hasil ukur yang terikat `berkas_id` ini. */
  highlightBerkasId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

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

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (footprints.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    const fg = L.featureGroup();
    for (const fp of footprints) {
      if (!fp.geojson || typeof fp.geojson !== "object") continue;
      const layerKind = fp.layerKind ?? "demo";
      const isHighlight =
        layerKind === "bidang_hasil_ukur" &&
        highlightBerkasId != null &&
        highlightBerkasId !== "" &&
        fp.berkasId === highlightBerkasId;
      try {
        const layer = L.geoJSON(fp.geojson as GeoJSON.GeoJsonObject, {
          style: (feat) =>
            polygonStyle(
              feat as GeoJSON.Feature | undefined,
              layerKind,
              isHighlight
            ),
        });
        const popup =
          layerKind === "bidang_hasil_ukur"
            ? `${fp.label} (hasil ukur PLM)`
            : fp.label;
        layer.bindPopup(escapePopupText(popup));
        fg.addLayer(layer);
      } catch {
        /* invalid GeoJSON — skip */
      }
    }

    fg.addTo(group);
    const b = fg.getBounds();
    if (b.isValid()) {
      map.fitBounds(b, { padding: [28, 28], maxZoom: 16 });
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  }, [footprints, highlightBerkasId]);

  return (
    <div
      ref={containerRef}
      className="h-[min(70vh,560px)] w-full rounded-md border border-slate-200 bg-slate-100"
      role="presentation"
    />
  );
}
