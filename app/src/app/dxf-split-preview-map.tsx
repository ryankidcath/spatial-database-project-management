"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  DXF_SPLIT_TARGET_COLORS,
  DXF_SPLIT_TARGET_LABELS,
  type DxfSplitTargetKind,
} from "@/lib/dxf-split-import";

const DEFAULT_CENTER: L.LatLngExpression = [-6.74, 108.55];
const DEFAULT_ZOOM = 12;

function styleForTarget(
  target: DxfSplitTargetKind | undefined,
  highlighted: boolean
): L.PathOptions {
  const colors =
    (target && DXF_SPLIT_TARGET_COLORS[target]) ||
    DXF_SPLIT_TARGET_COLORS.bidang;
  if (highlighted) {
    return {
      color: "#c2410c",
      fillColor: "#ea580c",
      fillOpacity: 0.5,
      weight: 3,
    };
  }
  return {
    color: colors.stroke,
    fillColor: colors.fill,
    fillOpacity: target === "titik" ? 0 : 0.32,
    weight: 2,
  };
}

function pointStyleForTarget(
  target: DxfSplitTargetKind | undefined,
  highlighted: boolean
): L.CircleMarkerOptions {
  const colors =
    (target && DXF_SPLIT_TARGET_COLORS[target]) ||
    DXF_SPLIT_TARGET_COLORS.titik;
  if (highlighted) {
    return {
      radius: 7,
      color: "#c2410c",
      fillColor: "#ea580c",
      fillOpacity: 0.95,
      weight: 2,
    };
  }
  return {
    radius: 6,
    color: colors.stroke,
    fillColor: colors.fill,
    fillOpacity: 0.9,
    weight: 2,
  };
}

type Props = {
  featureCollection: GeoJSON.FeatureCollection | null;
  highlightRowId: string | null;
};

/** Pratinjau DXF split — warna berbeda per target tabel. */
export function DxfSplitPreviewMap({
  featureCollection,
  highlightRowId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);
  const highlightRef = useRef(highlightRowId);

  useEffect(() => {
    highlightRef.current = highlightRowId;
  }, [highlightRowId]);

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
        const props = feat?.properties as
          | { splitTarget?: DxfSplitTargetKind; splitRowId?: string }
          | undefined;
        const highlighted =
          !!highlightRef.current &&
          props?.splitRowId === highlightRef.current;
        return styleForTarget(props?.splitTarget, highlighted);
      },
      pointToLayer: (feature, latlng) => {
        const props = feature.properties as
          | { splitTarget?: DxfSplitTargetKind; splitRowId?: string }
          | undefined;
        const highlighted =
          !!highlightRef.current &&
          props?.splitRowId === highlightRef.current;
        return L.circleMarker(
          latlng,
          pointStyleForTarget(props?.splitTarget, highlighted)
        );
      },
    });

    geoLayerRef.current = layer;
    layer.addTo(map);
    const b = layer.getBounds();
    if (b.isValid()) {
      map.fitBounds(b, { padding: [18, 18], maxZoom: 18 });
    }
  }, [featureCollection]);

  useEffect(() => {
    const lyr = geoLayerRef.current;
    if (!lyr) return;
    lyr.eachLayer((sub) => {
      const feat = (sub as L.Layer & { feature?: GeoJSON.Feature }).feature;
      const props = feat?.properties as
        | { splitTarget?: DxfSplitTargetKind; splitRowId?: string }
        | undefined;
      const highlighted =
        !!highlightRowId && props?.splitRowId === highlightRowId;
      if (sub instanceof L.CircleMarker) {
        sub.setStyle(pointStyleForTarget(props?.splitTarget, highlighted));
      } else if (sub instanceof L.Path) {
        sub.setStyle(styleForTarget(props?.splitTarget, highlighted));
      }
    });
  }, [highlightRowId]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {(
          ["bidang", "jalan", "saluran", "titik"] as DxfSplitTargetKind[]
        ).map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <span
              className="inline-block size-2.5 rounded-full border"
              style={{
                backgroundColor: DXF_SPLIT_TARGET_COLORS[t].fill,
                borderColor: DXF_SPLIT_TARGET_COLORS[t].stroke,
              }}
            />
            {DXF_SPLIT_TARGET_LABELS[t]}
          </span>
        ))}
      </div>
      <div
        ref={containerRef}
        className="h-56 w-full min-h-[14rem] rounded-md border border-border bg-muted/30"
        role="presentation"
      />
    </div>
  );
}
