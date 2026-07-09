"use client";

import { Button } from "@/components/ui/button";
import { approximateTranslationMeters } from "@/lib/workspace-map-translate-geom";
import type { MoveGeomDraftState } from "@/lib/workspace-map-tool-types";

type Props = {
  draft: MoveGeomDraftState;
  snapEnabled: boolean;
  savePending: boolean;
  atLat: number;
  onSnapEnabledChange: (enabled: boolean) => void;
  onResetDelta: () => void;
  onClearSelection: () => void;
  onSave: () => void;
  onCancel: () => void;
};

export function WorkspaceMapMoveGeomHud({
  draft,
  snapEnabled,
  savePending,
  atLat,
  onSnapEnabledChange,
  onResetDelta,
  onClearSelection,
  onSave,
  onCancel,
}: Props) {
  const { selection, deltaLat, deltaLng } = draft;
  const hasDelta = Math.abs(deltaLat) > 1e-12 || Math.abs(deltaLng) > 1e-12;
  const distM =
    selection && hasDelta
      ? approximateTranslationMeters(deltaLat, deltaLng, atLat)
      : 0;

  return (
    <div
      className="pointer-events-auto absolute left-2 top-2 z-[500] max-w-sm rounded-lg border border-border bg-background/95 p-3 text-sm shadow-md backdrop-blur-sm"
      data-testid="workspace-map-move-geom-hud"
    >
      <p className="font-medium text-foreground">Geser geometri</p>
      {!selection ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Klik bidang, garis, atau titik di peta untuk memilih. Lalu drag untuk
          menggeser.
        </p>
      ) : (
        <>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {selection.label}
          </p>
          {hasDelta ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Geser ~{distM.toFixed(2)} m (Δlat {deltaLat.toFixed(7)}, Δlng{" "}
              {deltaLng.toFixed(7)})
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Drag fitur di peta untuk menggeser posisi.
            </p>
          )}
        </>
      )}

      <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={snapEnabled}
          onChange={(e) => onSnapEnabledChange(e.target.checked)}
        />
        Snap ke vertex lapisan referensi
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        {selection ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasDelta || savePending}
              onClick={onResetDelta}
            >
              Reset geser
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={savePending}
              onClick={onClearSelection}
            >
              Pilih lain
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!hasDelta || savePending}
              onClick={onSave}
            >
              {savePending ? "Menyimpan…" : "Simpan"}
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={savePending}
          onClick={onCancel}
        >
          Batal
        </Button>
      </div>
    </div>
  );
}
