"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import dynamic from "next/dynamic";
import type { IDxf } from "dxf-parser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  extractClosedPolygonRingsFromDxfLayer,
  featureKeysForDxfPolygons,
  listDxfLayerNames,
  parseDxfDocument,
  type LinearRing,
} from "@/lib/dxf-import-utils";
import {
  dxfRingsToWgs84PreviewFeatureCollection,
  isPreviewSourceSridSupported,
} from "@/lib/crs-reproject";
import {
  MAX_SPATIAL_GEOMETRY_TEXT_CHARS,
  MAX_SPATIAL_GEOMETRY_TEXT_MB,
  spatialGeometryTextTooLargeMessage,
} from "@/lib/spatial-import-limits";
import {
  defaultLayerDisplayNameFromFileName,
  LAYER_MATCH_COLUMN_SLUG,
} from "@/lib/virtual-table-layer-bootstrap";
import { parseFeatureCollectionForVirtualImport } from "@/lib/virtual-table-geojson-import";
import {
  VIRTUAL_TABLE_DXF_SOURCE_SRID_OPTIONS,
} from "@/lib/virtual-table-dxf-import";
import {
  buildVirtualTableImportPreviewFootprints,
  mapPreviewLayersSignature,
} from "@/lib/virtual-table-map-preview";
import type { MapFootprint } from "./workspace-map";
import { bootstrapVirtualTableLayerFromSpatialAction } from "./virtual-table-actions";

const DxfMappingPreviewMap = dynamic(
  () =>
    import("./dxf-mapping-preview-map").then((m) => m.DxfMappingPreviewMap),
  { ssr: false, loading: () => <div className="h-48 animate-pulse rounded-md bg-muted" /> }
);

export type LayerUploadCreated = {
  tableId: string;
  tableSlug: string;
  displayName: string;
  inserted: number;
};

export function VirtualTableLayerUploadDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
  mapPreviewEnabled = false,
  onPreviewChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onCreated: (result: LayerUploadCreated) => void;
  mapPreviewEnabled?: boolean;
  onPreviewChange?: (footprints: MapFootprint[] | null) => void;
}) {
  const [sourceFormat, setSourceFormat] = useState<"geojson" | "dxf">("geojson");
  const [displayName, setDisplayName] = useState("");
  const [keyPrefix, setKeyPrefix] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [geojsonText, setGeojsonText] = useState("");
  const [geojsonFileName, setGeojsonFileName] = useState("");

  const [dxfRawText, setDxfRawText] = useState("");
  const [dxfLayers, setDxfLayers] = useState<string[]>([]);
  const [dxfLayer, setDxfLayer] = useState("");
  const [dxfPolygonCount, setDxfPolygonCount] = useState(0);
  const [dxfMatchKeys, setDxfMatchKeys] = useState<string[]>([]);
  const [dxfLabels, setDxfLabels] = useState<string[]>([]);
  const [dxfBulkKeyText, setDxfBulkKeyText] = useState("");
  const [dxfPreviewRings, setDxfPreviewRings] = useState<LinearRing[]>([]);
  const [dxfHighlightRow, setDxfHighlightRow] = useState<number | null>(null);
  const [dxfError, setDxfError] = useState<string | null>(null);
  const [sourceSrid, setSourceSrid] = useState("4326");
  const dxfParsedRef = useRef<IDxf | null>(null);

  const geojsonPreview = useMemo(() => {
    if (!geojsonText.trim()) return null;
    const r = parseFeatureCollectionForVirtualImport(geojsonText);
    if (!r.ok) return { error: r.error, count: 0 };
    return { error: null as string | null, count: r.rows.length };
  }, [geojsonText]);

  const onPreviewChangeRef = useRef(onPreviewChange);
  const lastPreviewSigRef = useRef("");

  useEffect(() => {
    onPreviewChangeRef.current = onPreviewChange;
  }, [onPreviewChange]);

  useEffect(() => {
    if (!mapPreviewEnabled || !open || sourceFormat !== "geojson") return;
    const emit = (layers: MapFootprint[] | null) => {
      const sig = mapPreviewLayersSignature(layers);
      if (sig === lastPreviewSigRef.current) return;
      lastPreviewSigRef.current = sig;
      onPreviewChangeRef.current?.(layers);
    };
    const text = geojsonText.trim();
    if (!text) {
      emit(null);
      return;
    }
    const built = buildVirtualTableImportPreviewFootprints(
      text,
      displayName.trim() || "Pratinjau layer",
      LAYER_MATCH_COLUMN_SLUG
    );
    if (!("footprints" in built)) {
      emit(null);
      return;
    }
    emit(built.footprints);
  }, [mapPreviewEnabled, open, sourceFormat, geojsonText, displayName]);

  useEffect(() => {
    if (!open) {
      lastPreviewSigRef.current = "";
      onPreviewChangeRef.current?.(null);
    }
  }, [open]);

  const resetState = useCallback(() => {
    setSourceFormat("geojson");
    setDisplayName("");
    setKeyPrefix("");
    setImportMsg(null);
    setGeojsonText("");
    setGeojsonFileName("");
    setDxfRawText("");
    setDxfLayers([]);
    setDxfLayer("");
    setDxfPolygonCount(0);
    setDxfMatchKeys([]);
    setDxfLabels([]);
    setDxfBulkKeyText("");
    setDxfPreviewRings([]);
    setDxfHighlightRow(null);
    setDxfError(null);
    setSourceSrid("4326");
    dxfParsedRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  useEffect(() => {
    if (dxfPolygonCount === 0 || !dxfLayer.trim()) {
      setDxfMatchKeys([]);
      setDxfLabels([]);
      return;
    }
    setDxfMatchKeys(
      featureKeysForDxfPolygons(keyPrefix.trim(), dxfLayer, dxfPolygonCount)
    );
    setDxfLabels(Array.from({ length: dxfPolygonCount }, () => ""));
  }, [dxfPolygonCount, dxfLayer, keyPrefix]);

  const dxfPreviewFc = useMemo(() => {
    if (dxfPreviewRings.length === 0) {
      return { fc: null as GeoJSON.FeatureCollection | null, err: null as string | null };
    }
    const srid = Number.parseInt(sourceSrid.trim(), 10);
    if (!Number.isFinite(srid) || !isPreviewSourceSridSupported(srid)) {
      return { fc: null, err: "SRID tidak didukung untuk pratinjau." };
    }
    try {
      return {
        fc: dxfRingsToWgs84PreviewFeatureCollection(dxfPreviewRings, srid),
        err: null,
      };
    } catch (e) {
      return {
        fc: null,
        err: e instanceof Error ? e.message : "Gagal proyeksi pratinjau.",
      };
    }
  }, [dxfPreviewRings, sourceSrid]);

  const handleGeojsonFile = useCallback((file: File | undefined) => {
    if (!file) return;
    setImportMsg(null);
    setGeojsonFileName(file.name);
    if (!displayName.trim()) {
      setDisplayName(defaultLayerDisplayNameFromFileName(file.name));
    }
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      if (raw.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
        setGeojsonText("");
        setImportMsg(spatialGeometryTextTooLargeMessage("GeoJSON"));
        return;
      }
      setGeojsonText(raw);
    };
    reader.onerror = () => setImportMsg("Gagal membaca file.");
    reader.readAsText(file);
  }, [displayName]);

  const handleDxfFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      setImportMsg(null);
      setDxfError(null);
      if (!displayName.trim()) {
        setDisplayName(defaultLayerDisplayNameFromFileName(file.name));
      }
      const reader = new FileReader();
      reader.onload = () => {
        const raw = typeof reader.result === "string" ? reader.result : "";
        if (raw.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
          setDxfRawText("");
          setDxfError(spatialGeometryTextTooLargeMessage("DXF"));
          return;
        }
        setDxfRawText(raw);
        try {
          const dxf = parseDxfDocument(raw);
          dxfParsedRef.current = dxf;
          const layers = listDxfLayerNames(dxf, raw);
          setDxfLayers(layers);
          const first = layers[0] ?? "";
          setDxfLayer(first);
          const rings = first
            ? extractClosedPolygonRingsFromDxfLayer(dxf, first, raw)
            : [];
          setDxfPolygonCount(rings.length);
          setDxfPreviewRings(rings);
        } catch (err) {
          dxfParsedRef.current = null;
          setDxfLayers([]);
          setDxfLayer("");
          setDxfPolygonCount(0);
          setDxfPreviewRings([]);
          setDxfError(
            err instanceof Error ? err.message : "Gagal membaca DXF."
          );
        }
      };
      reader.readAsText(file);
    },
    [displayName]
  );

  const canSubmit = useMemo(() => {
    if (!displayName.trim() || pending) return false;
    if (sourceFormat === "geojson") {
      return (
        !!geojsonText.trim() &&
        geojsonPreview != null &&
        !geojsonPreview.error &&
        geojsonPreview.count > 0
      );
    }
    return (
      !dxfError &&
      !!dxfRawText.trim() &&
      !!dxfLayer.trim() &&
      dxfPolygonCount > 0 &&
      dxfMatchKeys.length === dxfPolygonCount &&
      dxfMatchKeys.every((k) => k.trim())
    );
  }, [
    displayName,
    pending,
    sourceFormat,
    geojsonText,
    geojsonPreview,
    dxfError,
    dxfRawText,
    dxfLayer,
    dxfPolygonCount,
    dxfMatchKeys,
  ]);

  const runCreate = useCallback(() => {
    if (!canSubmit) return;
    setImportMsg(null);
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("display_name", displayName.trim());
    fd.set("source_format", sourceFormat);
    if (keyPrefix.trim()) fd.set("feature_key_prefix", keyPrefix.trim());

    if (sourceFormat === "geojson") {
      fd.set("geojson_json", geojsonText);
    } else {
      fd.set("dxf_text", dxfRawText);
      fd.set("layer_name", dxfLayer);
      fd.set("source_srid", sourceSrid);
      fd.set(
        "match_keys_json",
        JSON.stringify(dxfMatchKeys.map((k) => k.trim()))
      );
      fd.set(
        "match_labels_json",
        JSON.stringify(dxfLabels.map((lb) => lb.trim()))
      );
    }

    startTransition(async () => {
      const r = await bootstrapVirtualTableLayerFromSpatialAction(fd);
      if (r.error || !r.tableId || !r.tableSlug) {
        setImportMsg(r.error ?? "Gagal membuat layer.");
        return;
      }
      const failText =
        r.failed > 0
          ? ` (${r.failed} poligon gagal)`
          : "";
      setImportMsg(
        `Layer "${r.displayName}" dibuat: ${r.inserted} bidang.${failText}`
      );
      onPreviewChange?.(null);
      onCreated({
        tableId: r.tableId,
        tableSlug: r.tableSlug,
        displayName: r.displayName ?? displayName.trim(),
        inserted: r.inserted,
      });
      onOpenChange(false);
    });
  }, [
    canSubmit,
    projectId,
    displayName,
    sourceFormat,
    keyPrefix,
    geojsonText,
    dxfRawText,
    dxfLayer,
    sourceSrid,
    dxfMatchKeys,
    dxfLabels,
    onCreated,
    onOpenChange,
    onPreviewChange,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Layer baru dari file</DialogTitle>
          <DialogDescription>
            Untuk surveyor: unggah geometri dulu — sistem membuat tabel baru
            dengan kolom <span className="font-mono">no_bidang</span>,{" "}
            <span className="font-mono">geom</span>, dan{" "}
            <span className="font-mono">title</span>. Admin dapat menambah kolom
            atau impor CSV nanti.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {mapPreviewEnabled && sourceFormat === "geojson" ? (
            <p className="rounded-md border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs">
              GeoJSON valid ditampilkan di peta utama (garis teal) sebelum
              disimpan.
            </p>
          ) : null}

          <div>
            <Label htmlFor="layer-format">Format file</Label>
            <select
              id="layer-format"
              value={sourceFormat}
              onChange={(e) =>
                setSourceFormat(e.target.value as "geojson" | "dxf")
              }
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              disabled={pending}
            >
              <option value="geojson">GeoJSON</option>
              <option value="dxf">DXF</option>
            </select>
          </div>

          <div>
            <Label htmlFor="layer-display-name">Nama layer / tabel</Label>
            <Input
              id="layer-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Bidang Desa X (2026-05-22)"
              disabled={pending}
            />
          </div>

          <div>
            <Label htmlFor="layer-key-prefix">Prefix no. bidang (opsional)</Label>
            <Input
              id="layer-key-prefix"
              value={keyPrefix}
              onChange={(e) => setKeyPrefix(e.target.value)}
              placeholder="BAB-"
              className="font-mono"
              disabled={pending}
            />
          </div>

          {sourceFormat === "geojson" ? (
            <div>
              <Label htmlFor="layer-geo-file">File GeoJSON</Label>
              <Input
                id="layer-geo-file"
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                disabled={pending}
                onChange={(e) => {
                  handleGeojsonFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {geojsonFileName ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {geojsonFileName}
                  {geojsonPreview
                    ? geojsonPreview.error
                      ? ` — ${geojsonPreview.error}`
                      : ` — ${geojsonPreview.count} poligon`
                    : null}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="layer-dxf-file">File DXF</Label>
                <Input
                  id="layer-dxf-file"
                  type="file"
                  accept=".dxf,text/plain,application/dxf,application/x-dxf"
                  disabled={pending}
                  onChange={(e) => {
                    handleDxfFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Batas teks ~{MAX_SPATIAL_GEOMETRY_TEXT_MB} MB.
                </p>
              </div>
              {dxfError ? (
                <p className="text-xs text-red-600" role="alert">
                  {dxfError}
                </p>
              ) : null}
              {dxfLayers.length > 0 ? (
                <div>
                  <Label htmlFor="layer-dxf-layer">Layer CAD</Label>
                  <select
                    id="layer-dxf-layer"
                    value={dxfLayer}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDxfLayer(v);
                      const dxf = dxfParsedRef.current;
                      if (!dxf) return;
                      try {
                        const rings = extractClosedPolygonRingsFromDxfLayer(
                          dxf,
                          v,
                          dxfRawText
                        );
                        setDxfPolygonCount(rings.length);
                        setDxfPreviewRings(rings);
                        setDxfError(null);
                      } catch (err) {
                        setDxfPolygonCount(0);
                        setDxfPreviewRings([]);
                        setDxfError(
                          err instanceof Error
                            ? err.message
                            : "Gagal menganalisis layer."
                        );
                      }
                    }}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    disabled={pending}
                  >
                    {dxfLayers.map((ly) => (
                      <option key={ly} value={ly}>
                        {ly}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {dxfPolygonCount} poligon tertutup
                  </p>
                </div>
              ) : null}
              <div>
                <Label htmlFor="layer-dxf-srid">EPSG/SRID sumber</Label>
                <select
                  id="layer-dxf-srid"
                  value={sourceSrid}
                  onChange={(e) => setSourceSrid(e.target.value)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  disabled={pending}
                >
                  {VIRTUAL_TABLE_DXF_SOURCE_SRID_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {dxfPolygonCount > 0 ? (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <p className="text-xs font-medium">
                    No. bidang per poligon ({dxfPolygonCount})
                  </p>
                  {dxfPreviewFc.err ? (
                    <p className="text-xs text-amber-700">{dxfPreviewFc.err}</p>
                  ) : null}
                  <DxfMappingPreviewMap
                    featureCollection={dxfPreviewFc.fc}
                    highlightIndex={dxfHighlightRow}
                    onSelectPolygon={setDxfHighlightRow}
                  />
                  <Textarea
                    value={dxfBulkKeyText}
                    onChange={(e) => setDxfBulkKeyText(e.target.value)}
                    placeholder="Tempel daftar no_bidang (satu per baris)"
                    rows={2}
                    className="font-mono text-[11px]"
                    disabled={pending}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs"
                    disabled={pending}
                    onClick={() => {
                      const lines = dxfBulkKeyText
                        .split(/\r?\n/)
                        .map((s) => s.trim())
                        .filter(Boolean);
                      if (!lines.length) return;
                      setDxfMatchKeys((prev) => {
                        const next = [...prev];
                        const take = Math.min(lines.length, next.length);
                        for (let i = 0; i < take; i++) next[i] = lines[i]!;
                        return next;
                      });
                    }}
                  >
                    Terapkan ke tabel
                  </Button>
                  <div className="max-h-40 overflow-y-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/80 text-muted-foreground">
                          <th className="px-2 py-1">#</th>
                          <th className="px-2 py-1">no_bidang</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dxfMatchKeys.map((key, idx) => (
                          <tr key={idx} className="border-t border-border/60">
                            <td className="px-2 py-1 text-muted-foreground">
                              {idx + 1}
                            </td>
                            <td className="px-1 py-0.5">
                              <Input
                                value={key}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setDxfMatchKeys((prev) => {
                                    const next = [...prev];
                                    next[idx] = v;
                                    return next;
                                  });
                                }}
                                className="h-8 font-mono text-[11px]"
                                disabled={pending}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          )}

          {importMsg ? (
            <p
              className={cn(
                "text-xs",
                importMsg.includes("dibuat")
                  ? "text-emerald-700"
                  : "text-red-600"
              )}
              role="status"
            >
              {importMsg}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={runCreate}>
              {pending ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Membuat layer…
                </>
              ) : (
                "Buat layer & simpan"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
