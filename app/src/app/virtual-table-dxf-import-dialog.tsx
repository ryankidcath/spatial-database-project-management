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
import { RelationTargetPickerDialog } from "@/components/relation-target-picker-dialog";
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
import { normalizeVirtualTableMatchKey } from "@/lib/virtual-table-geojson-import";
import {
  VIRTUAL_TABLE_DXF_SOURCE_SRID_OPTIONS,
  virtualTableDxfKeyMappingTemplateCsv,
} from "@/lib/virtual-table-dxf-import";
import type {
  VirtualColumnRow,
  VirtualDataRow,
  VirtualTableRow,
} from "./virtual-table-types";
import { importVirtualRowsDxfBatchAction } from "./virtual-table-actions";

const DxfMappingPreviewMap = dynamic(
  () =>
    import("./dxf-mapping-preview-map").then((m) => m.DxfMappingPreviewMap),
  { ssr: false, loading: () => <div className="h-48 animate-pulse rounded-md bg-muted" /> }
);

function bidangUpsertStorageKeyClient(
  desaRelationSlug: string,
  desaRowId: string | null | undefined,
  matchNorm: string
): string {
  if (desaRelationSlug && desaRowId && String(desaRowId).trim()) {
    return `${String(desaRowId).trim().toLowerCase()}::${matchNorm}`;
  }
  return matchNorm;
}

