"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  MAX_SPATIAL_GEOMETRY_TEXT_CHARS,
  MAX_SPATIAL_GEOMETRY_TEXT_MB,
  spatialGeometryTextTooLargeMessage,
} from "@/lib/spatial-import-limits";
import {
  detectPointsImportColumns,
  MAX_SURVEY_POINTS_ROWS,
  parseCsvHeaderNames,
  parseSurveyPointsCsv,
  surveyPointsTemplateCsv,
  type PointsImportColumnMap,
} from "@/lib/points-to-polygon-import";
import { isPreviewSourceSridSupported } from "@/lib/crs-reproject";
import { buildSurveyPointsArchiveFeatureCollection } from "@/lib/virtual-table-survey-points-archive";
import { SURVEY_POINTS_ARCHIVE_SOURCE_SRID_OPTIONS } from "@/lib/virtual-table-survey-points-archive";
import {
  SURVEY_POINT_GEOM_SLUG,
  SURVEY_POINT_MATCH_COLUMN_SLUG,
} from "@/lib/virtual-table-survey-points-bootstrap";
import type { VirtualColumnRow, VirtualTableRow } from "./virtual-table-types";
import { importVirtualRowsSurveyPointsArchiveAction } from "./virtual-table-actions";
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: VirtualTableRow;
  columns: VirtualColumnRow[];
  onImported: () => void;
  embedded?: boolean;
  cancelLabel?: string;
};

