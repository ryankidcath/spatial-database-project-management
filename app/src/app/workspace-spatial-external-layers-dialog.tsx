"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  createExternalLayerId,
  defaultExternalLayerStyle,
  externalLayerKindLabel,
  type ExternalLayerKind,
  type ExternalMapLayerConfig,
} from "@/lib/workspace-spatial-external-layers";
import {
  createGeoJsonStoreKey,
  deleteGeoJsonBlob,
  parseGeoJsonFileText,
  saveGeoJsonBlob,
} from "@/lib/workspace-spatial-geojson-store";

type Tab = ExternalLayerKind;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layers: ExternalMapLayerConfig[];
  onLayersChange: (layers: ExternalMapLayerConfig[]) => void;
};

const EMPTY_FORM: Record<Tab, Partial<ExternalMapLayerConfig>> = {
  wms: {
    name: "",
    wmsUrl: "",
    wmsLayers: "",
    wmsFormat: "image/png",
    wmsTransparent: true,
  },
  wmts: {
    name: "",
    tileUrl: "",
    tileMaxZoom: 19,
    tileAttribution: "",
  },
  geojson: {
    name: "",
    geojsonUrl: "",
  },
};

export function WorkspaceSpatialExternalLayersDialog({
  open,
  onOpenChange,
  layers,
  onLayersChange,
}: Props) {
  const [tab, setTab] = useState<Tab>("wms");
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setError(null);
      setPendingFile(null);
      setTab("wms");
    }
  }, [open]);

  const updateField = useCallback(
    (kind: Tab, field: string, value: string | number | boolean) => {
      setForm((prev) => ({
        ...prev,
        [kind]: { ...prev[kind], [field]: value },
      }));
    },
    []
  );

  const handleAddLayer = useCallback(async () => {
    setError(null);
    const draft = form[tab];
    const name = (draft.name ?? "").trim();
    if (!name) {
      setError("Nama lapisan wajib diisi.");
      return;
    }

    const id = createExternalLayerId();
    const base: ExternalMapLayerConfig = {
      id,
      name,
      kind: tab,
      visible: true,
      opacity: 0.85,
      style: defaultExternalLayerStyle(),
    };

    if (tab === "wms") {
      const wmsUrl = (draft.wmsUrl ?? "").trim();
      const wmsLayers = (draft.wmsLayers ?? "").trim();
      if (!wmsUrl || !wmsLayers) {
        setError("URL WMS dan nama layer wajib diisi.");
        return;
      }
      onLayersChange([
        ...layers,
        {
          ...base,
          wmsUrl,
          wmsLayers,
          wmsFormat: (draft.wmsFormat ?? "image/png").trim() || "image/png",
          wmsTransparent: draft.wmsTransparent !== false,
        },
      ]);
    } else if (tab === "wmts") {
      const tileUrl = (draft.tileUrl ?? "").trim();
      if (!tileUrl || !tileUrl.includes("{z}")) {
        setError("URL tile harus memuat placeholder {z}/{x}/{y}.");
        return;
      }
      onLayersChange([
        ...layers,
        {
          ...base,
          tileUrl,
          tileMaxZoom:
            typeof draft.tileMaxZoom === "number" ? draft.tileMaxZoom : 19,
          tileAttribution: (draft.tileAttribution ?? "").trim() || undefined,
        },
      ]);
    } else {
      const geojsonUrl = (draft.geojsonUrl ?? "").trim();
      if (!geojsonUrl && !pendingFile) {
        setError("Unggah file GeoJSON atau isi URL publik.");
        return;
      }
      try {
        let storeKey: string | undefined;
        if (pendingFile) {
          const text = await pendingFile.text();
          const data = parseGeoJsonFileText(text);
          storeKey = createGeoJsonStoreKey(id);
          await saveGeoJsonBlob(storeKey, data);
        }
        onLayersChange([
          ...layers,
          {
            ...base,
            geojsonUrl: geojsonUrl || undefined,
            geojsonStoreKey: storeKey,
          },
        ]);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Gagal membaca file GeoJSON."
        );
        return;
      }
    }

    setForm(EMPTY_FORM);
    setPendingFile(null);
  }, [form, tab, layers, onLayersChange, pendingFile]);

  const handleRemove = useCallback(
    async (layer: ExternalMapLayerConfig) => {
      if (layer.geojsonStoreKey) {
        await deleteGeoJsonBlob(layer.geojsonStoreKey);
      }
      onLayersChange(layers.filter((l) => l.id !== layer.id));
    },
    [layers, onLayersChange]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lapisan referensi eksternal</DialogTitle>
          <DialogDescription>
            WMS/WMTS instansi atau GeoJSON batas administratif (read-only, $0).
            Data disimpan per ruang kerja di perangkat ini.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {layers.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Lapisan aktif ({layers.length})
              </p>
              <ul className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {layers.map((layer) => (
                  <li
                    key={layer.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {layer.name}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({externalLayerKindLabel(layer.kind)})
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void handleRemove(layer)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex gap-1 rounded-lg border border-border p-1">
            {(["wms", "wmts", "geojson"] as Tab[]).map((kind) => (
              <button
                key={kind}
                type="button"
                className={cn(
                  "flex-1 rounded-md px-2 py-1.5 text-xs font-medium",
                  tab === kind
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
                onClick={() => setTab(kind)}
              >
                {externalLayerKindLabel(kind)}
              </button>
            ))}
          </div>

          <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="ext-name">Nama lapisan</Label>
              <Input
                id="ext-name"
                value={form[tab].name ?? ""}
                onChange={(e) => updateField(tab, "name", e.target.value)}
                placeholder="Mis. Batas kecamatan"
              />
            </div>

            {tab === "wms" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="ext-wms-url">URL WMS</Label>
                  <Input
                    id="ext-wms-url"
                    value={form.wms.wmsUrl ?? ""}
                    onChange={(e) =>
                      updateField("wms", "wmsUrl", e.target.value)
                    }
                    placeholder="https://…/geoserver/wms"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ext-wms-layers">Nama layer</Label>
                  <Input
                    id="ext-wms-layers"
                    value={form.wms.wmsLayers ?? ""}
                    onChange={(e) =>
                      updateField("wms", "wmsLayers", e.target.value)
                    }
                    placeholder="workspace:layer_name"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Contoh uji (Indonesia): URL{" "}
                  <code className="rounded bg-muted px-1">
                    ows.terrestris.de/osm/service
                  </code>{" "}
                  · layer <code className="rounded bg-muted px-1">OSM-WMS</code>
                  . Server demo GeoServer publik sering memblokir permintaan
                  (403).
                </p>
              </>
            ) : null}

            {tab === "wmts" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="ext-tile-url">URL tile (XYZ/WMTS)</Label>
                  <Input
                    id="ext-tile-url"
                    value={form.wmts.tileUrl ?? ""}
                    onChange={(e) =>
                      updateField("wmts", "tileUrl", e.target.value)
                    }
                    placeholder="https://…/{z}/{x}/{y}.png"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ext-tile-zoom">Max zoom</Label>
                  <Input
                    id="ext-tile-zoom"
                    type="number"
                    min={0}
                    max={22}
                    value={form.wmts.tileMaxZoom ?? 19}
                    onChange={(e) =>
                      updateField("wmts", "tileMaxZoom", Number(e.target.value))
                    }
                  />
                </div>
              </>
            ) : null}

            {tab === "geojson" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="ext-geo-url">URL GeoJSON (opsional)</Label>
                  <Input
                    id="ext-geo-url"
                    value={form.geojson.geojsonUrl ?? ""}
                    onChange={(e) =>
                      updateField("geojson", "geojsonUrl", e.target.value)
                    }
                    placeholder="https://…/batas.geojson"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ext-geo-file">Atau unggah file .geojson</Label>
                  <Input
                    id="ext-geo-file"
                    type="file"
                    accept=".geojson,.json,application/geo+json,application/json"
                    onChange={(e) =>
                      setPendingFile(e.target.files?.[0] ?? null)
                    }
                  />
                  {pendingFile ? (
                    <p className="text-xs text-muted-foreground">
                      File: {pendingFile.name}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}

            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              type="button"
              className="w-full gap-1.5"
              onClick={() => void handleAddLayer()}
            >
              <Plus className="size-4" />
              Tambah lapisan
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
