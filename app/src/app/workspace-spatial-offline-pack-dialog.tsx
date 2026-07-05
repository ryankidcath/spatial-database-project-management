"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Trash2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  WORKSPACE_BASEMAPS,
  type WorkspaceBasemapId,
} from "@/lib/workspace-map-basemaps";
import {
  countTilesInBounds,
  createOfflinePackId,
  deleteOfflineTilesForPack,
  downloadOfflineTilePack,
  loadOfflineTilePrefs,
  offlineBoundsFromMapView,
  saveOfflineTilePrefs,
  type OfflineTileBounds,
  type OfflineTilePack,
  type OfflineTilePrefs,
} from "@/lib/workspace-spatial-offline-tiles";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  basemapId: WorkspaceBasemapId;
  getMapView: () => { lat: number; lng: number; zoom: number } | null;
  onPrefsChange?: (prefs: OfflineTilePrefs) => void;
};

export function WorkspaceSpatialOfflinePackDialog({
  open,
  onOpenChange,
  projectId,
  basemapId,
  getMapView,
  onPrefsChange,
}: Props) {
  const [prefs, setPrefs] = useState<OfflineTilePrefs>(() =>
    loadOfflineTilePrefs(projectId)
  );
  const [packName, setPackName] = useState("Area peta saat ini");
  const [minZoom, setMinZoom] = useState(12);
  const [maxZoom, setMaxZoom] = useState(16);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && projectId) {
      const loaded = loadOfflineTilePrefs(projectId);
      setPrefs(loaded);
      setError(null);
      setProgress(null);
    }
  }, [open, projectId]);

  const bounds: OfflineTileBounds | null = useMemo(() => {
    const mapView = open ? getMapView() : null;
    if (!mapView) return null;
    return offlineBoundsFromMapView(mapView);
  }, [open, getMapView]);

  const tileEstimate = useMemo(() => {
    if (!bounds) return 0;
    return countTilesInBounds(bounds, minZoom, maxZoom);
  }, [bounds, minZoom, maxZoom]);

  const persistPrefs = useCallback(
    (next: OfflineTilePrefs) => {
      setPrefs(next);
      saveOfflineTilePrefs(projectId, next);
      onPrefsChange?.(next);
    },
    [projectId, onPrefsChange]
  );

  const handleDownload = useCallback(async () => {
    if (!bounds || !projectId) return;
    setError(null);
    setDownloading(true);
    setProgress({ done: 0, total: tileEstimate });

    try {
      const result = await downloadOfflineTilePack({
        basemapId,
        bounds,
        minZoom,
        maxZoom,
        onProgress: (done, total) => setProgress({ done, total }),
      });

      const pack: OfflineTilePack = {
        id: createOfflinePackId(),
        name: packName.trim() || "Paket offline",
        basemapId,
        bounds,
        minZoom,
        maxZoom,
        createdAt: Date.now(),
        tileCount: result.tileCount,
      };

      persistPrefs({
        ...prefs,
        packs: [...prefs.packs, pack],
      });

      if (result.failed > 0) {
        setError(
          `${result.tileCount} tile tersimpan; ${result.failed} gagal (CORS/server).`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unduhan gagal.");
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  }, [
    bounds,
    projectId,
    basemapId,
    minZoom,
    maxZoom,
    packName,
    tileEstimate,
    prefs,
    persistPrefs,
  ]);

  const handleDeletePack = useCallback(
    async (pack: OfflineTilePack) => {
      await deleteOfflineTilesForPack(pack);
      persistPrefs({
        ...prefs,
        packs: prefs.packs.filter((p) => p.id !== pack.id),
      });
    },
    [prefs, persistPrefs]
  );

  const handleOfflineModeToggle = useCallback(() => {
    persistPrefs({ ...prefs, offlineMode: !prefs.offlineMode });
  }, [prefs, persistPrefs]);

  const basemapLabel =
    WORKSPACE_BASEMAPS.find((b) => b.id === basemapId)?.label ?? basemapId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,36rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Basemap offline</DialogTitle>
          <DialogDescription>
            Unduh tile basemap ke perangkat (IndexedDB, $0). Cocok untuk
            lapangan tanpa jaringan — beberapa server tile dapat menolak
            unduhan lintas domain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">Mode offline</p>
              <p className="text-xs text-muted-foreground">
                Hanya tampilkan tile yang sudah diunduh
              </p>
            </div>
            <Button
              type="button"
              variant={prefs.offlineMode ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={handleOfflineModeToggle}
            >
              <WifiOff className="size-3.5" />
              {prefs.offlineMode ? "Aktif" : "Mati"}
            </Button>
          </div>

          {prefs.packs.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Paket tersimpan
              </p>
              <ul className="space-y-1 rounded-md border border-border p-2">
                {prefs.packs.map((pack) => (
                  <li
                    key={pack.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {pack.name}
                      <span className="ml-1 text-xs text-muted-foreground">
                        · {pack.tileCount} tile · z{pack.minZoom}–{pack.maxZoom}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void handleDeletePack(pack)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
            <p className="text-xs font-medium text-foreground">
              Unduh area saat ini · basemap {basemapLabel}
            </p>
            {!getMapView() ? (
              <p className="text-xs text-muted-foreground">
                Peta belum siap — buka tab Spasial terlebih dahulu.
              </p>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="offline-pack-name">Nama paket</Label>
              <Input
                id="offline-pack-name"
                value={packName}
                onChange={(e) => setPackName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="offline-min-z">Zoom min</Label>
                <Input
                  id="offline-min-z"
                  type="number"
                  min={8}
                  max={18}
                  value={minZoom}
                  onChange={(e) => setMinZoom(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offline-max-z">Zoom max</Label>
                <Input
                  id="offline-max-z"
                  type="number"
                  min={8}
                  max={19}
                  value={maxZoom}
                  onChange={(e) => setMaxZoom(Number(e.target.value))}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Perkiraan {tileEstimate.toLocaleString("id-ID")} tile
              {tileEstimate > 800 ? " — pertimbangkan zoom max lebih rendah" : ""}
            </p>

            {progress ? (
              <p className="text-xs text-foreground">
                Mengunduh… {progress.done}/{progress.total}
              </p>
            ) : null}

            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              type="button"
              className="w-full gap-1.5"
              disabled={!getMapView() || downloading || tileEstimate === 0}
              onClick={() => void handleDownload()}
            >
              <Download className="size-4" />
              {downloading ? "Mengunduh…" : "Unduh basemap offline"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
