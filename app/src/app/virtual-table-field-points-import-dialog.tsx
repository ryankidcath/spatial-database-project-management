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
import { isPreviewSourceSridSupported } from "@/lib/crs-reproject";
import { stripUtf8Bom } from "@/lib/csv-parse";
import {
  detectFieldPointsImportColumns,
  fieldPointsTemplateCsv,
  MAX_SURVEY_POINTS_ROWS,
  parseCsvHeaderNames,
  parseFieldPointsCsv,
  type FieldPointsImportColumnMap,
} from "@/lib/points-to-polygon-import";
import { buildFieldPointsArchiveFeatureCollection } from "@/lib/virtual-table-survey-points-archive";
import { SURVEY_POINTS_ARCHIVE_SOURCE_SRID_OPTIONS } from "@/lib/virtual-table-survey-points-archive";
import {
  defaultFieldPointTableName,
  SURVEY_POINT_GEOM_SLUG,
  SURVEY_POINT_MATCH_COLUMN_SLUG,
} from "@/lib/virtual-table-survey-points-bootstrap";
import type { VirtualColumnRow, VirtualTableRow } from "./virtual-table-types";
import {
  bootstrapAndImportFieldPointsAction,
  importVirtualRowsFieldPointsAction,
} from "./virtual-table-actions";
import { emitVirtualTableRowsMutated } from "@/lib/workspace-virtual-table-mutations";
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

export type FieldPointsImportCreated = {
  tableId: string;
  tableSlug: string;
  displayName: string;
  inserted: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  embedded?: boolean;
  cancelLabel?: string;
  /** Buat tabel titik baru lalu impor (wizard Spasial). */
  bootstrapMode?: boolean;
  projectId?: string;
  onCreated?: (result: FieldPointsImportCreated) => void;
  /** Impor ke tabel yang sudah ada. */
  table?: VirtualTableRow;
  columns?: VirtualColumnRow[];
};

const EMPTY_VIRTUAL_COLUMNS: VirtualColumnRow[] = [];

