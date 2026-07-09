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
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { RelationTargetPickerDialog } from "@/components/relation-target-picker-dialog";
import { cn } from "@/lib/utils";
import type { LinearRing } from "@/lib/dxf-import-utils";
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
  buildBidangPolygonsFromPoints,
  detectPointsImportColumns,
  MAX_SURVEY_POINTS_ROWS,
  parseCsvHeaderNames,
  parseSurveyPointsCsv,
  surveyPointsTemplateCsv,
  type BidangPolygonBuild,
  type PointsImportColumnMap,
} from "@/lib/points-to-polygon-import";
import {
  normalizeVirtualTableMatchKey,
  pickDefaultVirtualTableMatchColumn,
} from "@/lib/virtual-table-geojson-import";
import {
  VIRTUAL_TABLE_POINTS_SOURCE_SRID_OPTIONS,
} from "@/lib/virtual-table-points-import";
import type {
  VirtualColumnRow,
  VirtualDataRow,
  VirtualTableRow,
} from "./virtual-table-types";
import { importVirtualRowsPointsBatchAction } from "./virtual-table-actions";
import { ImportDialogShell } from "./import-dialog-shell";

const DxfMappingPreviewMap = dynamic(
  () =>
    import("./dxf-mapping-preview-map").then((m) => m.DxfMappingPreviewMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 animate-pulse rounded-md bg-muted" />
    ),
  }
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