export function VirtualTableSurveyPointsArchiveDialog({
  open,
  onOpenChange,
  table,
  columns,
  onImported,
  embedded = false,
  cancelLabel = "Tutup",
}: Props) {
  const [importPending, startImportTransition] = useTransition();
  const [csvText, setCsvText] = useState("");
  const [columnMap, setColumnMap] = useState<PointsImportColumnMap | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [sourceSrid, setSourceSrid] = useState("4326");
  const [geometrySlug, setGeometrySlug] = useState(SURVEY_POINT_GEOM_SLUG);
  const [matchSlug, setMatchSlug] = useState(SURVEY_POINT_MATCH_COLUMN_SLUG);
  const [upsertMode, setUpsertMode] = useState<"upsert" | "insert_only">(
    "upsert"
  );

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

  const { points, pointCount, bidangCount } = useMemo(() => {
    if (!columnMap || !csvText.trim()) {
      return { points: [], pointCount: 0, bidangCount: 0 };
    }
    const { points: parsed, errors } = parseSurveyPointsCsv(csvText, columnMap);
    const keys = new Set(parsed.map((p) => p.bidangKey));
    return {
      points: parsed,
      pointCount: parsed.length,
      bidangCount: keys.size,
      parseErrors: errors,
    };
  }, [csvText, columnMap]);

  const previewFc = useMemo(() => {
    if (points.length === 0 || !matchSlug) return null;
    const srid = Number(sourceSrid);
    if (!Number.isFinite(srid) || !isPreviewSourceSridSupported(srid)) {
      return null;
    }
    try {
      return buildSurveyPointsArchiveFeatureCollection(
        points,
        matchSlug,
        srid
      );
    } catch {
      return null;
    }
  }, [points, matchSlug, sourceSrid]);

  useEffect(() => {
    if (!open) return;
    setCsvText("");
    setColumnMap(null);
    setParseError(null);
    setImportMsg(null);
    setSourceSrid("4326");
    setUpsertMode("upsert");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const geom =
      geometryColumns.find((c) => c.slug === SURVEY_POINT_GEOM_SLUG) ??
      geometryColumns[0];
    setGeometrySlug(geom?.slug ?? SURVEY_POINT_GEOM_SLUG);
    const match =
      matchColumns.find((c) => c.slug === SURVEY_POINT_MATCH_COLUMN_SLUG) ??
      matchColumns[0];
    setMatchSlug(match?.slug ?? SURVEY_POINT_MATCH_COLUMN_SLUG);
  }, [open, geometryColumns, matchColumns]);

  const applyCsv = useCallback((raw: string) => {
    setCsvText(raw);
    setImportMsg(null);
    if (!raw.trim()) {
      setColumnMap(null);
      setParseError(null);
      return;
    }
    if (raw.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
      setParseError(spatialGeometryTextTooLargeMessage("CSV titik"));
      setColumnMap(null);
      return;
    }
    const headers = parseCsvHeaderNames(raw);
    const detected = detectPointsImportColumns(headers);
    if (!detected.ok) {
      setParseError(detected.error);
      setColumnMap(null);
      return;
    }
    const { points: parsed, errors } = parseSurveyPointsCsv(
      raw,
      detected.map
    );
    if (parsed.length > MAX_SURVEY_POINTS_ROWS) {
      setParseError(
        `Terlalu banyak titik (${parsed.length}). Maks. ${MAX_SURVEY_POINTS_ROWS} per impor.`
      );
      setColumnMap(detected.map);
      return;
    }
    setColumnMap(detected.map);
    setParseError(errors[0] ?? null);
  }, []);

  const runImport = useCallback(() => {
    if (!csvText.trim() || !columnMap || points.length === 0) {
      setImportMsg("Tempel CSV titik dengan minimal no_bidang, x, y.");
      return;
    }
    if (!geometrySlug || !matchSlug) {
      setImportMsg("Pilih kolom geometri titik dan kolom kunci (kode_titik).");
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
    fd.set("source_srid", sourceSrid);
    fd.set("geometry_column_slug", geometrySlug);
    fd.set("match_column_slug", matchSlug);
    fd.set("upsert_mode", upsertMode);
    startImportTransition(async () => {
      const r = await importVirtualRowsSurveyPointsArchiveAction(fd);
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
        `Tersimpan: ${r.inserted} baru, ${r.updated} diperbarui.${skipText}${failText}`
      );
      if (r.inserted > 0 || r.updated > 0) {
        onImported();
      }
    });
  }, [
    csvText,
    columnMap,
    points.length,
    geometrySlug,
    matchSlug,
    upsertMode,
    sourceSrid,
    table.id,
    onImported,
  ]);

  const canImport =
    !importPending &&
    !parseError?.includes("Terlalu banyak") &&
    csvText.trim() &&
    columnMap &&
    points.length > 0;

  return (
    <ImportDialogShell
      embedded={embedded}
      open={open}
      onOpenChange={onOpenChange}
      title={`Arsip titik ukur → ${table.display_name}`}
      description={
        <>
          Simpan titik lapangan sebagai <strong>Point</strong> (arsip mentah) —
          tanpa membentuk poligon. Kunci upsert per titik:{" "}
          <span className="font-mono">{matchSlug || "kode_titik"}</span> (
          no_bidang + urutan).
        </>
      }
    >
      <div>
        <Label htmlFor="archive-points-file">File CSV titik</Label>
        <Input
          id="archive-points-file"
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
          Kolom wajib: no_bidang, x, y. Opsional: urutan, nama_titik. Batas ~
          {MAX_SPATIAL_GEOMETRY_TEXT_MB} MB.
        </p>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="archive-points-csv">Data CSV</Label>
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
              a.download = "template-titik-ukur.csv";
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
          id="archive-points-csv"
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

      {pointCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {pointCount} titik · {bidangCount} bidang (grup no_bidang)
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="archive-srid">EPSG sumber</Label>
          <select
            id="archive-srid"
            value={sourceSrid}
            onChange={(e) => setSourceSrid(e.target.value)}
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            disabled={importPending}
          >
            {SURVEY_POINTS_ARCHIVE_SOURCE_SRID_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="archive-upsert">Mode</Label>
          <select
            id="archive-upsert"
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

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="archive-geom-col">Kolom geometri titik</Label>
          <select
            id="archive-geom-col"
            value={geometrySlug}
            onChange={(e) => setGeometrySlug(e.target.value)}
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            disabled={importPending}
          >
            {geometryColumns.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.display_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="archive-match-col">Kolom kunci titik</Label>
          <select
            id="archive-match-col"
            value={matchSlug}
            onChange={(e) => setMatchSlug(e.target.value)}
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            disabled={importPending}
          >
            {matchColumns.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {previewFc ? (
        <div>
          <Label>Pratinjau titik di peta</Label>
          <div className="mt-1 overflow-hidden rounded-md border border-border">
            <DxfMappingPreviewMap
              featureCollection={previewFc}
              highlightIndex={null}
              onSelectPolygon={() => {}}
            />
          </div>
        </div>
      ) : null}

      {importMsg ? (
        <p
          className={`text-xs ${importMsg.startsWith("Tersimpan") ? "text-green-700" : "text-red-600"}`}
          role="alert"
        >
          {importMsg}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
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
              Menyimpan…
            </>
          ) : (
            `Simpan ${pointCount || ""} titik`
          )}
        </Button>
      </div>
    </ImportDialogShell>
  );
}