export function VirtualTableFieldPointsImportDialog({
  open,
  onOpenChange,
  onImported,
  embedded = false,
  cancelLabel = "Tutup",
  bootstrapMode = false,
  projectId = "",
  onCreated,
  table,
  columns = EMPTY_VIRTUAL_COLUMNS,
}: Props) {
  const [importPending, startImportTransition] = useTransition();
  const [tableDisplayName, setTableDisplayName] = useState(
    defaultFieldPointTableName()
  );
  const [csvText, setCsvText] = useState("");
  const [columnMap, setColumnMap] = useState<FieldPointsImportColumnMap | null>(
    null
  );
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

  const { points, pointCount } = useMemo(() => {
    if (!columnMap || !csvText.trim()) {
      return { points: [], pointCount: 0 };
    }
    const { points: parsed, errors } = parseFieldPointsCsv(csvText, columnMap);
    return {
      points: parsed,
      pointCount: parsed.length,
      parseErrors: errors,
    };
  }, [csvText, columnMap]);

  const previewFc = useMemo(() => {
    if (points.length === 0) return null;
    const slug = bootstrapMode
      ? SURVEY_POINT_MATCH_COLUMN_SLUG
      : matchSlug || SURVEY_POINT_MATCH_COLUMN_SLUG;
    const srid = Number(sourceSrid);
    if (!Number.isFinite(srid) || !isPreviewSourceSridSupported(srid)) {
      return null;
    }
    try {
      return buildFieldPointsArchiveFeatureCollection(points, slug, srid);
    } catch {
      return null;
    }
  }, [points, matchSlug, sourceSrid, bootstrapMode]);

  useEffect(() => {
    if (!open) return;
    setTableDisplayName(defaultFieldPointTableName());
    setCsvText("");
    setColumnMap(null);
    setParseError(null);
    setImportMsg(null);
    setSourceSrid("4326");
    setUpsertMode("upsert");
  }, [open]);

  useEffect(() => {
    if (!open || bootstrapMode) return;
    const geom =
      geometryColumns.find((c) => c.slug === SURVEY_POINT_GEOM_SLUG) ??
      geometryColumns[0];
    setGeometrySlug(geom?.slug ?? SURVEY_POINT_GEOM_SLUG);
    const match =
      matchColumns.find((c) => c.slug === SURVEY_POINT_MATCH_COLUMN_SLUG) ??
      matchColumns[0];
    setMatchSlug(match?.slug ?? SURVEY_POINT_MATCH_COLUMN_SLUG);
  }, [open, bootstrapMode, geometryColumns, matchColumns]);

  const applyCsv = useCallback((raw: string) => {
    const text = stripUtf8Bom(raw);
    setCsvText(text);
    setImportMsg(null);
    if (!text.trim()) {
      setColumnMap(null);
      setParseError(null);
      return;
    }
    if (text.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
      setParseError(spatialGeometryTextTooLargeMessage("CSV titik"));
      setColumnMap(null);
      return;
    }
    const headers = parseCsvHeaderNames(text);
    const detected = detectFieldPointsImportColumns(headers);
    if (!detected.ok) {
      setParseError(detected.error);
      setColumnMap(null);
      return;
    }
    const { points: parsed, errors } = parseFieldPointsCsv(
      text,
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
      setImportMsg("Tempel CSV dengan kolom x dan y (koordinat lapangan).");
      return;
    }
    if (bootstrapMode && !projectId.trim()) {
      setImportMsg("project_id tidak tersedia.");
      return;
    }
    if (!bootstrapMode && !table) {
      setImportMsg("Tabel tujuan tidak dipilih.");
      return;
    }
    if (!bootstrapMode && (!geometrySlug || !matchSlug)) {
      setImportMsg("Pilih kolom geometri dan kolom kunci titik.");
      return;
    }
    setImportMsg(null);
    const fd = new FormData();
    fd.set("points_csv_text", csvText);
    fd.set("column_x", columnMap.x);
    fd.set("column_y", columnMap.y);
    if (columnMap.urutan) fd.set("column_urutan", columnMap.urutan);
    fd.set("source_srid", sourceSrid);
    fd.set("upsert_mode", upsertMode);

    if (bootstrapMode) {
      fd.set("project_id", projectId);
      fd.set("display_name", tableDisplayName.trim() || defaultFieldPointTableName());
      startImportTransition(async () => {
        const r = await bootstrapAndImportFieldPointsAction(fd);
        if (r.error && r.inserted === 0 && r.updated === 0) {
          setImportMsg(r.error);
          return;
        }
        const failText =
          r.failed > 0
            ? ` Gagal ${r.failed}${r.failureSamples.length > 0 ? ` (${r.failureSamples.slice(0, 3).join("; ")})` : ""}.`
            : "";
        const warnText = r.error ? ` ${r.error}` : "";
        setImportMsg(
          `Tabel «${r.displayName}»: ${r.inserted} titik baru, ${r.updated} diperbarui.${failText}${warnText}`
        );
        if (r.tableId && r.tableSlug && r.displayName && (r.inserted > 0 || r.updated > 0)) {
          emitVirtualTableRowsMutated(r.tableId);
          onCreated?.({
            tableId: r.tableId,
            tableSlug: r.tableSlug,
            displayName: r.displayName,
            inserted: r.inserted + r.updated,
          });
          onImported();
        }
      });
      return;
    }

    fd.set("table_id", table!.id);
    fd.set("geometry_column_slug", geometrySlug);
    fd.set("match_column_slug", matchSlug);
    startImportTransition(async () => {
      const r = await importVirtualRowsFieldPointsAction(fd);
      if (r.error) {
        setImportMsg(r.error);
        return;
      }
      const skipText =
        r.skippedExisting > 0 ? ` ${r.skippedExisting} sudah ada (lewati).` : "";
      const failText =
        r.failed > 0
          ? ` Gagal ${r.failed}${r.failureSamples.length > 0 ? ` (${r.failureSamples.slice(0, 3).join("; ")})` : ""}.`
          : "";
      setImportMsg(
        `Tersimpan: ${r.inserted} baru, ${r.updated} diperbarui.${skipText}${failText}`
      );
      if (r.inserted > 0 || r.updated > 0) {
        emitVirtualTableRowsMutated(table!.id);
        onImported();
      }
    });
  }, [
    csvText,
    columnMap,
    points.length,
    bootstrapMode,
    projectId,
    table,
    tableDisplayName,
    geometrySlug,
    matchSlug,
    upsertMode,
    sourceSrid,
    onImported,
    onCreated,
  ]);

  const canImport =
    !importPending &&
    !parseError?.includes("Terlalu banyak") &&
    csvText.trim() &&
    columnMap &&
    points.length > 0;

  const title = bootstrapMode
    ? "Titik lapangan → tabel baru"
    : `Titik lapangan mentah → ${table?.display_name ?? "tabel"}`;

  return (
    <ImportDialogShell
      embedded={embedded}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={
        <>
          Impor <strong>satu file titik</strong> dari lapangan (kolom{" "}
          <span className="font-mono">x</span>,{" "}
          <span className="font-mono">y</span> saja). Titik diberi label otomatis{" "}
          <span className="font-mono">T1</span>, <span className="font-mono">T2</span>, …
          untuk dicocokkan dengan <strong>sketsa kertas</strong>. Pemisahan
          bidang/jalan/saluran dilakukan nanti saat digitasi (Fase 6B+).
        </>
      }
    >
      {bootstrapMode ? (
        <div>
          <Label htmlFor="field-points-table-name">Nama tabel titik</Label>
          <Input
            id="field-points-table-name"
            value={tableDisplayName}
            onChange={(e) => setTableDisplayName(e.target.value)}
            className="mt-1"
            disabled={importPending}
            placeholder={defaultFieldPointTableName()}
          />
        </div>
      ) : null}

      <div>
        <Label htmlFor="field-points-file">File CSV titik</Label>
        <Input
          id="field-points-file"
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
          Kolom wajib: x, y (atau east/north, lon/lat). Opsional: urutan. Tanpa
          no_bidang. Batas ~{MAX_SPATIAL_GEOMETRY_TEXT_MB} MB.
        </p>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="field-points-csv">Data CSV</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              const blob = new Blob([fieldPointsTemplateCsv()], {
                type: "text/csv;charset=utf-8",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "template-titik-lapangan.csv";
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
          id="field-points-csv"
          value={csvText}
          onChange={(e) => applyCsv(e.target.value)}
          rows={6}
          className="mt-1 font-mono text-[11px]"
          placeholder="x,y&#10;500100,9876500&#10;500120,9876500"
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
          {pointCount} titik · label T1…T{pointCount}
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="field-points-srid">EPSG sumber</Label>
          <select
            id="field-points-srid"
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
          <Label htmlFor="field-points-upsert">Mode</Label>
          <select
            id="field-points-upsert"
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

      {!bootstrapMode && geometryColumns.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="field-points-geom-col">Kolom geometri</Label>
            <select
              id="field-points-geom-col"
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
            <Label htmlFor="field-points-match-col">Kolom kunci titik</Label>
            <select
              id="field-points-match-col"
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
      ) : null}

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
          className={`text-xs ${
            importMsg.includes("titik baru") ||
            importMsg.startsWith("Tersimpan") ||
            importMsg.includes("Tabel «")
              ? "text-green-700"
              : "text-red-600"
          }`}
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
              {bootstrapMode ? "Membuat & menyimpan…" : "Menyimpan…"}
            </>
          ) : bootstrapMode ? (
            `Buat tabel & simpan ${pointCount || ""} titik`
          ) : (
            `Simpan ${pointCount || ""} titik`
          )}
        </Button>
      </div>
    </ImportDialogShell>
  );
}
