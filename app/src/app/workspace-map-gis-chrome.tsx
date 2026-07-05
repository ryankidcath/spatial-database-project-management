"use client";

import {
  formatLatLng,
  formatMapScale,
  formatUtm,
} from "@/lib/workspace-map-coordinates";
import { cn } from "@/lib/utils";

export type MapStatusState = {
  lat: number;
  lng: number;
  zoom: number;
  hasPointer: boolean;
};

type StatusBarProps = {
  state: MapStatusState;
  coordinateDisplay?: "latlng" | "utm";
  onCoordinateDisplayToggle?: () => void;
  /** Di dalam stack bawah (di atas tabel atribut), bukan overlay `bottom-0`. */
  docked?: boolean;
  className?: string;
};

/** Pilih panjang skala grafis (meter) yang "bulat" untuk lebar bar ~72px. */
function graphicScaleBar(
  zoom: number,
  lat: number,
  maxBarPx = 72
): { barPx: number; label: string } {
  const metersPerPixel =
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  const rawMeters = metersPerPixel * maxBarPx;
  const steps = [
    1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
  ];
  let meters = steps[0]!;
  for (const step of steps) {
    if (step <= rawMeters) meters = step;
    else break;
  }
  const barPx = Math.round(meters / metersPerPixel);
  const label = meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
  return { barPx: Math.max(28, Math.min(96, barPx)), label };
}

export function WorkspaceMapGraphicScale({
  zoom,
  lat,
  className,
}: {
  zoom: number;
  lat: number;
  className?: string;
}) {
  const { barPx, label } = graphicScaleBar(zoom, lat);
  return (
    <span
      className={cn("inline-flex shrink-0 flex-col items-center gap-0.5", className)}
      title="Skala grafis"
    >
      <span
        className="block h-1.5 border-x border-t border-foreground/75 bg-background/90"
        style={{ width: barPx }}
        aria-hidden
      />
      <span className="text-[9px] leading-none text-foreground/75">{label}</span>
    </span>
  );
}

export function WorkspaceMapStatusBar({
  state,
  coordinateDisplay = "latlng",
  onCoordinateDisplayToggle,
  docked = false,
  className,
}: StatusBarProps) {
  const { lat, lng, zoom, hasPointer } = state;
  const scale = hasPointer ? formatMapScale(zoom, lat) : formatMapScale(zoom, -6.74);
  const coords =
    coordinateDisplay === "utm"
      ? hasPointer
        ? formatUtm(lat, lng)
        : "—"
      : hasPointer
        ? formatLatLng(lat, lng)
        : "—";
  const coordLabel = coordinateDisplay === "utm" ? "UTM" : "Lon/Lat";
  const epsgBadge =
    coordinateDisplay === "utm" && hasPointer
      ? `EPSG:327${lat !== 0 || lng !== 0 ? (lng < 108 ? "48" : "49") : "48"}`
      : "EPSG:4326";

  return (
    <div
      className={cn(
        "pointer-events-none flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-border/80 bg-background/90 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur-sm sm:text-[11px]",
        docked
          ? "relative z-[450] shrink-0"
          : "absolute inset-x-0 bottom-0 z-[450]",
        className
      )}
      aria-live="polite"
      data-testid="workspace-map-status-bar"
    >
      <WorkspaceMapGraphicScale
        zoom={zoom}
        lat={hasPointer ? lat : -6.74}
      />
      <span className="hidden h-3 w-px bg-border/80 sm:inline" aria-hidden />
      <span title="Koordinat kursor">
        <span className="text-foreground/70">{coordLabel}</span> {coords}
      </span>
      {coordinateDisplay === "latlng" && hasPointer ? (
        <span className="hidden sm:inline" title="Universal Transverse Mercator">
          {formatUtm(lat, lng)}
        </span>
      ) : null}
      <span title="Level zoom">
        <span className="text-foreground/70">Zoom</span> {zoom}
      </span>
      <span title="Perkiraan skala peta">
        <span className="text-foreground/70">Skala</span> {scale}
      </span>
      {onCoordinateDisplayToggle ? (
        <button
          type="button"
          className="pointer-events-auto ml-auto rounded px-1 py-0.5 text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onCoordinateDisplayToggle}
          title="Ganti tampilan koordinat"
        >
          {epsgBadge}
        </button>
      ) : (
        <span className="ml-auto text-[9px] text-muted-foreground/80">
          {epsgBadge}
        </span>
      )}
    </div>
  );
}

export function WorkspaceMapNorthArrow({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute top-2 z-[400] flex size-9 items-center justify-center rounded-md border border-border/80 bg-background/90 text-foreground shadow-sm backdrop-blur-sm",
        className
      )}
      aria-hidden
      title="Utara"
    >
      <span className="text-xs font-bold leading-none">N</span>
    </div>
  );
}
