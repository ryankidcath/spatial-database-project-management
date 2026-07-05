"use client";

import { Eye, EyeOff, Globe, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExternalMapLayerConfig } from "@/lib/workspace-spatial-external-layers";
import { externalLayerKindLabel } from "@/lib/workspace-spatial-external-layers";

type Props = {
  layers: ExternalMapLayerConfig[];
  onVisibilityChange: (id: string, visible: boolean) => void;
  onOpacityChange: (id: string, opacity: number) => void;
  onZoomToLayer?: (id: string) => void;
  onRemoveLayer?: (id: string) => void;
  onManageLayers?: () => void;
  className?: string;
};

export function WorkspaceSpatialExternalLayerList({
  layers,
  onVisibilityChange,
  onOpacityChange,
  onZoomToLayer,
  onRemoveLayer,
  onManageLayers,
  className,
}: Props) {
  if (layers.length === 0) {
    return (
      <div className={cn("px-2 py-3", className)}>
        <p className="text-center text-xs text-muted-foreground">
          Belum ada lapisan referensi eksternal.
        </p>
        {onManageLayers ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 w-full font-normal"
            onClick={onManageLayers}
          >
            Tambah lapisan…
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-1 px-2 pb-2", className)}>
      {layers.map((layer) => (
        <div
          key={layer.id}
          className="rounded-md border border-border/70 bg-muted/20 px-2 py-2"
        >
          <div className="flex items-start gap-2">
            <button
              type="button"
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => onVisibilityChange(layer.id, !layer.visible)}
              title={layer.visible ? "Sembunyikan" : "Tampilkan"}
            >
              {layer.visible ? (
                <Eye className="size-4" />
              ) : (
                <EyeOff className="size-4 opacity-50" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {layer.name}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {externalLayerKindLabel(layer.kind)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {layer.kind === "geojson" && onZoomToLayer ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onZoomToLayer(layer.id)}
                  title="Zoom ke lapisan"
                >
                  <Target className="size-3.5" />
                </Button>
              ) : null}
              {onRemoveLayer ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRemoveLayer(layer.id)}
                  title="Hapus"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}
            </div>
          </div>
          {layer.visible ? (
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={layer.opacity}
              onChange={(e) =>
                onOpacityChange(layer.id, Number(e.target.value))
              }
              className="mt-2 h-1 w-full accent-primary"
              aria-label={`Opacity ${layer.name}`}
            />
          ) : null}
        </div>
      ))}
      {onManageLayers ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1 w-full gap-1.5 font-normal"
          onClick={onManageLayers}
        >
          <Globe className="size-3.5" />
          Kelola lapisan eksternal…
        </Button>
      ) : null}
    </div>
  );
}
