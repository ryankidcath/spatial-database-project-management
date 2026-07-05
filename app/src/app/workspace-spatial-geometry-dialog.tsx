"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import type { IDxf } from "dxf-parser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { buildReturnQueryValue } from "@/lib/safe-return-url";
import {
  deleteAllIssueGeometryFeaturesForIssueAction,
  deleteIssueGeometryFeatureByIdAction,
  upsertIssueGeometryFeatureAction,
  upsertIssueGeometryFeatureBatchAction,
  upsertIssueGeometryFeaturesFromDxfAction,
} from "./issue-geometry-feature-actions";
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
  MAX_SHAPEFILE_ZIP_BYTES,
  MAX_SPATIAL_GEOMETRY_TEXT_CHARS,
  MAX_SPATIAL_GEOMETRY_TEXT_MB,
  dxfKeyMappingTemplateCsv,
  shapefileZipTooLargeMessage,
  spatialGeometryTextTooLargeMessage,
} from "@/lib/spatial-import-limits";
import {
  applyGeoJsonBatchKeyLabelMapping,
  defaultGeoJsonBatchFeatureKey,
  defaultGeoJsonBatchLabel,
  listGeoJsonBatchPolygonRows,
  type GeoJsonFeatureCollectionForBatch,
} from "@/lib/geojson-batch-mapping-utils";
import {
  parseShapefileZipToPolygonLayers,
  type ShapefilePolygonLayer,
} from "@/lib/shapefile-import-utils";
import type {
  IssueGeometryFeatureMapRow,
  IssueFeatureAttributeRow,
} from "./spatial-attribute-types";

const DxfMappingPreviewMap = dynamic(
  () => import("./dxf-mapping-preview-map").then((m) => m.DxfMappingPreviewMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-52 min-h-[13rem] w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-xs text-muted-foreground">
        <div className="inline-flex items-center gap-2">
          <Spinner className="size-4" />
          <span>Harap tunggu, memuat pratinjau peta…</span>
        </div>
      </div>
    ),
  }
);

type MapGeometryInputMode = "single" | "manage";

const SOURCE_SRID_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "4326", label: "EPSG:4326 - WGS84 (Lat/Lon)" },
  { value: "32748", label: "EPSG:32748 - UTM Zone 48S" },
  { value: "32749", label: "EPSG:32749 - UTM Zone 49S" },
  { value: "23833", label: "EPSG:23833 - TM-3 48.1" },
  { value: "23834", label: "EPSG:23834 - TM-3 48.2" },
  { value: "23835", label: "EPSG:23835 - TM-3 49.1" },
  { value: "23836", label: "EPSG:23836 - TM-3 49.2" },
];

function geometryKeyStatusCell(
  rawKey: string,
  existingGeometryKeysLower: Set<string>
): ReactNode {
  const t = rawKey.trim().toLowerCase();
  if (t.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (existingGeometryKeysLower.has(t)) {
    return (
      <Badge
        variant="outline"
        className="shrink-0 px-1.5 py-0 font-normal text-[10px] leading-tight"
      >
        Sudah ada
      </Badge>
    );
  }
  return <span className="text-muted-foreground">Belum</span>;
}

export type WorkspaceSpatialGeometryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputMode: MapGeometryInputMode;
  selectedProjectId: string;
  selectedTaskId: string;
  selectedScopePath: string;
  issueGeometryFeatureMap: IssueGeometryFeatureMapRow[];
  issueFeatureAttributes: IssueFeatureAttributeRow[];
  onPendingChange?: (pending: boolean) => void;
  openEpoch?: number;
};

