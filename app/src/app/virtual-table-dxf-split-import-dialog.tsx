"use client";

import {
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
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  buildDxfPolygonizeOptionsFromForm,
  defaultSnapToleranceForSrid,
  parseDxfDocument,
} from "@/lib/dxf-import-utils";
import { isPreviewSourceSridSupported } from "@/lib/crs-reproject";
import {
  MAX_SPATIAL_GEOMETRY_TEXT_CHARS,
  MAX_SPATIAL_GEOMETRY_TEXT_MB,
  spatialGeometryTextTooLargeMessage,
} from "@/lib/spatial-import-limits";
import {
  buildSplitPreviewFeatureCollection,
  DXF_SPLIT_GEOM_KIND_LABELS,
  DXF_SPLIT_TARGET_LABELS,
  generateAutoMatchKeys,
  scanDxfForSplitImport,
  type DxfSplitMappingRow,
  type DxfSplitTargetKind,
  type DxfSplitTargetTableConfig,
} from "@/lib/dxf-split-import";
import { VIRTUAL_TABLE_DXF_SOURCE_SRID_OPTIONS } from "@/lib/virtual-table-dxf-import";
import { importDxfSplitMultiTableAction } from "./virtual-table-actions";
import { ImportDialogShell } from "./import-dialog-shell";

const DxfSplitPreviewMap = dynamic(
  () =>
    import("./dxf-split-preview-map").then((m) => m.DxfSplitPreviewMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-56 animate-pulse rounded-md bg-muted" />
    ),
  }
);

const TARGET_OPTIONS: DxfSplitTargetKind[] = [
  "bidang",
  "jalan",
  "saluran",
  "titik",
  "skip",
];

export type DxfSplitImportCreated = {
  tables: Array<{
    tableId: string;
    displayName: string;
    target: DxfSplitTargetKind;
    inserted: number;
    updated: number;
  }>;
  totalInserted: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onImported: () => void;
  onCreated: (result: DxfSplitImportCreated) => void;
  embedded?: boolean;
  cancelLabel?: string;
};

function rebuildTargetTables(rows: DxfSplitMappingRow[]): DxfSplitTargetTableConfig[] {
  const map = new Map<DxfSplitTargetKind, string>();
  for (const row of rows) {
    if (row.enabled && row.target !== "skip") {
      if (!map.has(row.target)) {
        map.set(row.target, defaultTableName(row.target));
      }
    }
  }
  const order: DxfSplitTargetKind[] = ["bidang", "titik", "jalan", "saluran"];
  return order
    .filter((t) => map.has(t))
    .map((target) => ({
      target,
      enabled: true,
      displayName: map.get(target)!,
    }));
}

function defaultTableName(target: DxfSplitTargetKind): string {
  const date = new Date().toISOString().slice(0, 10);
  switch (target) {
    case "bidang":
      return `Bidang (${date})`;
    case "jalan":
      return `Jalan (${date})`;
    case "saluran":
      return `Saluran (${date})`;
    case "titik":
      return `Titik lapangan (${date})`;
    default:
      return "";
  }
}