function identityOrder(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

export function VirtualTablePointsImportDialog({
  open,
  onOpenChange,
  table,
  columns,
  allVirtualTables,
  rows,
  onImported,
  embedded = false,
  cancelLabel = "Tutup",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: VirtualTableRow;
  columns: VirtualColumnRow[];
  allVirtualTables: VirtualTableRow[];
  rows: VirtualDataRow[];
  onImported: () => void;
  embedded?: boolean;
  cancelLabel?: string;
}) {
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importPending, startImportTransition] = useTransition();
  const [csvText, setCsvText] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<PointsImportColumnMap | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [polygons, setPolygons] = useState<BidangPolygonBuild[]>([]);
  const [pointOrderByBidang, setPointOrderByBidang] = useState<
    Record<string, number[]>
  >({});
  const [matchKeys, setMatchKeys] = useState<string[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [highlightRow, setHighlightRow] = useState<number | null>(null);
  const [sourceSrid, setSourceSrid] = useState("32748");
  const mappingRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const [geometrySlug, setGeometrySlug] = useState("");
  const [matchSlug, setMatchSlug] = useState("");
  const [desaRelationSlug, setDesaRelationSlug] = useState("");
  const [desaRowId, setDesaRowId] = useState("");
  const [desaRowLabel, setDesaRowLabel] = useState("");
  const [upsertMode, setUpsertMode] = useState<"upsert" | "insert_only">(
    "upsert"
  );
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
        bidangUpsertStorageKeyClient(desaRelationSlug, desaId, matchNorm)
      );
    }
    return set;
  }, [rows, matchSlug, desaRelationSlug]);

  const rowExistsForKey = useCallback(
    (rawKey: string) => {
      const norm = normalizeVirtualTableMatchKey(rawKey);
      if (!norm) return false;
      return existingUpsertKeys.has(
        bidangUpsertStorageKeyClient(
          desaRelationSlug,
          desaRowId || null,
          norm
        )
      );
    },
    [existingUpsertKeys, desaRelationSlug, desaRowId]
  );

  useEffect(() => {
    if (!open) return;
    setCsvText("");
    setCsvHeaders([]);
    setColumnMap(null);
    setParseError(null);
    setPolygons([]);
    setPointOrderByBidang({});
    setMatchKeys([]);
    setLabels([]);
    setHighlightRow(null);
    setSourceSrid("32748");
    setImportMsg(null);
    setDesaRowId("");
    setDesaRowLabel("");
    setTargetPickerOpen(false);
    setUpsertMode("upsert");
    const geom =
      geometryColumns.find((c) => c.slug === "geom" || c.slug === "geometry") ??
      geometryColumns[0];
    setGeometrySlug(geom?.slug ?? "");
    const match = pickDefaultVirtualTableMatchColumn(matchColumns);
    setMatchSlug(match?.slug ?? "");
    const requiredRel = relationColumns.find((c) => c.is_required);
    setDesaRelationSlug(requiredRel?.slug ?? "");
  }, [open, geometryColumns, matchColumns, relationColumns]);

  const rebuildPolygons = useCallback(
    (raw: string, map: PointsImportColumnMap, orders: Record<string, number[]>) => {
      const { points, errors: pointErrors } = parseSurveyPointsCsv(raw, map);
      if (points.length > MAX_SURVEY_POINTS_ROWS) {
        setParseError(
          `Terlalu banyak baris titik (${points.length}). Maks. ${MAX_SURVEY_POINTS_ROWS}.`
        );
        setPolygons([]);
        return;
      }
      const { polygons: built, errors: buildErrors } = buildBidangPolygonsFromPoints(
        points,
        map,
        orders
      );
      const allErrors = [...pointErrors, ...buildErrors];
      setPolygons(built);
      setParseError(allErrors.length > 0 ? allErrors.slice(0, 5).join(" ") : null);
      setMatchKeys(built.map((p) => p.bidangKey));
      setLabels(built.map((p) => `Bidang ${p.bidangKey}`));
    },
    []
  );

  const applyCsv = useCallback(
    (raw: string) => {
      setCsvText(raw);
      if (!raw.trim()) {
        setCsvHeaders([]);
        setColumnMap(null);
        setPolygons([]);
        setParseError(null);
        return;
      }
      if (raw.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
        setParseError(spatialGeometryTextTooLargeMessage("CSV titik"));
        setPolygons([]);
        return;
      }
      const headers = parseCsvHeaderNames(raw);
      setCsvHeaders(headers);
      const detected = detectPointsImportColumns(headers);
      if (!detected.ok) {
        setColumnMap(null);
        setParseError(detected.error);
        setPolygons([]);
        return;
      }
      setColumnMap(detected.map);
      const { points } = parseSurveyPointsCsv(raw, detected.map);
      const orders: Record<string, number[]> = {};
      const byBidang = new Map<string, number>();
      for (const p of points) {
        const n = byBidang.get(p.bidangKey) ?? 0;
        byBidang.set(p.bidangKey, n + 1);
      }
      for (const [key, count] of byBidang) {
        orders[key] = identityOrder(count);
      }
      setPointOrderByBidang(orders);
      rebuildPolygons(raw, detected.map, orders);
    },
    [rebuildPolygons]
  );

  useEffect(() => {
    if (!columnMap || !csvText.trim()) return;
    rebuildPolygons(csvText, columnMap, pointOrderByBidang);
  }, [columnMap, csvText, pointOrderByBidang, rebuildPolygons]);

  const previewRings: LinearRing[] = useMemo(
    () => polygons.map((p) => p.ring),
    [polygons]
  );

  const previewFeatureCollection = useMemo(() => {
    if (previewRings.length === 0) {
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
      const fc = dxfRingsToWgs84PreviewFeatureCollection(previewRings, srid);
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
  }, [previewRings, sourceSrid]);

  const highlightedPolygon =
    highlightRow != null ? polygons[highlightRow] ?? null : null;

  const movePoint = useCallback(
    (bidangKey: string, pos: number, direction: -1 | 1) => {
      setPointOrderByBidang((prev) => {
        const order = [...(prev[bidangKey] ?? [])];
        const target = pos + direction;
        if (target < 0 || target >= order.length) return prev;
        const tmp = order[pos]!;
        order[pos] = order[target]!;
        order[target] = tmp;
        return { ...prev, [bidangKey]: order };
      });
    },
    []
  );

  const runImport = useCallback(() => {
    if (!csvText.trim() || !columnMap || polygons.length === 0) {
      setImportMsg("Tempel CSV titik dengan minimal no_bidang, x, y.");
      return;
    }
    if (polygons.some((p) => p.selfIntersect)) {
      setImportMsg(
        "Ada bidang self-intersect. Perbaiki urutan titik sebelum impor."
      );
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
      matchKeys.length !== polygons.length ||
      !matchKeys.every((k) => k.trim())
    ) {
      setImportMsg("Isi semua kunci pencocokan di tabel mapping.");
      return;
    }
    setImportMsg(null);
    const fd = new FormData();
    fd.set("table_id", table.id);
    fd.set("points_csv_text", csvText);
    fd.set("column_no_bidang", columnMap.noBidang);
    fd.set("column_x", columnMap.x);
    fd.set("column_y", columnMap.y);
    if (columnMap.urutan) fd.set("column_urutan", columnMap.urutan);
    if (columnMap.namaTitik) fd.set("column_nama_titik", columnMap.namaTitik);
    fd.set("point_order_json", JSON.stringify(pointOrderByBidang));
    fd.set("source_srid", sourceSrid);
    fd.set("geometry_column_slug", geometrySlug);
    fd.set("match_column_slug", matchSlug);
    fd.set("upsert_mode", upsertMode);
    fd.set("match_keys_json", JSON.stringify(matchKeys.map((k) => k.trim())));
    fd.set("match_labels_json", JSON.stringify(labels.map((lb) => lb.trim())));
    if (desaRelationSlug && desaRowId) {
      fd.set("desa_relation_column_slug", desaRelationSlug);
      fd.set("desa_target_row_id", desaRowId);
      fd.set("desa_source_mode", "fixed");
    }
    startImportTransition(async () => {
      const r = await importVirtualRowsPointsBatchAction(fd);
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
    csvText,
    columnMap,
    polygons,
    geometrySlug,
    matchSlug,
    upsertMode,
    desaRelationSlug,
    desaRowId,
    relationTargetLabel,
    matchKeys,
    labels,
    pointOrderByBidang,
    sourceSrid,
    table.id,
    onImported,
  ]);

  const canImport =
    !importPending &&
    !parseError?.includes("Terlalu banyak") &&
    csvText.trim() &&
    columnMap &&
    polygons.length > 0 &&
    !polygons.some((p) => p.selfIntersect) &&
    matchKeys.length === polygons.length &&
    matchKeys.every((k) => k.trim());

  const updateColumn = (
    key: keyof PointsImportColumnMap,
    header: string
  ) => {
    if (!columnMap) return;
    const next = { ...columnMap, [key]: header || undefined };
    if (!next.noBidang || !next.x || !next.y) return;
    setColumnMap(next as PointsImportColumnMap);
  };

  return (
    <ImportDialogShell
      embedded={embedded}
      open={open}
      onOpenChange={onOpenChange}
      title={`Bidang dari titik → ${table.display_name}`}
      description={
        <>
          Tempel CSV koordinat lapangan (no_bidang, x, y). Sistem membentuk
          poligon per bidang dan menyimpan ke kolom geometri. Kunci upsert:{" "}
          <span className="font-mono">{matchSlug || "…"}</span>.
        </>
      }
    >
      <div>
        <Label htmlFor="points-vt-file">File CSV titik</Label>
        <Input
          id="points-vt-file"
          type="file"
          accept=".csv,text/csv,text/plain"
          className="mt-1"
          disabled={importPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) {
              applyCsv("");
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              applyCsv(typeof reader.result === "string" ? reader.result : "");
            };
            reader.onerror = () => setParseError("Gagal membaca file CSV.");
            reader.readAsText(file);
          }}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Atau tempel di bawah. Kolom wajib: no_bidang, x, y. Opsional:
          urutan, nama_titik. Batas ~{MAX_SPATIAL_GEOMETRY_TEXT_MB} MB.
        </p>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="points-vt-csv">Data CSV</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              const blob = new Blob([surveyPointsTemplateCsv()], {
                type: "text/csv;charset=utf-8",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "template-bidang-dari-titik.csv";
              a.rel = "noopener";
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}
          >
            Unduh template
          </Button>
        </div>
        <Textarea
          id="points-vt-csv"
          value={csvText}
          onChange={(e) => applyCsv(e.target.value)}
          rows={6}
          className="mt-1 font-mono text-[11px]"
          placeholder="no_bidang,x,y,urutan,nama_titik&#10;BAB-001,500100,9876500,1,T1"
          disabled={importPending}
        />
      </div>

      {parseError ? (
        <p className="text-xs text-amber-700" role="status">
          {parseError}
        </p>
      ) : null}

      {csvHeaders.length > 0 && columnMap ? (
        <div className="grid gap-2 rounded-md border border-border bg-muted/15 p-3 sm:grid-cols-2">
          <p className="col-span-full text-xs font-medium">Pemetaan kolom CSV</p>
          {(
            [
              ["noBidang", "no_bidang", true],
              ["x", "x", true],
              ["y", "y", true],
              ["urutan", "urutan", false],
              ["namaTitik", "nama_titik", false],
            ] as const
          ).map(([key, label, required]) => (
            <div key={key}>
              <Label className="text-xs">
                {label}
                {required ? " *" : ""}
              </Label>
              <select
                value={columnMap[key] ?? ""}
                onChange={(e) =>
                  updateColumn(key, e.target.value)
                }
                className="mt-1 flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                disabled={importPending}
              >
                {!required ? <option value="">—</option> : null}
                {csvHeaders.map((h) => (
                  <option key={`${key}-${h}`} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="points-vt-geom-col">Kolom geometri</Label>
          <select
            id="points-vt-geom-col"
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
          <Label htmlFor="points-vt-match-col">Kolom kunci (upsert)</Label>
          <select
            id="points-vt-match-col"
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
            <Label htmlFor="points-vt-relation-col">Kolom relasi</Label>
            <select
              id="points-vt-relation-col"
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
          <Label htmlFor="points-vt-srid">EPSG/SRID sumber</Label>
          <select
            id="points-vt-srid"
            value={sourceSrid}
            onChange={(e) => setSourceSrid(e.target.value)}
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            disabled={importPending}
          >
            {VIRTUAL_TABLE_POINTS_SOURCE_SRID_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="points-vt-upsert">Mode impor</Label>
          <select
            id="points-vt-upsert"
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

      {polygons.length > 0 ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-xs font-medium">
            {polygons.length} bidang dari titik
          </p>
          {previewFeatureCollection.err ? (
            <p className="text-xs text-amber-700" role="status">
              {previewFeatureCollection.err}
            </p>
          ) : null}
          <DxfMappingPreviewMap
            featureCollection={previewFeatureCollection.fc}
            highlightIndex={highlightRow}
            onSelectPolygon={setHighlightRow}
          />

          {highlightedPolygon ? (
            <div className="rounded-md border border-border bg-muted/20 p-2">
              <p className="text-xs font-medium">
                Urutan titik: {highlightedPolygon.bidangKey} (
                {highlightedPolygon.points.length} titik)
                {highlightedPolygon.selfIntersect ? (
                  <span className="ml-2 text-red-600">self-intersect</span>
                ) : null}
              </p>
              <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs">
                {highlightedPolygon.points.map((pt, i) => (
                  <li
                    key={`${pt.csvRow}-${i}`}
                    className="flex items-center gap-2 rounded bg-background/80 px-2 py-1"
                  >
                    <span className="w-6 text-muted-foreground">{i + 1}.</span>
                    <span className="min-w-0 flex-1 font-mono text-[10px]">
                      {pt.namaTitik ? `${pt.namaTitik} · ` : ""}
                      {pt.x.toFixed(3)}, {pt.y.toFixed(3)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={i === 0 || importPending}
                      onClick={() =>
                        movePoint(highlightedPolygon.bidangKey, i, -1)
                      }
                      aria-label="Naikkan titik"
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={
                        i === highlightedPolygon.points.length - 1 ||
                        importPending
                      }
                      onClick={() =>
                        movePoint(highlightedPolygon.bidangKey, i, 1)
                      }
                      aria-label="Turunkan titik"
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="max-h-52 overflow-y-auto rounded-md border border-border">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="sticky top-0 border-b border-border bg-muted/80 text-muted-foreground">
                  <th className="w-10 px-2 py-1.5">#</th>
                  <th className="w-[5.5rem] px-2 py-1.5">Baris</th>
                  <th className="min-w-[8rem] px-2 py-1.5">
                    {matchColumnLabel}
                  </th>
                  <th className="w-14 px-2 py-1.5">Titik</th>
                  <th className="min-w-[7rem] px-2 py-1.5">Judul</th>
                </tr>
              </thead>
              <tbody>
                {matchKeys.map((key, idx) => (
                  <tr
                    key={`points-vt-${idx}`}
                    ref={(el) => {
                      mappingRowRefs.current[idx] = el;
                    }}
                    onClick={(e) => {
                      if (
                        (e.target as HTMLElement).closest(
                          "input, textarea, button, select"
                        )
                      ) {
                        return;
                      }
                      setHighlightRow(idx);
                    }}
                    className={cn(
                      "border-b border-border/60 last:border-0",
                      highlightRow === idx
                        ? "bg-orange-500/12 ring-1 ring-orange-500/35 ring-inset"
                        : "cursor-pointer hover:bg-muted/45",
                      polygons[idx]?.selfIntersect && "bg-red-500/5"
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
                          setMatchKeys((prev) => {
                            const next = [...prev];
                            next[idx] = v;
                            return next;
                          });
                        }}
                        className="h-8 font-mono text-[11px]"
                        disabled={importPending}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {polygons[idx]?.points.length ?? 0}
                    </td>
                    <td className="px-1 py-0.5">
                      <Input
                        value={labels[idx] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLabels((prev) => {
                            const next = [...prev];
                            next[idx] = v;
                            return next;
                          });
                        }}
                        className="h-8 text-[11px]"
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
            importMsg.startsWith("Berhasil") ? "text-green-700" : "text-red-600"
          )}
          role="status"
        >
          {importMsg}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={importPending}
        >
          {cancelLabel}
        </Button>
        <Button type="button" onClick={runImport} disabled={!canImport}>
          {importPending ? (
            <>
              <Spinner className="mr-2 size-4" />
              Mengimpor…
            </>
          ) : (
            "Impor bidang"
          )}
        </Button>
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
            setTargetPickerOpen(false);
          }}
          onClear={() => {
            setDesaRowId("");
            setDesaRowLabel("");
          }}
        />
      ) : null}
    </ImportDialogShell>
  );
}