export function WorkspaceSpatialGeometryDialog({
  open,
  onOpenChange,
  inputMode: mapGeomInputMode,
  selectedProjectId,
  selectedTaskId,
  selectedScopePath,
  issueGeometryFeatureMap,
  issueFeatureAttributes,
  onPendingChange,
  openEpoch = 0,
}: WorkspaceSpatialGeometryDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const spatialHelpHref = useMemo(() => {
    const ret = buildReturnQueryValue(pathname, searchParams.toString());
    return `/help/spatial-import?return=${ret}`;
  }, [pathname, searchParams]);

  const [mapGeomFileMode, setMapGeomFileMode] = useState<"geojson" | "dxf">("geojson");
  const [mapGeomSourceSrid, setMapGeomSourceSrid] = useState("4326");
  const [mapDxfRawText, setMapDxfRawText] = useState("");
  const [mapDxfLayers, setMapDxfLayers] = useState<string[]>([]);
  const [mapDxfLayer, setMapDxfLayer] = useState("");
  const [mapDxfKeyPrefix, setMapDxfKeyPrefix] = useState("");
  const [mapDxfPolygonCount, setMapDxfPolygonCount] = useState(0);
  const [mapDxfFeatureKeys, setMapDxfFeatureKeys] = useState<string[]>([]);
  const [mapDxfFeatureLabels, setMapDxfFeatureLabels] = useState<string[]>([]);
  const [mapDxfBulkKeyText, setMapDxfBulkKeyText] = useState("");
  const [mapDxfBulkKeyHint, setMapDxfBulkKeyHint] = useState<string | null>(null);
  const [mapDxfPreviewRings, setMapDxfPreviewRings] = useState<LinearRing[]>([]);
  const [mapDxfHighlightRow, setMapDxfHighlightRow] = useState<number | null>(null);
  const [mapDxfError, setMapDxfError] = useState<string | null>(null);
  const mapDxfParsedRef = useRef<IDxf | null>(null);
  const [mapGeomMsg, setMapGeomMsg] = useState<string | null>(null);
  const [mapGeomBatchText, setMapGeomBatchText] = useState("");
  const [mapShpLayers, setMapShpLayers] = useState<ShapefilePolygonLayer[] | null>(
    null
  );
  const [mapShpSelectedFileName, setMapShpSelectedFileName] = useState("");
  const [mapShpLoadHint, setMapShpLoadHint] = useState<string | null>(null);
  const [mapGeomGeojsonBatchPrefix, setMapGeomGeojsonBatchPrefix] = useState("");
  const [mapGeojsonBatchKeys, setMapGeojsonBatchKeys] = useState<string[]>([]);
  const [mapGeojsonBatchLabels, setMapGeojsonBatchLabels] = useState<string[]>([]);
  const [mapGeomDeleteMsg, setMapGeomDeleteMsg] = useState<string | null>(null);
  const [mapGeomFormNonce, setMapGeomFormNonce] = useState(0);
  const [mapGeomPending, startMapGeomTransition] = useTransition();

  const mapGeomDetectedKind = useMemo<
    "none" | "single" | "batch" | "invalid" | "unsupported"
  >(() => {
    const text = mapGeomBatchText.trim();
    if (!text) return "none";
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object") return "invalid";
      const kind = String((parsed as { type?: unknown }).type ?? "");
      if (kind === "FeatureCollection") return "batch";
      if (kind === "Feature" || kind === "Polygon" || kind === "MultiPolygon") {
        return "single";
      }
      return "unsupported";
    } catch {
      return "invalid";
    }
  }, [mapGeomBatchText]);

  const mapGeomGeojsonPolygonRowCount = useMemo(() => {
    if (mapGeomDetectedKind !== "batch") return 0;
    const text = mapGeomBatchText.trim();
    if (!text) return 0;
    try {
      const p = JSON.parse(text) as unknown;
      if (
        !p ||
        typeof p !== "object" ||
        String((p as { type?: unknown }).type) !== "FeatureCollection"
      ) {
        return 0;
      }
      return listGeoJsonBatchPolygonRows(p as GeoJsonFeatureCollectionForBatch).length;
    } catch {
      return 0;
    }
  }, [mapGeomBatchText, mapGeomDetectedKind]);

  useEffect(() => {
    if (mapGeomDetectedKind !== "batch") {
      setMapGeojsonBatchKeys([]);
      setMapGeojsonBatchLabels([]);
      return;
    }
    const text = mapGeomBatchText.trim();
    if (!text) {
      setMapGeojsonBatchKeys([]);
      setMapGeojsonBatchLabels([]);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setMapGeojsonBatchKeys([]);
      setMapGeojsonBatchLabels([]);
      return;
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      String((parsed as { type?: unknown }).type) !== "FeatureCollection"
    ) {
      setMapGeojsonBatchKeys([]);
      setMapGeojsonBatchLabels([]);
      return;
    }
    const rows = listGeoJsonBatchPolygonRows(parsed as GeoJsonFeatureCollectionForBatch);
    const keys = rows.map((row) =>
      defaultGeoJsonBatchFeatureKey(
        row.featureIndex,
        row.props,
        mapGeomGeojsonBatchPrefix
      )
    );
    const labels = rows.map((row) => defaultGeoJsonBatchLabel(row.props));
    setMapGeojsonBatchKeys(keys);
    setMapGeojsonBatchLabels(labels);
  }, [mapGeomBatchText, mapGeomDetectedKind, mapGeomGeojsonBatchPrefix]);

  const applyShapefileLayerToBatch = useCallback(
    (layers: ShapefilePolygonLayer[], fileName: string) => {
      const layer = layers.find((l) => l.fileName === fileName);
      if (!layer) {
        setMapGeomMsg("Layer shapefile tidak ditemukan.");
        setMapGeomBatchText("");
        return false;
      }
      const text = JSON.stringify(layer.featureCollection, null, 2);
      if (text.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
        setMapGeomMsg(spatialGeometryTextTooLargeMessage("Batch GeoJSON"));
        setMapGeomBatchText("");
        return false;
      }
      setMapGeomBatchText(text);
      setMapGeomMsg(null);
      setMapShpLoadHint(
        `Memuat ${layer.polygonFeatureCount} poligon dari layer “${layer.fileName}”. Atur prefix key (opsional) dan SRID, lalu simpan.`
      );
      return true;
    },
    []
  );

  useEffect(() => {
    if (mapDxfPolygonCount === 0 || !mapDxfLayer.trim()) {
      setMapDxfFeatureKeys([]);
      setMapDxfFeatureLabels([]);
      return;
    }
    setMapDxfFeatureKeys(
      featureKeysForDxfPolygons(
        mapDxfKeyPrefix.trim(),
        mapDxfLayer,
        mapDxfPolygonCount
      )
    );
    setMapDxfFeatureLabels(Array.from({ length: mapDxfPolygonCount }, () => ""));
    setMapDxfBulkKeyHint(null);
  }, [mapDxfPolygonCount, mapDxfLayer, mapDxfKeyPrefix]);

  const resetMapDxfState = useCallback(() => {
    setMapGeomFileMode("geojson");
    setMapGeomSourceSrid("4326");
    setMapGeomGeojsonBatchPrefix("");
    setMapGeojsonBatchKeys([]);
    setMapGeojsonBatchLabels([]);
    setMapShpLayers(null);
    setMapShpSelectedFileName("");
    setMapShpLoadHint(null);
    setMapDxfRawText("");
    setMapDxfLayers([]);
    setMapDxfLayer("");
    setMapDxfKeyPrefix("");
    setMapDxfPolygonCount(0);
    setMapDxfFeatureKeys([]);
    setMapDxfFeatureLabels([]);
    setMapDxfBulkKeyText("");
    setMapDxfBulkKeyHint(null);
    setMapDxfPreviewRings([]);
    setMapDxfHighlightRow(null);
    setMapDxfError(null);
    mapDxfParsedRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    setMapGeomMsg(null);
    setMapGeomDeleteMsg(null);
    setMapGeomBatchText("");
    resetMapDxfState();
    setMapGeomFormNonce((n) => n + 1);
  }, [open, openEpoch, resetMapDxfState]);

  const issueGeometriesForManageTask = useMemo(() => {
    if (!selectedProjectId || !selectedTaskId) return [];
    return issueGeometryFeatureMap
      .filter(
        (g) =>
          g.project_id === selectedProjectId && g.issue_id === selectedTaskId
      )
      .sort((a, b) => a.feature_key.localeCompare(b.feature_key));
  }, [issueGeometryFeatureMap, selectedProjectId, selectedTaskId]);

  /** `feature_key` geometri yang sudah tersimpan untuk unit kerja aktif (perbandingan case-insensitive). */
  const geometryKeysLowerForSelectedTask = useMemo(() => {
    if (!selectedProjectId || !selectedTaskId) return new Set<string>();
    return new Set(
      issueGeometryFeatureMap
        .filter(
          (g) =>
            g.project_id === selectedProjectId && g.issue_id === selectedTaskId
        )
        .map((g) => g.feature_key.trim().toLowerCase())
        .filter((k) => k.length > 0)
    );
  }, [issueGeometryFeatureMap, selectedProjectId, selectedTaskId]);

  /** `feature_key` dari atribut unit kerja ini yang belum punya geometri — saran impor DXF. */
  const mapDxfAttributeKeysWithoutGeometry = useMemo(() => {
    if (!selectedTaskId || !selectedProjectId) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of issueFeatureAttributes) {
      if (a.issue_id !== selectedTaskId || a.project_id !== selectedProjectId) {
        continue;
      }
      const low = a.feature_key.toLowerCase();
      if (geometryKeysLowerForSelectedTask.has(low)) continue;
      if (seen.has(low)) continue;
      seen.add(low);
      out.push(a.feature_key);
    }
    out.sort((x, y) => x.localeCompare(y));
    return out;
  }, [
    geometryKeysLowerForSelectedTask,
    issueFeatureAttributes,
    selectedProjectId,
    selectedTaskId,
  ]);

  const mapDxfPreviewFeatureCollection = useMemo(() => {
    if (mapDxfPreviewRings.length === 0) {
      return { fc: null as GeoJSON.FeatureCollection | null, err: null as string | null };
    }
    const srid = Number.parseInt(mapGeomSourceSrid.trim(), 10);
    if (!Number.isFinite(srid) || !isPreviewSourceSridSupported(srid)) {
      return {
        fc: null,
        err: "SRID sumber tidak didukung untuk pratinjau peta.",
      };
    }
    try {
      const fc = dxfRingsToWgs84PreviewFeatureCollection(mapDxfPreviewRings, srid);
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
  }, [mapDxfPreviewRings, mapGeomSourceSrid]);

  const dxfMappingRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const handleDxfPreviewPolygonClick = useCallback((idx: number) => {
    setMapDxfHighlightRow(idx);
  }, []);

  useEffect(() => {
    setMapDxfHighlightRow(null);
  }, [mapDxfPolygonCount, mapDxfLayer]);

  useEffect(() => {
    if (mapDxfHighlightRow == null) return;
    const el = dxfMappingRowRefs.current[mapDxfHighlightRow];
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [mapDxfHighlightRow]);

  useEffect(() => {
    onPendingChange?.(mapGeomPending);
  }, [mapGeomPending, onPendingChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[min(96vw,760px)] overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mapGeomInputMode === "manage"
              ? "Hapus geometri fitur unit kerja"
              : "Simpan geometri fitur unit kerja"}
          </DialogTitle>
          <DialogDescription>
            {mapGeomInputMode === "manage" ? (
              <>
                Daftar fitur geometri untuk unit kerja aktif. Hapus per
                baris atau sekaligus sebelum batch ulang.
              </>
            ) : (
              <>
                Simpan geometri unit kerja dari GeoJSON, ZIP shapefile
                (poligon), atau DXF (poligon tertutup per layer).
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <p
          className="mb-3 rounded-md border border-border bg-muted/45 px-3 py-2 text-sm text-foreground"
          role="status"
        >
          <span className="block text-xs font-medium text-muted-foreground">
            Unit kerja
          </span>
          <span className="mt-1 block font-semibold leading-snug">
            {selectedScopePath}
          </span>
        </p>
        {mapGeomInputMode !== "manage" && (
          <details className="mb-3 rounded-md border border-border bg-muted/30 text-xs text-foreground">
            <summary className="cursor-pointer select-none px-3 py-2 font-medium text-muted-foreground hover:text-foreground">
              Petunjuk impor geometri & CRS
            </summary>
            <div className="space-y-2 border-t border-border/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">
                  feature_key:
                </span>{" "}
                kunci yang sama menghubungkan geometri (Map) dan atribut
                (Tabel); huruf besar/kecil harus konsisten.
              </p>
              <p>
                <span className="font-medium text-foreground">
                  SRID:
                </span>{" "}
                pilih EPSG yang sesuai koordinat file. GeoJSON lon/lat →
                4326. Shapefile dengan .prj yang dikenali parser sering sudah
                lon/lat → 4326; tanpa .prj pilih SRID koordinat mentah DXF/SHP.
              </p>
              <p>
                <span className="font-medium text-foreground">
                  Batas:
                </span>{" "}
                teks GeoJSON/DXF/batch ~{MAX_SPATIAL_GEOMETRY_TEXT_MB} MB;
                ZIP shapefile ~{Math.round(MAX_SHAPEFILE_ZIP_BYTES / (1024 * 1024))}{" "}
                MB.
              </p>
              <p className="text-[10px]">
                <Link
                  href={spatialHelpHref}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Buka halaman bantuan impor spasial
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · Dokumen repo:{" "}
                  <span className="font-mono text-foreground">
                    docs/spatial-import-user-guide.md
                  </span>
                </span>
              </p>
            </div>
          </details>
        )}
        {mapGeomInputMode === "manage" ? (
          <div className="space-y-3">
            {issueGeometriesForManageTask.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada geometri fitur untuk unit kerja ini.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Total{" "}
                    <span className="font-semibold text-foreground">
                      {issueGeometriesForManageTask.length}
                    </span>{" "}
                    fitur.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-7 px-2 text-xs"
                    disabled={mapGeomPending}
                    onClick={() => {
                      if (
                        !selectedProjectId ||
                        !selectedTaskId
                      ) {
                        return;
                      }
                      if (
                        !window.confirm(
                          `Hapus semua ${issueGeometriesForManageTask.length} geometri fitur unit kerja ini?`
                        )
                      ) {
                        return;
                      }
                      setMapGeomDeleteMsg(null);
                      startMapGeomTransition(async () => {
                        const fd = new FormData();
                        fd.set(
                          "project_id",
                          selectedProjectId
                        );
                        fd.set("issue_id", selectedTaskId);
                        const r =
                          await deleteAllIssueGeometryFeaturesForIssueAction(
                            fd
                          );
                        if (r.error) {
                          setMapGeomDeleteMsg(r.error);
                          return;
                        }
                        setMapGeomDeleteMsg(
                          `Terhapus ${r.deleted} fitur.`
                        );
                        router.refresh();
                      });
                    }}
                  >
                    Hapus semua
                  </Button>
                </div>
                <div className="max-h-[36vh] overflow-y-auto rounded-md border border-border">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-muted-foreground">
                        <th className="px-2 py-1.5 font-medium">
                          feature_key
                        </th>
                        <th className="px-2 py-1.5 font-medium">
                          label
                        </th>
                        <th className="w-20 px-2 py-1.5 text-right font-medium">
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {issueGeometriesForManageTask.map(
                        (row) => (
                          <tr
                            key={row.id}
                            className="border-b border-border/70"
                          >
                            <td className="px-2 py-1.5 font-mono text-[11px]">
                              {row.feature_key}
                            </td>
                            <td className="max-w-[200px] truncate px-2 py-1.5">
                              {row.label}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                                disabled={mapGeomPending}
                                onClick={() => {
                                  if (
                                    !selectedProjectId ||
                                    !selectedTaskId
                                  ) {
                                    return;
                                  }
                                  setMapGeomDeleteMsg(null);
                                  startMapGeomTransition(
                                    async () => {
                                      const fd =
                                        new FormData();
                                      fd.set(
                                        "project_id",
                                        selectedProjectId
                                      );
                                      fd.set(
                                        "issue_id",
                                        selectedTaskId
                                      );
                                      fd.set(
                                        "feature_id",
                                        row.id
                                      );
                                      const r =
                                        await deleteIssueGeometryFeatureByIdAction(
                                          fd
                                        );
                                      if (r.error) {
                                        setMapGeomDeleteMsg(
                                          r.error
                                        );
                                        return;
                                      }
                                      setMapGeomDeleteMsg(
                                        "Satu fitur dihapus."
                                      );
                                      router.refresh();
                                    }
                                  );
                                }}
                              >
                                Hapus
                              </Button>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {mapGeomDeleteMsg && (
              <p
                className={`text-xs ${mapGeomDeleteMsg.includes("Terhapus") || mapGeomDeleteMsg.includes("Satu fitur") ? "text-emerald-700" : "text-red-600"}`}
                role="alert"
              >
                {mapGeomDeleteMsg}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  mapGeomFileMode === "geojson"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => {
                  setMapGeomFileMode("geojson");
                  setMapDxfError(null);
                  setMapGeomMsg(null);
                }}
              >
                GeoJSON
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  mapGeomFileMode === "dxf"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => {
                  setMapGeomFileMode("dxf");
                  setMapGeomMsg(null);
                  setMapGeomBatchText("");
                  setMapGeomGeojsonBatchPrefix("");
                  setMapGeojsonBatchKeys([]);
                  setMapGeojsonBatchLabels([]);
                  setMapShpLayers(null);
                  setMapShpSelectedFileName("");
                  setMapShpLoadHint(null);
                  setMapDxfError(null);
                }}
              >
                DXF
              </button>
            </div>

            {mapGeomFileMode === "geojson" ? (
              <form
                key={`geom-single-${mapGeomFormNonce}`}
                className="grid gap-3"
                action={(fd) => {
                  if (!selectedProjectId || !selectedTaskId) return;
                  setMapGeomMsg(null);
                  fd.set("project_id", selectedProjectId);
                  fd.set("issue_id", selectedTaskId);
                  fd.set("source_srid", mapGeomSourceSrid);
                  startMapGeomTransition(async () => {
                    const rawGeojson = String(
                      fd.get("geojson_json") ?? ""
                    ).trim();
                    if (!rawGeojson) {
                      setMapGeomMsg("GeoJSON wajib diisi.");
                      return;
                    }
                    let parsed: unknown;
                    try {
                      parsed = JSON.parse(rawGeojson);
                    } catch {
                      setMapGeomMsg("GeoJSON tidak valid.");
                      return;
                    }

                    const geoType =
                      parsed && typeof parsed === "object"
                        ? String((parsed as { type?: unknown }).type ?? "")
                        : "";

                    if (geoType === "FeatureCollection") {
                      const rowCount = listGeoJsonBatchPolygonRows(
                        parsed as GeoJsonFeatureCollectionForBatch
                      ).length;
                      if (
                        rowCount > 0 &&
                        (mapGeojsonBatchKeys.length !== rowCount ||
                          mapGeojsonBatchLabels.length !== rowCount)
                      ) {
                        setMapGeomMsg(
                          "Pemetaan key belum siap — tunggu sebentar atau ubah prefix/file lalu coba lagi."
                        );
                        return;
                      }
                      let batchJson = rawGeojson;
                      let prefixForBatch = mapGeomGeojsonBatchPrefix;
                      if (
                        rowCount > 0 &&
                        mapGeojsonBatchKeys.length === rowCount &&
                        mapGeojsonBatchLabels.length === rowCount
                      ) {
                        const mapped = applyGeoJsonBatchKeyLabelMapping(
                          rawGeojson,
                          mapGeojsonBatchKeys,
                          mapGeojsonBatchLabels
                        );
                        if (!mapped.ok) {
                          setMapGeomMsg(mapped.error);
                          return;
                        }
                        if (
                          mapped.json.length >
                          MAX_SPATIAL_GEOMETRY_TEXT_CHARS
                        ) {
                          setMapGeomMsg(
                            spatialGeometryTextTooLargeMessage(
                              "Batch GeoJSON"
                            )
                          );
                          return;
                        }
                        batchJson = mapped.json;
                        prefixForBatch = "";
                      }
                      const batchFd = new FormData();
                      batchFd.set("project_id", selectedProjectId);
                      batchFd.set("issue_id", selectedTaskId);
                      batchFd.set("batch_geojson_json", batchJson);
                      batchFd.set(
                        "feature_key_prefix",
                        prefixForBatch
                      );
                      batchFd.set("source_srid", mapGeomSourceSrid);
                      const r =
                        await upsertIssueGeometryFeatureBatchAction(
                          batchFd
                        );
                      if (r.error) {
                        setMapGeomMsg(r.error);
                        return;
                      }
                      const failText =
                        r.failed > 0 ? `, gagal ${r.failed}` : "";
                      const sampleText =
                        r.failureSamples.length > 0
                          ? ` (${r.failureSamples
                              .slice(0, 3)
                              .join(" | ")})`
                          : "";
                      setMapGeomMsg(
                        `Batch selesai: berhasil ${r.insertedOrUpdated}${failText}.${sampleText}`
                      );
                      onOpenChange(false);
                      router.refresh();
                      return;
                    }

                    const featureKey = String(
                      fd.get("feature_key") ?? ""
                    ).trim();
                    if (!featureKey) {
                      setMapGeomMsg(
                        "Feature key wajib diisi jika GeoJSON bukan FeatureCollection."
                      );
                      return;
                    }

                    const r = await upsertIssueGeometryFeatureAction(fd);
                    if (r.error) {
                      setMapGeomMsg(r.error);
                      return;
                    }
                    setMapGeomMsg("Berhasil simpan geometri.");
                    onOpenChange(false);
                    router.refresh();
                  });
                }}
              >
                <div className="space-y-1">
                  <Label>GeoJSON *</Label>
                  <Input
                    type="file"
                    accept=".geojson,.json,application/geo+json,application/json"
                    className="w-full overflow-hidden file:mr-3 file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-1 file:text-xs file:font-medium file:text-background hover:file:opacity-90"
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      if (!file) {
                        setMapGeomBatchText("");
                        setMapGeomGeojsonBatchPrefix("");
                        setMapShpLayers(null);
                        setMapShpSelectedFileName("");
                        setMapShpLoadHint(null);
                        return;
                      }
                      setMapGeomMsg(null);
                      setMapShpLayers(null);
                      setMapShpSelectedFileName("");
                      setMapShpLoadHint(null);
                      const reader = new FileReader();
                      reader.onload = () => {
                        const raw =
                          typeof reader.result === "string"
                            ? reader.result
                            : "";
                        if (raw.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
                          setMapGeomBatchText("");
                          setMapGeomMsg(
                            spatialGeometryTextTooLargeMessage(
                              "GeoJSON"
                            )
                          );
                          return;
                        }
                        try {
                          const parsed = JSON.parse(raw);
                          setMapGeomGeojsonBatchPrefix("");
                          setMapGeomBatchText(
                            JSON.stringify(parsed, null, 2)
                          );
                        } catch {
                          setMapGeomGeojsonBatchPrefix("");
                          setMapGeomBatchText(raw);
                        }
                      };
                      reader.onerror = () => {
                        setMapGeomMsg(
                          "Gagal membaca file. Coba file .geojson/.json lain."
                        );
                      };
                      reader.readAsText(file);
                    }}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Batas isi file teks ~{MAX_SPATIAL_GEOMETRY_TEXT_MB} MB
                    (sama untuk GeoJSON dan DXF).
                  </p>
                  <div className="space-y-2 rounded-md border border-dashed border-border/80 bg-muted/25 px-3 py-2">
                    <p className="text-[11px] font-medium text-foreground">
                      Atau ZIP shapefile (.shp + .dbf, idealnya .shx + .prj)
                    </p>
                    <Input
                      type="file"
                      accept=".zip,application/zip"
                      className="w-full overflow-hidden file:mr-3 file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-1 file:text-xs file:font-medium file:text-background hover:file:opacity-90"
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0];
                        if (!file) {
                          setMapShpLayers(null);
                          setMapShpSelectedFileName("");
                          setMapShpLoadHint(null);
                          return;
                        }
                        setMapGeomMsg(null);
                        setMapShpLoadHint(null);
                        const reader = new FileReader();
                        reader.onload = async () => {
                          const buf = reader.result;
                          if (!(buf instanceof ArrayBuffer)) {
                            setMapGeomMsg(
                              "Gagal membaca ZIP shapefile."
                            );
                            return;
                          }
                          if (buf.byteLength > MAX_SHAPEFILE_ZIP_BYTES) {
                            setMapShpLayers(null);
                            setMapShpSelectedFileName("");
                            setMapGeomBatchText("");
                            setMapGeomMsg(shapefileZipTooLargeMessage());
                            return;
                          }
                          const parsed =
                            await parseShapefileZipToPolygonLayers(buf);
                          if (!parsed.ok) {
                            setMapShpLayers(null);
                            setMapShpSelectedFileName("");
                            setMapGeomBatchText("");
                            setMapGeomMsg(parsed.error);
                            return;
                          }
                          const layers = parsed.layers;
                          setMapShpLayers(layers);
                          const first = layers[0]!;
                          setMapShpSelectedFileName(first.fileName);
                          setMapGeomGeojsonBatchPrefix("");
                          const ok = applyShapefileLayerToBatch(
                            layers,
                            first.fileName
                          );
                          if (!ok) {
                            setMapShpLayers(null);
                            setMapShpSelectedFileName("");
                          }
                        };
                        reader.onerror = () => {
                          setMapGeomMsg(
                            "Gagal membaca ZIP. Coba file lain."
                          );
                        };
                        reader.readAsArrayBuffer(file);
                      }}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Batas ZIP ~{Math.round(MAX_SHAPEFILE_ZIP_BYTES / (1024 * 1024))} MB.
                      Hasil konversi ke GeoJSON batch tidak boleh melebihi
                      ~{MAX_SPATIAL_GEOMETRY_TEXT_MB} MB teks. Jika ada{" "}
                      <span className="font-mono">.prj</span> yang dikenali
                      parser, koordinat biasanya sudah lon/lat — pilih{" "}
                      <span className="font-mono">EPSG:4326</span>. Tanpa{" "}
                      <span className="font-mono">.prj</span>, pilih SRID
                      sesuai koordinat di berkas .shp.
                    </p>
                    {mapShpLayers && mapShpLayers.length > 1 && (
                      <div className="space-y-1">
                        <Label className="text-xs">Layer di ZIP</Label>
                        <select
                          value={mapShpSelectedFileName}
                          onChange={(ev) => {
                            const name = ev.target.value;
                            setMapShpSelectedFileName(name);
                            applyShapefileLayerToBatch(mapShpLayers, name);
                          }}
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                        >
                          {mapShpLayers.map((ly) => (
                            <option key={ly.fileName} value={ly.fileName}>
                              {ly.fileName} ({ly.polygonFeatureCount} poligon)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {mapShpLoadHint && (
                      <p
                        className="text-[11px] text-muted-foreground"
                        role="status"
                      >
                        {mapShpLoadHint}
                      </p>
                    )}
                  </div>
                  <input
                    type="hidden"
                    name="geojson_json"
                    value={mapGeomBatchText}
                  />
                </div>
                {mapGeomDetectedKind === "single" && (
                  <>
                    <div className="space-y-1">
                      <Label>Feature key *</Label>
                      <Input
                        name="feature_key"
                        placeholder="contoh: sambeng-001 / bidang-12"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Label (opsional)</Label>
                      <Input
                        name="label"
                        placeholder="contoh: Bidang Sambeng A1"
                      />
                    </div>
                  </>
                )}
                {mapGeomDetectedKind === "batch" && (
                  <>
                    <div className="space-y-1">
                      <Label>Prefix key (opsional)</Label>
                      <Input
                        value={mapGeomGeojsonBatchPrefix}
                        onChange={(e) =>
                          setMapGeomGeojsonBatchPrefix(e.target.value)
                        }
                        placeholder="contoh: sambeng-"
                        autoComplete="off"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Mengubah prefix mengatur ulang kolom Feature key dari
                        properti file (atur manual di tabel bila perlu).
                      </p>
                    </div>
                    {mapGeojsonBatchKeys.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs">
                          Feature key & label per poligon (
                          {mapGeojsonBatchKeys.length})
                        </Label>
                        <p className="text-[11px] text-muted-foreground">
                          Kolom <span className="font-medium text-foreground">Geometri</span>:{" "}
                          <span className="font-medium">Sudah ada</span> = key ini sudah punya
                          geometri untuk unit kerja ini (simpan akan menimpa);{" "}
                          <span className="font-medium">Belum</span> = belum ada.
                        </p>
                        <div className="max-h-[38vh] overflow-y-auto rounded-md border border-border">
                          <table className="w-full border-collapse text-left text-[11px]">
                            <thead>
                              <tr className="border-b border-border bg-muted/50 text-muted-foreground">
                                <th className="w-8 px-1.5 py-1 font-medium">
                                  #
                                </th>
                                <th className="w-[5.5rem] shrink-0 px-1.5 py-1 font-medium">
                                  Geometri
                                </th>
                                <th className="px-1.5 py-1 font-medium">
                                  Feature key
                                </th>
                                <th className="px-1.5 py-1 font-medium">
                                  Label
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {mapGeojsonBatchKeys.map((keyVal, i) => (
                                <tr
                                  key={i}
                                  className="border-b border-border/60 align-top"
                                >
                                  <td className="px-1.5 py-1 text-muted-foreground">
                                    {i + 1}
                                  </td>
                                  <td className="px-1 py-1 align-middle">
                                    {geometryKeyStatusCell(
                                      keyVal,
                                      geometryKeysLowerForSelectedTask
                                    )}
                                  </td>
                                  <td className="px-1 py-0.5">
                                    <Input
                                      value={keyVal}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setMapGeojsonBatchKeys((prev) => {
                                          const next = [...prev];
                                          next[i] = v;
                                          return next;
                                        });
                                      }}
                                      className="h-7 px-1.5 font-mono text-[11px]"
                                      autoComplete="off"
                                    />
                                  </td>
                                  <td className="px-1 py-0.5">
                                    <Input
                                      value={
                                        mapGeojsonBatchLabels[i] ?? ""
                                      }
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setMapGeojsonBatchLabels((prev) => {
                                          const next = [...prev];
                                          next[i] = v;
                                          return next;
                                        });
                                      }}
                                      className="h-7 px-1.5 text-[11px]"
                                      autoComplete="off"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Hanya fitur Polygon/MultiPolygon; urutan sama proses
                          batch server.
                        </p>
                      </div>
                    )}
                  </>
                )}
                <div className="space-y-1">
                  <Label>EPSG/SRID sumber</Label>
                  <select
                    name="source_srid"
                    value={mapGeomSourceSrid}
                    onChange={(e) =>
                      setMapGeomSourceSrid(e.target.value)
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    {SOURCE_SRID_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Koordinat dari CRS ini otomatis ditransform ke
                    WGS84 (EPSG:4326) saat disimpan.
                  </p>
                </div>
                {mapGeomDetectedKind === "none" && (
                  <p className="text-xs text-muted-foreground">
                    Pilih file GeoJSON dulu untuk menampilkan form sesuai
                    tipe data (single atau batch).
                  </p>
                )}
                {mapGeomDetectedKind === "invalid" && (
                  <p className="text-xs text-red-600" role="alert">
                    File/isi GeoJSON tidak valid.
                  </p>
                )}
                {mapGeomDetectedKind === "unsupported" && (
                  <p className="text-xs text-red-600" role="alert">
                    Tipe GeoJSON belum didukung. Gunakan Polygon,
                    MultiPolygon, Feature, atau FeatureCollection.
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={
                    mapGeomPending ||
                    mapGeomDetectedKind === "none" ||
                    mapGeomDetectedKind === "invalid" ||
                    mapGeomDetectedKind === "unsupported" ||
                    (mapGeomDetectedKind === "batch" &&
                      mapGeomGeojsonPolygonRowCount > 0 &&
                      mapGeojsonBatchKeys.length !==
                        mapGeomGeojsonPolygonRowCount)
                  }
                >
                  Simpan geometri
                </Button>
              </form>
            ) : (
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label>File DXF *</Label>
                  <Input
                    type="file"
                    accept=".dxf,text/plain,application/dxf,application/x-dxf"
                    className="w-full overflow-hidden file:mr-3 file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-1 file:text-xs file:font-medium file:text-background hover:file:opacity-90"
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      if (!file) {
                        setMapDxfRawText("");
                        setMapDxfLayers([]);
                        setMapDxfLayer("");
                        setMapDxfPolygonCount(0);
                        setMapDxfPreviewRings([]);
                        mapDxfParsedRef.current = null;
                        setMapDxfError(null);
                        return;
                      }
                      setMapGeomMsg(null);
                      setMapDxfError(null);
                      const reader = new FileReader();
                      reader.onload = () => {
                        const raw =
                          typeof reader.result === "string"
                            ? reader.result
                            : "";
                        if (raw.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
                          setMapDxfRawText("");
                          setMapDxfLayers([]);
                          setMapDxfLayer("");
                          setMapDxfPolygonCount(0);
                          setMapDxfPreviewRings([]);
                          mapDxfParsedRef.current = null;
                          setMapDxfError(
                            spatialGeometryTextTooLargeMessage("DXF")
                          );
                          return;
                        }
                        setMapDxfRawText(raw);
                        try {
                          const dxf = parseDxfDocument(raw);
                          mapDxfParsedRef.current = dxf;
                          const layers = listDxfLayerNames(dxf, raw);
                          setMapDxfLayers(layers);
                          const first = layers[0] ?? "";
                          setMapDxfLayer(first);
                          const rings = first
                            ? extractClosedPolygonRingsFromDxfLayer(
                                dxf,
                                first,
                                raw
                              )
                            : [];
                          setMapDxfPolygonCount(rings.length);
                          setMapDxfPreviewRings(rings);
                        } catch (err) {
                          mapDxfParsedRef.current = null;
                          setMapDxfLayers([]);
                          setMapDxfLayer("");
                          setMapDxfPolygonCount(0);
                          setMapDxfPreviewRings([]);
                          setMapDxfError(
                            err instanceof Error
                              ? err.message
                              : "Gagal membaca DXF."
                          );
                        }
                      };
                      reader.onerror = () => {
                        setMapDxfError("Gagal membaca file DXF.");
                      };
                      reader.readAsText(file);
                    }}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">
                      LWPOLYLINE
                    </span>
                    ,{" "}
                    <span className="font-medium text-foreground">
                      POLYLINE
                    </span>{" "}
                    tertutup,{" "}
                    <span className="font-medium text-foreground">
                      INSERT
                    </span>{" "}
                    blok (LW/PL tertutup di blok) pada layer yang dipilih, atau{" "}
                    <span className="font-medium text-foreground">
                      HATCH
                    </span>{" "}
                    (boundary poliline / garis+busur); bulge diraster. Koordinat Z
                    diabaikan.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Batas isi file teks ~{MAX_SPATIAL_GEOMETRY_TEXT_MB} MB
                    (sama untuk GeoJSON dan DXF).
                  </p>
                </div>
                {mapDxfError && (
                  <p className="text-xs text-red-600" role="alert">
                    {mapDxfError}
                  </p>
                )}
                {mapDxfLayers.length > 0 && (
                  <div className="space-y-1">
                    <Label>Layer</Label>
                    <select
                      value={mapDxfLayer}
                      onChange={(e) => {
                        const v = e.target.value;
                        setMapDxfLayer(v);
                        const dxf = mapDxfParsedRef.current;
                        if (!dxf) return;
                        try {
                          const rings =
                            extractClosedPolygonRingsFromDxfLayer(
                              dxf,
                              v,
                              mapDxfRawText
                            );
                          setMapDxfPolygonCount(rings.length);
                          setMapDxfPreviewRings(rings);
                          setMapDxfError(null);
                        } catch (err) {
                          setMapDxfPolygonCount(0);
                          setMapDxfPreviewRings([]);
                          setMapDxfError(
                            err instanceof Error
                              ? err.message
                              : "Gagal menganalisis layer."
                          );
                        }
                      }}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      {mapDxfLayers.map((ly) => (
                        <option key={ly} value={ly}>
                          {ly}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Prefix feature_key (opsional)</Label>
                  <Input
                    value={mapDxfKeyPrefix}
                    onChange={(e) => setMapDxfKeyPrefix(e.target.value)}
                    placeholder="contoh: bidang- — mengisi ulang key di tabel"
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Default key per baris:{" "}
                    <span className="font-mono text-[10px]">
                      {"{prefix}{layer-slug}-{nomor}"}
                    </span>
                    . Mengubah prefix/layer mengatur ulang tabel; edit manual
                    per baris agar cocok dengan CSV atribut.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>EPSG/SRID sumber</Label>
                  <select
                    value={mapGeomSourceSrid}
                    onChange={(e) =>
                      setMapGeomSourceSrid(e.target.value)
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    {SOURCE_SRID_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Koordinat dari CRS ini otomatis ditransform ke WGS84
                    (EPSG:4326) saat disimpan.
                  </p>
                </div>
                {mapDxfPolygonCount > 0 && mapDxfLayer && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">
                      Mapping feature_key & label ({mapDxfPolygonCount}{" "}
                      poligon)
                    </p>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-foreground">
                        Pratinjau poligon (WGS84 / peta dasar)
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Klik poligon di peta untuk menyorot baris di bawah;
                        klik baris tabel (di luar kotak isian) untuk
                        menyorot poligon. Proyeksi mengikuti SRID sumber yang
                        dipilih.
                      </p>
                      {mapDxfPreviewFeatureCollection.err ? (
                        <p
                          className="text-xs text-amber-700 dark:text-amber-500/95"
                          role="status"
                        >
                          {mapDxfPreviewFeatureCollection.err} Tabel mapping
                          tetap bisa dipakai.
                        </p>
                      ) : null}
                      <DxfMappingPreviewMap
                        featureCollection={
                          mapDxfPreviewFeatureCollection.fc
                        }
                        highlightIndex={mapDxfHighlightRow}
                        onSelectPolygon={handleDxfPreviewPolygonClick}
                      />
                    </div>
                    <div className="rounded-md border border-border bg-muted/25 px-3 py-2">
                      <Label className="text-xs font-medium text-foreground">
                        Saran dari atribut (belum ada geometri di unit kerja
                        ini)
                      </Label>
                      {mapDxfAttributeKeysWithoutGeometry.length === 0 ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Tidak ada baris atribut tanpa geometri untuk unit
                          kerja ini.
                        </p>
                      ) : (
                        <>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Klik key untuk menambahkannya ke textarea tempel;
                            atau isi tabel langsung dari daftar terurut.
                          </p>
                          <div className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                            {mapDxfAttributeKeysWithoutGeometry.map((k) => (
                              <Button
                                key={k}
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 max-w-full shrink-0 px-2 font-mono text-[10px]"
                                title={`Tambahkan "${k}" ke daftar tempel`}
                                onClick={() => {
                                  setMapDxfBulkKeyText((prev) => {
                                    const t = prev.trim();
                                    return t ? `${t}\n${k}` : k;
                                  });
                                  setMapDxfBulkKeyHint(null);
                                }}
                              >
                                {k}
                              </Button>
                            ))}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-8 text-xs"
                              onClick={() => {
                                setMapDxfBulkKeyText(
                                  mapDxfAttributeKeysWithoutGeometry.join(
                                    "\n"
                                  )
                                );
                                setMapDxfBulkKeyHint(null);
                              }}
                            >
                              Salin semua ke textarea tempel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-8 text-xs"
                              onClick={() => {
                                const sug = mapDxfAttributeKeysWithoutGeometry;
                                const n = mapDxfPolygonCount;
                                setMapDxfFeatureKeys((prev) => {
                                  const next = [...prev];
                                  const take = Math.min(sug.length, next.length);
                                  for (let i = 0; i < take; i++) {
                                    next[i] = sug[i]!;
                                  }
                                  return next;
                                });
                                if (sug.length > n) {
                                  setMapDxfBulkKeyHint(
                                    `Mengisi ${n} baris pertama dari ${sug.length} key atribut; sisanya edit manual atau tempel.`
                                  );
                                } else if (sug.length < n) {
                                  setMapDxfBulkKeyHint(
                                    `Mengisi ${sug.length} baris pertama; ${n - sug.length} baris di bawah tidak diubah.`
                                  );
                                } else {
                                  setMapDxfBulkKeyHint(
                                    `Semua ${sug.length} baris diisi dari daftar atribut (urutan alfabet).`
                                  );
                                }
                              }}
                            >
                              Terapkan ke tabel (urutan terurut)
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0 text-xs"
                        onClick={() => {
                          const csv = dxfKeyMappingTemplateCsv();
                          const blob = new Blob([csv], {
                            type: "text/csv;charset=utf-8",
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "template-mapping-dxf-feature_key.csv";
                          a.rel = "noopener";
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        Unduh template CSV (feature_key + label)
                      </Button>
                      <p className="min-w-0 max-w-xl text-[11px] text-muted-foreground">
                        Untuk spreadsheet lapangan: baris setelah header = urutan poligon #1,
                        #2, …; salin kolom feature_key ke textarea tempel di bawah. Kolom
                        label opsional selaras dengan tabel.
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-muted/25 px-3 py-2">
                      <Label className="text-xs font-medium text-foreground">
                        Tempel daftar feature_key (satu per baris)
                      </Label>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Salin satu kolom dari spreadsheet / CSV: baris ke-1
                        → poligon #1, dst. Kosongkan baris diabaikan.
                      </p>
                      <Textarea
                        value={mapDxfBulkKeyText}
                        onChange={(e) => {
                          setMapDxfBulkKeyText(e.target.value);
                          setMapDxfBulkKeyHint(null);
                        }}
                        placeholder={"key-a\nkey-b\nkey-c"}
                        rows={3}
                        className="mt-2 min-h-[4.5rem] resize-y font-mono text-[11px]"
                        aria-label="Daftar feature_key untuk ditempel"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="mt-2 h-8 text-xs"
                        onClick={() => {
                          const lines = mapDxfBulkKeyText
                            .split(/\r?\n/)
                            .map((s) => s.trim())
                            .filter((s) => s.length > 0);
                          if (lines.length === 0) {
                            setMapDxfBulkKeyHint(
                              "Tidak ada baris non-kosong untuk diterapkan."
                            );
                            return;
                          }
                          const n = mapDxfPolygonCount;
                          setMapDxfFeatureKeys((prev) => {
                            const next = [...prev];
                            const take = Math.min(lines.length, next.length);
                            for (let i = 0; i < take; i++) {
                              next[i] = lines[i]!;
                            }
                            return next;
                          });
                          if (lines.length > n) {
                            setMapDxfBulkKeyHint(
                              `Memakai ${n} baris pertama; ${lines.length - n} baris ekstra diabaikan.`
                            );
                          } else if (lines.length < n) {
                            setMapDxfBulkKeyHint(
                              `Mengisi ${lines.length} baris pertama; ${n - lines.length} baris di bawah tidak diubah.`
                            );
                          } else {
                            setMapDxfBulkKeyHint(
                              `Semua ${lines.length} baris diterapkan ke tabel.`
                            );
                          }
                        }}
                      >
                        Terapkan ke kolom Feature key
                      </Button>
                      {mapDxfBulkKeyHint ? (
                        <p
                          className="mt-2 text-[11px] text-muted-foreground"
                          role="status"
                        >
                          {mapDxfBulkKeyHint}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Kolom <span className="font-medium text-foreground">Geometri</span>:{" "}
                      <span className="font-medium">Sudah ada</span> = key ini sudah punya
                      geometri untuk unit kerja ini (simpan akan menimpa);{" "}
                      <span className="font-medium">Belum</span> = belum ada.
                    </p>
                    <div className="max-h-52 overflow-y-auto rounded-md border border-border">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="sticky top-0 border-b border-border bg-muted/80 text-muted-foreground">
                            <th className="w-10 px-2 py-1.5 font-medium">#</th>
                            <th className="w-[5.5rem] shrink-0 px-2 py-1.5 font-medium">
                              Geometri
                            </th>
                            <th className="min-w-[8rem] px-2 py-1.5 font-medium">
                              Feature key
                            </th>
                            <th className="min-w-[7rem] px-2 py-1.5 font-medium">
                              Label (opsional)
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {mapDxfFeatureKeys.map((key, idx) => (
                            <tr
                              key={`dxf-key-${idx}`}
                              ref={(el) => {
                                dxfMappingRowRefs.current[idx] = el;
                              }}
                              onClick={(e) => {
                                if (
                                  (e.target as HTMLElement).closest(
                                    "input, textarea, button, select, a"
                                  )
                                ) {
                                  return;
                                }
                                setMapDxfHighlightRow(idx);
                              }}
                              className={cn(
                                "border-b border-border/60 last:border-0",
                                mapDxfHighlightRow === idx
                                  ? "bg-orange-500/12 ring-1 ring-orange-500/35 ring-inset"
                                  : "cursor-pointer hover:bg-muted/45"
                              )}
                            >
                              <td className="px-2 py-1.5 text-muted-foreground">
                                {idx + 1}
                              </td>
                              <td className="px-1 py-1.5 align-middle">
                                {geometryKeyStatusCell(
                                  key,
                                  geometryKeysLowerForSelectedTask
                                )}
                              </td>
                              <td className="px-1 py-0.5">
                                <Input
                                  value={key}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setMapDxfFeatureKeys((prev) => {
                                      const next = [...prev];
                                      next[idx] = v;
                                      return next;
                                    });
                                  }}
                                  className="h-8 font-mono text-[11px]"
                                  autoComplete="off"
                                  aria-label={`Feature key poligon ${idx + 1}`}
                                />
                              </td>
                              <td className="px-1 py-0.5">
                                <Input
                                  value={mapDxfFeatureLabels[idx] ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setMapDxfFeatureLabels((prev) => {
                                      const next = [...prev];
                                      next[idx] = v;
                                      return next;
                                    });
                                  }}
                                  className="h-8 text-[11px]"
                                  placeholder={`DXF ${mapDxfLayer} #${idx + 1}`}
                                  autoComplete="off"
                                  aria-label={`Label poligon ${idx + 1}`}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <Button
                  type="button"
                  disabled={
                    mapGeomPending ||
                    !!mapDxfError ||
                    !mapDxfRawText.trim() ||
                    !mapDxfLayer.trim() ||
                    mapDxfPolygonCount === 0 ||
                    mapDxfFeatureKeys.length !== mapDxfPolygonCount ||
                    mapDxfFeatureLabels.length !== mapDxfPolygonCount ||
                    !mapDxfFeatureKeys.every((k) => k.trim())
                  }
                  onClick={() => {
                    if (!selectedProjectId || !selectedTaskId) return;
                    setMapGeomMsg(null);
                    startMapGeomTransition(async () => {
                      const fd = new FormData();
                      fd.set("project_id", selectedProjectId);
                      fd.set("issue_id", selectedTaskId);
                      fd.set("dxf_text", mapDxfRawText);
                      fd.set("layer_name", mapDxfLayer);
                      fd.set(
                        "feature_key_prefix",
                        mapDxfKeyPrefix.trim()
                      );
                      fd.set(
                        "feature_keys_json",
                        JSON.stringify(mapDxfFeatureKeys.map((k) => k.trim()))
                      );
                      fd.set(
                        "feature_labels_json",
                        JSON.stringify(
                          mapDxfFeatureLabels.map((lb) => lb.trim())
                        )
                      );
                      fd.set("source_srid", mapGeomSourceSrid);
                      const r =
                        await upsertIssueGeometryFeaturesFromDxfAction(
                          fd
                        );
                      if (r.error) {
                        setMapGeomMsg(r.error);
                        return;
                      }
                      const failText =
                        r.failed > 0 ? `, gagal ${r.failed}` : "";
                      const sampleText =
                        r.failureSamples.length > 0
                          ? ` (${r.failureSamples
                              .slice(0, 3)
                              .join(" | ")})`
                          : "";
                      setMapGeomMsg(
                        `Impor DXF selesai: berhasil ${r.insertedOrUpdated}${failText}.${sampleText}`
                      );
                      onOpenChange(false);
                      router.refresh();
                    });
                  }}
                >
                  Simpan geometri dari DXF
                </Button>
              </div>
            )}

            {mapGeomMsg && (
              <p
                className={`text-xs ${mapGeomMsg.includes("Berhasil") || mapGeomMsg.includes("Batch selesai") || mapGeomMsg.includes("Impor DXF selesai") ? "text-emerald-700" : "text-red-600"}`}
                role="alert"
              >
                {mapGeomMsg}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
