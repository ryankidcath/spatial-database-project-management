"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MoveGeomOverlapPreview } from "@/lib/workspace-map-move-geom-overlap";
import { normalizeRotationDeg } from "@/lib/workspace-map-transform-geom";
import { approximateTranslationMeters } from "@/lib/workspace-map-translate-geom";
import type {
  MoveGeomDraftState,
  MoveGeomEditSubMode,
} from "@/lib/workspace-map-tool-types";

const OVERLAP_LIST_LIMIT = 3;

type Props = {
  draft: MoveGeomDraftState;
  rotationSupported: boolean;
  overlapPreview: MoveGeomOverlapPreview;
  overlapRefreshing: boolean;
  snapEnabled: boolean;
  savePending: boolean;
  atLat: number;
  onSubModeChange: (mode: MoveGeomEditSubMode) => void;
  onSnapEnabledChange: (enabled: boolean) => void;
  onResetTransform: () => void;
  onClearSelection: () => void;
  onSave: () => void;
  onCancel: () => void;
};

export function WorkspaceMapMoveGeomHud({
  draft,
  rotationSupported,
  overlapPreview,
  overlapRefreshing,
  snapEnabled,
  savePending,
  atLat,
  onSubModeChange,
  onSnapEnabledChange,
  onResetTransform,
  onClearSelection,
  onSave,
  onCancel,
}: Props) {
  const { selection, deltaLat, deltaLng, rotationDeg, subMode } = draft;
  const hasTranslate =
    Math.abs(deltaLat) > 1e-12 || Math.abs(deltaLng) > 1e-12;
  const hasRotation = Math.abs(rotationDeg) > 1e-12;
  const hasChanges = hasTranslate || hasRotation;
  const distM =
    selection && hasTranslate
      ? approximateTranslationMeters(deltaLat, deltaLng, atLat)
      : 0;
  const displayRotation = normalizeRotationDeg(rotationDeg);
  const overlapHits = overlapPreview.hits;
  const extraOverlapCount = Math.max(0, overlapHits.length - OVERLAP_LIST_LIMIT);

  return (
    <div
      className="pointer-events-auto absolute left-2 top-2 z-[500] max-w-sm rounded-lg border border-border bg-background/95 p-3 text-sm shadow-md backdrop-blur-sm"
      data-testid="workspace-map-move-geom-hud"
    >
      <p className="font-medium text-foreground">Edit geometri</p>
      {!selection ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Klik bidang, garis, atau titik di peta untuk memilih. Lalu geser atau
          putar.
        </p>
      ) : (
        <>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {selection.label}
          </p>

          <div className="mt-2 flex gap-1 rounded-md border border-border p-0.5">
            <button
              type="button"
              className={cn(
                "flex-1 rounded px-2 py-1 text-xs transition-colors",
                subMode === "translate"
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => onSubModeChange("translate")}
            >
              Geser
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 rounded px-2 py-1 text-xs transition-colors",
                subMode === "rotate"
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                !rotationSupported && "cursor-not-allowed opacity-50"
              )}
              disabled={!rotationSupported}
              title={
                rotationSupported
                  ? "Putar sekitar pusat geometri"
                  : "Titik tunggal tidak mendukung rotasi"
              }
              onClick={() => onSubModeChange("rotate")}
            >
              Putar
            </button>
          </div>

          {subMode === "translate" ? (
            hasTranslate ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Geser ~{distM.toFixed(2)} m (Δlat {deltaLat.toFixed(7)}, Δlng{" "}
                {deltaLng.toFixed(7)})
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Drag fitur di peta untuk menggeser posisi.
              </p>
            )
          ) : hasRotation ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Putar {displayRotation.toFixed(1)}° — drag handle biru di peta.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Drag handle biru mengelilingi titik pusat untuk memutar.
            </p>
          )}

          {overlapRefreshing ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Memperbarui pratinjau overlap…
            </p>
          ) : selection ? (
            <div className="mt-2 rounded-md border border-border/80 bg-muted/30 px-2 py-1.5">
              {overlapPreview.isClean ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Tidak ada overlap dengan lapisan lain.
                </p>
              ) : (
                <>
                  <p className="text-xs font-medium text-destructive">
                    {overlapHits.length} overlap dengan lapisan lain
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {overlapHits.slice(0, OVERLAP_LIST_LIMIT).map((hit) => (
                      <li key={hit.footprintId} className="truncate">
                        {hit.label}
                        {hit.overlapAreaSqM != null
                          ? ` · ~${hit.overlapAreaSqM.toFixed(1)} m²`
                          : null}
                      </li>
                    ))}
                  </ul>
                  {extraOverlapCount > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      +{extraOverlapCount} lainnya (disorot di peta)
                    </p>
                  ) : null}
                  {!overlapPreview.supportsAreaOverlap ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Garis/titik: deteksi irisan geometri saja (tanpa luas m²).
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </>
      )}

      <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={snapEnabled}
          disabled={subMode === "rotate"}
          onChange={(e) => onSnapEnabledChange(e.target.checked)}
        />
        Snap ke vertex lapisan referensi
        {subMode === "rotate" ? (
          <span className="text-muted-foreground">(hanya mode Geser)</span>
        ) : null}
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        {selection ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasChanges || savePending}
              onClick={onResetTransform}
            >
              Reset
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
              disabled={!hasChanges || savePending}
              onClick={onSave}
              title={
                !overlapPreview.isClean
                  ? "Masih ada overlap — sesuaikan lagi atau simpan jika disengaja"
                  : undefined
              }
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