export function VirtualTableDxfImportDialog({
  open,
  onOpenChange,
  table,
  columns,
  allVirtualTables,
  rows,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: VirtualTableRow;
  columns: VirtualColumnRow[];
  allVirtualTables: VirtualTableRow[];
  rows: VirtualDataRow[];
  onImported: () => void;
}) {
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importPending, startImportTransition] = useTransition();
  const [dxfRawText, setDxfRawText] = useState("");
  const [dxfLayers, setDxfLayers] = useState<string[]>([]);
  const [dxfLayer, setDxfLayer] = useState("");
  const [dxfKeyPrefix, setDxfKeyPrefix] = useState("");
  const [dxfPolygonCount, setDxfPolygonCount] = useState(0);
  const [dxfMatchKeys, setDxfMatchKeys] = useState<string[]>([]);
  const [dxfLabels, setDxfLabels] = useState<string[]>([]);
  const [dxfBulkKeyText, setDxfBulkKeyText] = useState("");
  const [dxfBulkKeyHint, setDxfBulkKeyHint] = useState<string | null>(null);
  const [dxfPreviewRings, setDxfPreviewRings] = useState<LinearRing[]>([]);
  const [dxfHighlightRow, setDxfHighlightRow] = useState<number | null>(null);
  const [dxfError, setDxfError] = useState<string | null>(null);
  const [sourceSrid, setSourceSrid] = useState("4326");
  const dxfParsedRef = useRef<IDxf | null>(null);
  const dxfMappingRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const [geometrySlug, setGeometrySlug] = useState("");
  const [matchSlug, setMatchSlug] = useState("");
  const [desaRelationSlug, setDesaRelationSlug] = useState("");
  const [desaRowId, setDesaRowId] = useState("");
  const [desaRowLabel, setDesaRowLabel] = useState("");
  const [upsertMode, setUpsertMode] = useState<"upsert" | "insert_only">("upsert");
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);

  const geometryColumns = useMemo(
    () => columns.filter((c) => c.data_type === "geometry"),
    [columns]
  );
  const matchColumns = useMemo(
    () =>
      columns.filter((c) =>
        ["text", "number", "url"].includes(c.data_type)
      ),
    [columns]
  );
  const relationColumns = useMemo(
    () =>
      columns.filter(
        (c) =>
          c.data_type === "relation" &&
          (c.config as { is_multi?: boolean } | null)?.is_multi !== true
      ),
    [columns]
  );
  const relationTargetTableId = useMemo(() => {
    if (!desaRelationSlug) return null;
    const col = relationColumns.find((c) => c.slug === desaRelationSlug);
    return (
      (col?.config as { target_table_id?: string } | null)?.target_table_id ??
      null
    );
  }, [desaRelationSlug, relationColumns]);
  const relationTargetLabel = useMemo(() => {
    if (!relationTargetTableId) return "tabel target";
    const vt = allVirtualTables.find((t) => t.id === relationTargetTableId);
    return vt?.display_name?.trim() || "tabel target";
  }, [relationTargetTableId, allVirtualTables]);

  const matchColumnLabel = useMemo(() => {
    const col = matchColumns.find((c) => c.slug === matchSlug);
    return col?.display_name ?? matchSlug;
  }, [matchColumns, matchSlug]);

  const existingUpsertKeys = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const payload = row.payload ?? {};
      const matchNorm = normalizeVirtualTableMatchKey(payload[matchSlug]);
      if (!matchNorm) continue;
      const desaId = desaRelationSlug
        ? (payload[desaRelationSlug] as string | undefined)
        : null;
      set.add(
        bidangUpsertStorageKeyClient(
          desaRelationSlug,
          desaId,
          matchNorm
        )
      );
    }
    return set;
  }, [rows, matchSlug, desaRelationSlug]);

  const rowExistsForKey = useCallback(
    (rawKey: string) => {
      const norm = normalizeVirtualTableMatchKey(rawKey);
      if (!norm) return false;
      const storageKey = bidangUpsertStorageKeyClient(
        desaRelationSlug,
        desaRowId || null,
        norm
      );
      return existingUpsertKeys.has(storageKey);
    },
    [existingUpsertKeys, desaRelationSlug, desaRowId]
  );

  useEffect(() => {
    if (!open) return;
    setDxfRawText("");
    setDxfLayers([]);
    setDxfLayer("");
    setDxfKeyPrefix("");
    setDxfPolygonCount(0);
    setDxfMatchKeys([]);
    setDxfLabels([]);
    setDxfBulkKeyText("");
    setDxfBulkKeyHint(null);
    setDxfPreviewRings([]);
    setDxfHighlightRow(null);
    setDxfError(null);
    setSourceSrid("4326");
    setImportMsg(null);
    setDesaRowId("");
    setDesaRowLabel("");
    setTargetPickerOpen(false);
    setUpsertMode("upsert");
    dxfParsedRef.current = null;
    const geom =
      geometryColumns.find((c) => c.slug === "geom" || c.slug === "geometry") ??
      geometryColumns[0];
    setGeometrySlug(geom?.slug ?? "");
    const match =
      matchColumns.find((c) => c.slug === "no_bidang") ??
      matchColumns.find((c) => c.slug !== "title") ??
      matchColumns[0];
    setMatchSlug(match?.slug ?? "");
    setDesaRelationSlug(relationColumns[0]?.slug ?? "");
  }, [open, geometryColumns, matchColumns, relationColumns]);

  useEffect(() => {
    if (dxfPolygonCount === 0 || !dxfLayer.trim()) {
      setDxfMatchKeys([]);
      setDxfLabels([]);
      return;
    }
    setDxfMatchKeys(
      featureKeysForDxfPolygons(dxfKeyPrefix.trim(), dxfLayer, dxfPolygonCount)
    );
    setDxfLabels(Array.from({ length: dxfPolygonCount }, () => ""));
    setDxfBulkKeyHint(null);
  }, [dxfPolygonCount, dxfLayer, dxfKeyPrefix]);

  const dxfPreviewFeatureCollection = useMemo(() => {
    if (dxfPreviewRings.length === 0) {
      return { fc: null as GeoJSON.FeatureCollection | null, err: null as string | null };
    }
    const srid = Number.parseInt(sourceSrid.trim(), 10);
    if (!Number.isFinite(srid) || !isPreviewSourceSridSupported(srid)) {
      return {
        fc: null,
        err: "SRID sumber tidak didukung untuk pratinjau peta.",
      };
    }
    try {
      const fc = dxfRingsToWgs84PreviewFeatureCollection(dxfPreviewRings, srid);
      return { fc, err: null };
    } catch (e) {
      return {
        fc: null,
        err:
          e instanceof Error
            ? e.message
            : "Gagal memproyeksikan koordinat untuk pratinjau.",
      };
    }
  }, [dxfPreviewRings, sourceSrid]);

  useEffect(() => {
    setDxfHighlightRow(null);
  }, [dxfPolygonCount, dxfLayer]);

  useEffect(() => {
    if (dxfHighlightRow == null) return;
    const el = dxfMappingRowRefs.current[dxfHighlightRow];
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [dxfHighlightRow]);

  const handleDxfFile = useCallback((file: File | undefined) => {
    if (!file) {
      setDxfRawText("");
      setDxfLayers([]);
      setDxfLayer("");
      setDxfPolygonCount(0);
      setDxfPreviewRings([]);
      dxfParsedRef.current = null;
      setDxfError(null);
      return;
    }
    setImportMsg(null);
    setDxfError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      if (raw.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
        setDxfRawText("");
        setDxfLayers([]);
        setDxfLayer("");
        setDxfPolygonCount(0);
        setDxfPreviewRings([]);
        dxfParsedRef.current = null;
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
    reader.onerror = () => setDxfError("Gagal membaca file DXF.");
    reader.readAsText(file);
  }, []);

  const runImport = useCallback(() => {
    if (!dxfRawText.trim() || !dxfLayer.trim() || dxfPolygonCount === 0) {
      setImportMsg("Pilih file DXF dan layer dengan poligon tertutup.");
      return;
    }
    if (!geometrySlug || !matchSlug) {
      setImportMsg("Pilih kolom geometri dan kolom kunci pencocokan.");
      return;
    }
    if (desaRelationSlug && !desaRowId) {
      setImportMsg(
        `Pilih baris ${relationTargetLabel} untuk file ini (satu file = satu relasi).`
      );
      return;
    }
    if (
      dxfMatchKeys.length !== dxfPolygonCount ||
      !dxfMatchKeys.every((k) => k.trim())
    ) {
      setImportMsg("Isi semua kunci pencocokan di tabel mapping.");
      return;
    }
    setImportMsg(null);
    const fd = new FormData();
    fd.set("table_id", table.id);
    fd.set("dxf_text", dxfRawText);
    fd.set("layer_name", dxfLayer);
    fd.set("source_srid", sourceSrid);
    fd.set("geometry_column_slug", geometrySlug);
    fd.set("match_column_slug", matchSlug);
    fd.set("upsert_mode", upsertMode);
    fd.set(
      "match_keys_json",
      JSON.stringify(dxfMatchKeys.map((k) => k.trim()))
    );
    fd.set(
      "match_labels_json",
      JSON.stringify(dxfLabels.map((lb) => lb.trim()))
    );
    if (desaRelationSlug && desaRowId) {
      fd.set("desa_relation_column_slug", desaRelationSlug);
      fd.set("desa_target_row_id", desaRowId);
      fd.set("desa_source_mode", "fixed");
    }
    startImportTransition(async () => {
      const r = await importVirtualRowsDxfBatchAction(fd);
      if (r.error) {
        setImportMsg(r.error);
        return;
      }
      const skipText =
        r.skippedExisting > 0
          ? ` ${r.skippedExisting} sudah ada (lewati).`
          : "";
      const failText =
        r.failed > 0
          ? ` Gagal ${r.failed}${r.failureSamples.length > 0 ? ` (${r.failureSamples.slice(0, 3).join("; ")})` : ""}.`
          : "";
      setImportMsg(
        `Berhasil: ${r.inserted} baru, ${r.updated} diperbarui.${skipText}${failText}`
      );
      if (r.inserted > 0 || r.updated > 0) {
        onImported();
      }
    });
  }, [
    dxfRawText,
    dxfLayer,
    dxfPolygonCount,
    geometrySlug,
    matchSlug,
    upsertMode,
    desaRelationSlug,
    desaRowId,
    relationTargetLabel,
    dxfMatchKeys,
    dxfLabels,
    sourceSrid,
    table.id,
    onImported,
  ]);

  const canImport =
    !importPending &&
    !dxfError &&
    dxfRawText.trim() &&
    dxfLayer.trim() &&
    dxfPolygonCount > 0 &&
    dxfMatchKeys.length === dxfPolygonCount &&
    dxfMatchKeys.every((k) => k.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Impor DXF ke {table.display_name}</DialogTitle>
          <DialogDescription>
            Satu poligon tertutup di layer DXF → satu baris. Kunci upsert memakai
            kolom <span className="font-mono">{matchSlug || "…"}</span>
            {desaRelationSlug ? (
              <>
                {" "}
                + relasi <span className="font-mono">{desaRelationSlug}</span>
              </>
            ) : null}
            . Koordinat ditransform ke WGS84 sebelum disimpan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <Label htmlFor="dxf-vt-file">File DXF</Label>
            <Input
              id="dxf-vt-file"
              type="file"
              accept=".dxf,text/plain,application/dxf,application/x-dxf"
              className="mt-1"
              disabled={importPending}
              onChange={(e) => {
                handleDxfFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              LWPOLYLINE / POLYLINE tertutup, INSERT blok, atau HATCH. Batas teks ~
              {MAX_SPATIAL_GEOMETRY_TEXT_MB} MB.
            </p>
          </div>

          {dxfError ? (
            <p className="text-xs text-red-600" role="alert">
              {dxfError}
            </p>
          ) : null}

          {dxfLayers.length > 0 ? (
            <div>
              <Label htmlFor="dxf-vt-layer">Layer</Label>
              <select
                id="dxf-vt-layer"
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
                disabled={importPending}
              >
                {dxfLayers.map((ly) => (
                  <option key={ly} value={ly}>
                    {ly}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="dxf-vt-geom-col">Kolom geometri</Label>
              <select
                id="dxf-vt-geom-col"
                value={geometrySlug}
                onChange={(e) => setGeometrySlug(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                disabled={importPending}
              >
                {geometryColumns.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.display_name} ({c.slug})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="dxf-vt-match-col">Kolom kunci (upsert)</Label>
              <select
                id="dxf-vt-match-col"
                value={matchSlug}
                onChange={(e) => setMatchSlug(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                disabled={importPending}
              >
                {matchColumns.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.display_name} ({c.slug})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {relationColumns.length > 0 ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
              <div>
                <Label htmlFor="dxf-vt-relation-col">Kolom relasi</Label>
                <select
                  id="dxf-vt-relation-col"
                  value={desaRelationSlug}
                  onChange={(e) => {
                    setDesaRelationSlug(e.target.value);
                    setDesaRowId("");
                    setDesaRowLabel("");
                  }}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  disabled={importPending}
                >
                  {!relationColumns.some((c) => c.is_required) ? (
                    <option value="">— Opsional —</option>
                  ) : null}
                  {relationColumns.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.display_name}
                    </option>
                  ))}
                </select>
              </div>
              {desaRelationSlug && relationTargetTableId ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTargetPickerOpen(true)}
                    disabled={importPending}
                  >
                    Pilih {relationTargetLabel}…
                  </Button>
                  {desaRowLabel ? (
                    <span className="text-xs text-muted-foreground">
                      {desaRowLabel}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-700">
                      Belum dipilih (wajib untuk file ini)
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="dxf-vt-srid">EPSG/SRID sumber</Label>
              <select
                id="dxf-vt-srid"
                value={sourceSrid}
                onChange={(e) => setSourceSrid(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                disabled={importPending}
              >
                {VIRTUAL_TABLE_DXF_SOURCE_SRID_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="dxf-vt-upsert">Mode impor</Label>
              <select
                id="dxf-vt-upsert"
                value={upsertMode}
                onChange={(e) =>
                  setUpsertMode(e.target.value as "upsert" | "insert_only")
                }
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                disabled={importPending}
              >
                <option value="upsert">Upsert (baru + perbarui)</option>
                <option value="insert_only">Hanya baris baru</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="dxf-vt-prefix">Prefix kunci (opsional)</Label>
            <Input
              id="dxf-vt-prefix"
              value={dxfKeyPrefix}
              onChange={(e) => setDxfKeyPrefix(e.target.value)}
              placeholder="contoh: BAB-"
              className="mt-1 font-mono text-sm"
              disabled={importPending}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Default:{" "}
              <span className="font-mono text-[10px]">
                {"{prefix}{layer-slug}-{n}"}
              </span>
              . Edit per baris agar cocok dengan nomor bidang lapangan.
            </p>
          </div>

          {dxfPolygonCount > 0 && dxfLayer ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-xs font-medium">
                Mapping {matchColumnLabel} ({dxfPolygonCount} poligon)
              </p>
              {dxfPreviewFeatureCollection.err ? (
                <p className="text-xs text-amber-700" role="status">
                  {dxfPreviewFeatureCollection.err} Tabel mapping tetap bisa dipakai.
                </p>
              ) : null}
              <DxfMappingPreviewMap
                featureCollection={dxfPreviewFeatureCollection.fc}
                highlightIndex={dxfHighlightRow}
                onSelectPolygon={setDxfHighlightRow}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    const csv = virtualTableDxfKeyMappingTemplateCsv(matchSlug);
                    const blob = new Blob([csv], {
                      type: "text/csv;charset=utf-8",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `template-mapping-dxf-${matchSlug}.csv`;
                    a.rel = "noopener";
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Unduh template CSV
                </Button>
              </div>
              <div className="rounded-md border border-border bg-muted/25 px-3 py-2">
                <Label className="text-xs">Tempel daftar kunci (satu per baris)</Label>
                <Textarea
                  value={dxfBulkKeyText}
                  onChange={(e) => {
                    setDxfBulkKeyText(e.target.value);
                    setDxfBulkKeyHint(null);
                  }}
                  placeholder="BAB-001\nBAB-002"
                  rows={3}
                  className="mt-2 font-mono text-[11px]"
                  disabled={importPending}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-2 h-8 text-xs"
                  disabled={importPending}
                  onClick={() => {
                    const lines = dxfBulkKeyText
                      .split(/\r?\n/)
                      .map((s) => s.trim())
                      .filter((s) => s.length > 0);
                    if (lines.length === 0) {
                      setDxfBulkKeyHint("Tidak ada baris non-kosong.");
                      return;
                    }
                    const n = dxfPolygonCount;
                    setDxfMatchKeys((prev) => {
                      const next = [...prev];
                      const take = Math.min(lines.length, next.length);
                      for (let i = 0; i < take; i++) next[i] = lines[i]!;
                      return next;
                    });
                    setDxfBulkKeyHint(
                      lines.length >= n
                        ? `Mengisi ${n} baris pertama.`
                        : `Mengisi ${lines.length} baris; sisanya edit manual.`
                    );
                  }}
                >
                  Terapkan ke tabel
                </Button>
                {dxfBulkKeyHint ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {dxfBulkKeyHint}
                  </p>
                ) : null}
              </div>
              <div className="max-h-52 overflow-y-auto rounded-md border border-border">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="sticky top-0 border-b border-border bg-muted/80 text-muted-foreground">
                      <th className="w-10 px-2 py-1.5">#</th>
                      <th className="w-[5.5rem] px-2 py-1.5">Baris</th>
                      <th className="min-w-[8rem] px-2 py-1.5">
                        {matchColumnLabel}
                      </th>
                      <th className="min-w-[7rem] px-2 py-1.5">Judul (opsional)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dxfMatchKeys.map((key, idx) => (
                      <tr
                        key={`dxf-vt-${idx}`}
                        ref={(el) => {
                          dxfMappingRowRefs.current[idx] = el;
                        }}
                        onClick={(e) => {
                          if (
                            (e.target as HTMLElement).closest(
                              "input, textarea, button, select"
                            )
                          ) {
                            return;
                          }
                          setDxfHighlightRow(idx);
                        }}
                        className={cn(
                          "border-b border-border/60 last:border-0",
                          dxfHighlightRow === idx
                            ? "bg-orange-500/12 ring-1 ring-orange-500/35 ring-inset"
                            : "cursor-pointer hover:bg-muted/45"
                        )}
                      >
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {idx + 1}
                        </td>
                        <td className="px-2 py-1.5">
                          {rowExistsForKey(key) ? (
                            <span className="font-medium text-amber-800 dark:text-amber-400">
                              Update
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Baru</span>
                          )}
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
                            disabled={importPending}
                          />
                        </td>
                        <td className="px-1 py-0.5">
                          <Input
                            value={dxfLabels[idx] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDxfLabels((prev) => {
                                const next = [...prev];
                                next[idx] = v;
                                return next;
                              });
                            }}
                            className="h-8 text-[11px]"
                            placeholder={`DXF ${dxfLayer} #${idx + 1}`}
                            disabled={importPending}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {importMsg ? (
            <p
              className={cn(
                "text-xs",
                importMsg.startsWith("Berhasil")
                  ? "text-emerald-700"
                  : "text-red-600"
              )}
              role="status"
            >
              {importMsg}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={importPending}
            >
              Tutup
            </Button>
            <Button type="button" disabled={!canImport} onClick={runImport}>
              {importPending ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Mengimpor…
                </>
              ) : (
                "Impor"
              )}
            </Button>
          </div>
        </div>

        {relationTargetTableId ? (
          <RelationTargetPickerDialog
            open={targetPickerOpen}
            onOpenChange={setTargetPickerOpen}
            targetTableId={relationTargetTableId}
            title={`Pilih baris — ${relationTargetLabel}`}
            description="Ketik untuk memfilter daftar."
            selectedId={desaRowId || undefined}
            onSelect={(row) => {
              setDesaRowId(row.id);
              setDesaRowLabel(row.label);
            }}
            onClear={() => {
              setDesaRowId("");
              setDesaRowLabel("");
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
