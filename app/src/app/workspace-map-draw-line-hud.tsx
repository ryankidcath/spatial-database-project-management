"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  pointCount: number;
  finished: boolean;
  snapEnabled: boolean;
  onSnapEnabledChange: (enabled: boolean) => void;
  onFinishLine: () => void;
  onUndoPoint: () => void;
  onClear: () => void;
  onSave: () => void;
  onCancel: () => void;
  className?: string;
};

export function WorkspaceMapDrawLineHud({
  pointCount,
  finished,
  snapEnabled,
  onSnapEnabledChange,
  onFinishLine,
  onUndoPoint,
  onClear,
  onSave,
  onCancel,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "absolute left-1/2 top-2 z-[450] w-[min(24rem,calc(100%-1rem))] -translate-x-1/2 rounded-lg border border-green-600/30 bg-background/95 shadow-md backdrop-blur-sm",
        className
      )}
      data-testid="workspace-map-draw-line-hud"
    >
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-foreground">
              Gambar garis
            </p>
            <p className="text-[11px] text-muted-foreground">
              {pointCount} vertex
              {finished
                ? " · selesai"
                : " · klik peta (snap ke titik T1, T2…)"}
            </p>
          </div>
          <button
            type="button"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onCancel}
            aria-label="Tutup alat gambar garis"
          >
            <X className="size-4" />
          </button>
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={snapEnabled}
            onChange={(e) => onSnapEnabledChange(e.target.checked)}
            className="size-4"
          />
          Snap ke titik ukur (T1, T2…) dan vertex poligon lapisan aktif.
          Kotak biru = titik yang akan disnap.
        </label>

        <div className="flex flex-wrap gap-2">
          {!finished ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="min-h-11"
                disabled={pointCount < 2}
                onClick={onFinishLine}
              >
                Selesai garis
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11"
                disabled={pointCount === 0}
                onClick={onUndoPoint}
              >
                Urungkan titik
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              className="min-h-11"
              onClick={onSave}
            >
              Simpan garis…
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            disabled={pointCount === 0}
            onClick={onClear}
          >
            Hapus
          </Button>
        </div>

        {!finished && pointCount > 0 && pointCount < 2 ? (
          <p className="text-[11px] text-muted-foreground">
            Tambah minimal 1 titik lagi untuk menyelesaikan garis.
          </p>
        ) : null}
      </div>
    </div>
  );
}