export function VirtualTableDxfSplitImportDialog({
  open,
  onOpenChange,
  projectId,
  onImported,
  onCreated,
  embedded = false,
  cancelLabel = "Batal",
}: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [dxfRawText, setDxfRawText] = useState("");
  const [sourceSrid, setSourceSrid] = useState("4326");
  const [snapTolerance, setSnapTolerance] = useState("");
  const [rows, setRows] = useState<DxfSplitMappingRow[]>([]);
  const [targetTables, setTargetTables] = useState<DxfSplitTargetTableConfig[]>(
    []
  );
  const [highlightRowId, setHighlightRowId] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const dxfParsedRef = useRef<IDxf | null>(null);

  const sourceSridNum = Number(sourceSrid) || 4326;

  useEffect(() => {
    if (!open) return;
    setMessage(null);
    setDxfRawText("");
    setSourceSrid("4326");
    setSnapTolerance("");
    setRows([]);
    setTargetTables([]);
    setHighlightRowId(null);
    setScanError(null);
    dxfParsedRef.current = null;
  }, [open]);

  const runScan = useCallback(
    (raw: string, srid: string, snapOverride?: string) => {
      setScanError(null);
      if (!raw.trim()) {
        setRows([]);
        setTargetTables([]);
        dxfParsedRef.current = null;
        return;
      }
      if (raw.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
        setScanError(spatialGeometryTextTooLargeMessage("DXF"));
        return;
      }
      const sridNum = Number(srid) || 4326;
      if (!isPreviewSourceSridSupported(sridNum)) {
        setScanError(`EPSG:${sridNum} belum didukung.`);
        return;
      }
      try {
        const dxf = parseDxfDocument(raw);
        dxfParsedRef.current = dxf;
        const snapVal = snapOverride ?? snapTolerance;
        const polygonizeOptions = buildDxfPolygonizeOptionsFromForm(
          sridNum,
          snapVal || undefined
        );
        const result = scanDxfForSplitImport(dxf, raw, {
          polygonizeOptions,
        });
        setRows(result.rows);
        setTargetTables(result.targetTables);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Gagal memindai DXF.";
        setScanError(msg);
        setRows([]);
        setTargetTables([]);
      }
    },
    [snapTolerance]
  );

  const handleSridChange = (value: string) => {
    setSourceSrid(value);
    if (dxfRawText.trim()) runScan(dxfRawText, value);
  };

  const handleSnapChange = (value: string) => {
    setSnapTolerance(value);
    if (dxfRawText.trim()) runScan(dxfRawText, sourceSrid, value);
  };

  const previewFc = useMemo(() => {
    if (!dxfParsedRef.current || !dxfRawText.trim() || rows.length === 0) {
      return null;
    }
    try {
      return buildSplitPreviewFeatureCollection(
        dxfParsedRef.current,
        dxfRawText,
        rows,
        sourceSridNum,
        buildDxfPolygonizeOptionsFromForm(
          sourceSridNum,
          snapTolerance || undefined
        )
      );
    } catch {
      return null;
    }
  }, [dxfRawText, rows, sourceSridNum, snapTolerance]);

  const enabledCount = useMemo(
    () =>
      rows
        .filter((r) => r.enabled && r.target !== "skip")
        .reduce((s, r) => s + r.entityCount, 0),
    [rows]
  );

  const updateRowTarget = (id: string, target: DxfSplitTargetKind) => {
    setRows((prev) => {
      const next = prev.map((row) => {
        if (row.id !== id) return row;
        const enabled = target !== "skip" && row.entityCount > 0;
        const { keys, labels } =
          enabled && row.entityCount > 0
            ? generateAutoMatchKeys(
                target,
                row.layerName,
                row.geomKind,
                row.entityCount
              )
            : { keys: [] as string[], labels: [] as (string | null)[] };
        return {
          ...row,
          target,
          enabled,
          matchKeys: keys,
          matchLabels: labels,
        };
      });
      setTargetTables((tables) => {
        const rebuilt = rebuildTargetTables(next);
        const nameByTarget = new Map(tables.map((t) => [t.target, t.displayName]));
        return rebuilt.map((t) => ({
          ...t,
          displayName: nameByTarget.get(t.target) ?? t.displayName,
        }));
      });
      return next;
    });
  };

  const toggleRowEnabled = (id: string, enabled: boolean) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              enabled: enabled && row.target !== "skip" && row.entityCount > 0,
            }
          : row
      )
    );
  };

  const updateTargetTableName = (
    target: DxfSplitTargetKind,
    displayName: string
  ) => {
    setTargetTables((prev) =>
      prev.map((t) => (t.target === target ? { ...t, displayName } : t))
    );
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_SPATIAL_GEOMETRY_TEXT_MB * 1024 * 1024) {
      setScanError(
        `File terlalu besar (maks. ${MAX_SPATIAL_GEOMETRY_TEXT_MB} MB).`
      );
      return;
    }
    const text = await file.text();
    setDxfRawText(text);
    runScan(text, sourceSrid);
  };

  const handleImport = () => {
    setMessage(null);
    if (!dxfRawText.trim()) {
      setMessage("Unggah file DXF terlebih dahulu.");
      return;
    }
    if (enabledCount === 0) {
      setMessage("Tidak ada layer aktif untuk diimpor.");
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("project_id", projectId);
      fd.set("dxf_text", dxfRawText);
      fd.set("source_srid", sourceSrid);
      if (snapTolerance.trim()) {
        fd.set("polygonize_snap_tolerance", snapTolerance.trim());
      }
      fd.set(
        "mapping_json",
        JSON.stringify({
          targetTables,
          rows: rows.map((r) => ({
            layerName: r.layerName,
            geomKind: r.geomKind,
            target: r.target,
            enabled: r.enabled,
            matchKeys: r.matchKeys,
            matchLabels: r.matchLabels,
          })),
        })
      );

      const r = await importDxfSplitMultiTableAction(fd);
      if (r.error) {
        setMessage(r.error);
        return;
      }
      onImported();
      onCreated({
        tables: r.tables.map((t) => ({
          tableId: t.tableId,
          displayName: t.displayName,
          target: t.target,
          inserted: t.inserted,
          updated: t.updated,
        })),
        totalInserted: r.totalInserted,
      });
    });
  };

  const canImport =
    dxfRawText.trim().length > 0 && enabledCount > 0 && !scanError;

  return (
    <ImportDialogShell
      embedded={embedded}
      open={open}
      onOpenChange={onOpenChange}
      title="DXF campur → pisah ke beberapa layer"
      description="Satu file CAD berisi bidang, garis, dan titik — Portal memindai layer, menyarankan mapping, lalu membuat tabel terpisah. Review sebelum simpan."
      contentClassName={embedded ? undefined : "max-w-3xl"}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="dxf-split-file">File DXF</Label>
          <Input
            id="dxf-split-file"
            type="file"
            accept=".dxf,.DXF"
            disabled={pending}
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            Untuk proyek baru disarankan titik CSV + digitasi (Fase 6). Fase 7
            cocok untuk migrasi file CAD lama.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="dxf-split-srid">EPSG sumber</Label>
            <select
              id="dxf-split-srid"
              value={sourceSrid}
              onChange={(e) => handleSridChange(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              disabled={pending}
            >
              {VIRTUAL_TABLE_DXF_SOURCE_SRID_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dxf-split-snap">Toleransi snap polygonize (m)</Label>
            <Input
              id="dxf-split-snap"
              type="number"
              min={0}
              step={0.01}
              placeholder={String(defaultSnapToleranceForSrid(sourceSridNum))}
              value={snapTolerance}
              onChange={(e) => handleSnapChange(e.target.value)}
              disabled={pending}
            />
          </div>
        </div>

        {scanError ? (
          <p className="text-sm text-destructive">{scanError}</p>
        ) : null}

        {rows.length > 0 ? (
          <>
            <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              {rows.length} layer CAD · {enabledCount} entitas aktif · saran
              heuristik (alias + geometri) — ubah target bila perlu.
            </div>

            {targetTables.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Tabel tujuan baru (bootstrap)
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {targetTables.map((cfg) => (
                    <div key={cfg.target} className="space-y-1">
                      <Label htmlFor={`dxf-split-table-${cfg.target}`}>
                        {DXF_SPLIT_TARGET_LABELS[cfg.target]}
                      </Label>
                      <Input
                        id={`dxf-split-table-${cfg.target}`}
                        value={cfg.displayName}
                        onChange={(e) =>
                          updateTargetTableName(cfg.target, e.target.value)
                        }
                        disabled={pending}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="max-h-64 overflow-auto rounded-md border border-border">
              <table className="w-full min-w-[32rem] text-left text-xs">
                <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">✓</th>
                    <th className="px-2 py-1.5 font-medium">Layer CAD</th>
                    <th className="px-2 py-1.5 font-medium">Geom</th>
                    <th className="px-2 py-1.5 font-medium">Jumlah</th>
                    <th className="px-2 py-1.5 font-medium">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-t border-border/60",
                        highlightRowId === row.id && "bg-primary/5",
                        row.enabled
                          ? "cursor-pointer hover:bg-muted/40"
                          : "opacity-60"
                      )}
                      onMouseEnter={() => setHighlightRowId(row.id)}
                      onMouseLeave={() => setHighlightRowId(null)}
                    >
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          disabled={
                            pending ||
                            row.target === "skip" ||
                            row.entityCount === 0
                          }
                          onChange={(e) =>
                            toggleRowEnabled(row.id, e.target.checked)
                          }
                          aria-label={`Impor layer ${row.layerName}`}
                        />
                      </td>
                      <td className="px-2 py-1.5 font-medium">{row.layerName}</td>
                      <td className="px-2 py-1.5">
                        {DXF_SPLIT_GEOM_KIND_LABELS[row.geomKind]}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {row.entityCount}
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={row.target}
                          disabled={pending || row.entityCount === 0}
                          onChange={(e) =>
                            updateRowTarget(
                              row.id,
                              e.target.value as DxfSplitTargetKind
                            )
                          }
                          className="h-8 w-full max-w-[9rem] rounded border border-input bg-background px-1 text-xs"
                        >
                          {TARGET_OPTIONS.map((t) => (
                            <option key={t} value={t}>
                              {DXF_SPLIT_TARGET_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {previewFc && previewFc.features.length > 0 ? (
              <DxfSplitPreviewMap
                featureCollection={previewFc}
                highlightRowId={highlightRowId}
              />
            ) : null}
          </>
        ) : null}

        {message ? (
          <p className="text-sm text-destructive">{message}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={!canImport || pending}
          >
            {pending ? (
              <>
                <Spinner className="mr-2 size-4" />
                Mengimpor…
              </>
            ) : (
              `Impor ${enabledCount || ""} entitas`
            )}
          </Button>
        </div>
      </div>
    </ImportDialogShell>
  );
}
