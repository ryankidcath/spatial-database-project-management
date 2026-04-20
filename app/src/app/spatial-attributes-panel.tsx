"use client";

import { useRouter } from "next/navigation";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteIssueFeatureAttributeAction,
  upsertIssueFeatureAttributePayloadAction,
  upsertIssueFeatureAttributesCsvAction,
} from "./issue-feature-attribute-actions";
import {
  deleteIssueGeometryFeatureByIdAction,
  updateIssueGeometryFeaturePropertiesAction,
} from "./issue-geometry-feature-actions";
import { attributeFeatureKeyTemplateCsv } from "@/lib/spatial-import-limits";
import type {
  IssueGeometryFeatureMapRow,
  SpatialAttributeTableRow,
} from "./spatial-attribute-types";

const SPATIAL_TABLE_PAGE_SIZE = 100;

/** Panjang preview nilai untuk filter pencarian atribut spasial (lebih kecil = lebih ringan). */
const SPATIAL_SEARCH_VALUE_PREVIEW = 160;

function issueGeometryPropertiesForDisplay(
  row: { properties: unknown; feature_key: string }
): Record<string, unknown> {
  const props =
    typeof row.properties === "object" && row.properties !== null
      ? ({ ...row.properties } as Record<string, unknown>)
      : {};
  return {
    ...props,
    feature_key: row.feature_key,
  };
}

function compactValuePreview(value: unknown, maxChars = 120): string {
  if (value == null) return "—";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  try {
    const text = JSON.stringify(value) ?? "";
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
  } catch {
    return String(value);
  }
}

function spatialSearchValueMatches(value: unknown, query: string): boolean {
  if (value == null) return false;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).toLowerCase().includes(query);
  }
  return compactValuePreview(value, SPATIAL_SEARCH_VALUE_PREVIEW)
    .toLowerCase()
    .includes(query);
}

type SpatialAttributeSearchFieldProps = {
  resetKey: string;
  onDebouncedQuery: (normalizedQuery: string) => void;
  debounceMs?: number;
};

function SpatialAttributeSearchField({
  resetKey,
  onDebouncedQuery,
  debounceMs = 200,
}: SpatialAttributeSearchFieldProps) {
  const [value, setValue] = useState("");
  const [pendingApply, setPendingApply] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue("");
    setPendingApply(false);
    onDebouncedQuery("");
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [resetKey, onDebouncedQuery]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return (
    <div className="flex min-w-0 max-w-full flex-1 items-center gap-2 sm:max-w-[14rem] md:max-w-xs">
      <Input
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          setPendingApply(true);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            setPendingApply(false);
            onDebouncedQuery(next.trim().toLowerCase());
          }, debounceMs);
        }}
        placeholder="Cari unit kerja / atribut / nilai..."
        className="h-8 min-w-0 flex-1 text-xs"
        aria-busy={pendingApply}
      />
      {pendingApply ? (
        <span className="shrink-0 text-[10px] text-muted-foreground" title="Menyaring…">
          …
        </span>
      ) : null}
    </div>
  );
}

const NON_EDITABLE_SPATIAL_ATTR_KEYS = new Set(["_row_id", "feature_key"]);

type SpatialAttributeEditEntry = { key: string; value: string };

function cellValueForSpatialEditInput(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function parseSpatialAttributeValue(text: string): unknown {
  const t = text.trim();
  if (t === "") return "";
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (!/^["[{]/.test(t) && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) {
    return Number(t);
  }
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return text;
  }
}

function buildSpatialAttributeEditEntries(
  row: IssueGeometryFeatureMapRow
): SpatialAttributeEditEntry[] {
  const merged = issueGeometryPropertiesForDisplay(row);
  const entries: SpatialAttributeEditEntry[] = [];
  for (const [k, v] of Object.entries(merged)) {
    if (NON_EDITABLE_SPATIAL_ATTR_KEYS.has(k)) continue;
    entries.push({ key: k, value: cellValueForSpatialEditInput(v) });
  }
  if (entries.length === 0) entries.push({ key: "", value: "" });
  return entries;
}

function buildSpatialAttributeEditEntriesFromTableRow(
  row: SpatialAttributeTableRow
): SpatialAttributeEditEntry[] {
  const merged = issueGeometryPropertiesForDisplay(row);
  const entries: SpatialAttributeEditEntry[] = [];
  for (const [k, v] of Object.entries(merged)) {
    if (NON_EDITABLE_SPATIAL_ATTR_KEYS.has(k)) continue;
    entries.push({ key: k, value: cellValueForSpatialEditInput(v) });
  }
  if (entries.length === 0) entries.push({ key: "", value: "" });
  return entries;
}

export type SpatialAttributesPanelProps = {
  rows: SpatialAttributeTableRow[];
  issueTitleById: Map<string, string>;
  issueGeometryFeatureMap: IssueGeometryFeatureMapRow[];
  selectedProjectId: string | null;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  unitKerjaColumnLabel: string;
};

function SpatialAttributesPanelInner({
  rows,
  issueTitleById,
  issueGeometryFeatureMap,
  selectedProjectId,
  selectedTaskId,
  selectedTaskTitle,
  unitKerjaColumnLabel,
}: SpatialAttributesPanelProps) {
  const router = useRouter();
  const [spatialSearchQuery, setSpatialSearchQuery] = useState("");
  const [, startSpatialSearchFilterTransition] = useTransition();
  const [spatialTablePage, setSpatialTablePage] = useState(1);

  const [spatialAddAttrDialogOpen, setSpatialAddAttrDialogOpen] = useState(false);
  const [spatialAddAttrKey, setSpatialAddAttrKey] = useState("");
  const [spatialAddAttrEntries, setSpatialAddAttrEntries] = useState<
    SpatialAttributeEditEntry[]
  >([{ key: "", value: "" }]);
  const [spatialAddAttrMsg, setSpatialAddAttrMsg] = useState<string | null>(null);
  const [spatialAddAttrPending, startSpatialAddAttrTransition] = useTransition();

  const [spatialAttrImportDialogOpen, setSpatialAttrImportDialogOpen] =
    useState(false);
  const [mapAttrCsvText, setMapAttrCsvText] = useState("");
  const [mapAttrMsg, setMapAttrMsg] = useState<string | null>(null);
  const [mapAttrImportPending, startMapAttrImportTransition] = useTransition();

  const [spatialAttributeEditRow, setSpatialAttributeEditRow] =
    useState<IssueGeometryFeatureMapRow | null>(null);
  const [spatialAttributeEditAttrRow, setSpatialAttributeEditAttrRow] =
    useState<SpatialAttributeTableRow | null>(null);
  const [spatialAttributeEditEntries, setSpatialAttributeEditEntries] = useState<
    SpatialAttributeEditEntry[]
  >([]);
  const [spatialAttributeEditMsg, setSpatialAttributeEditMsg] = useState<
    string | null
  >(null);
  const [spatialAttributeEditPending, startSpatialAttributeEditTransition] =
    useTransition();
  const [spatialRowDeletingId, setSpatialRowDeletingId] = useState<string | null>(null);
  const [spatialDeleteMsg, setSpatialDeleteMsg] = useState<string | null>(null);
  const [spatialDeleteConfirmRow, setSpatialDeleteConfirmRow] =
    useState<SpatialAttributeTableRow | null>(null);
  const [, startSpatialRowDeleteTransition] = useTransition();

  const applySpatialSearchQuery = useCallback((q: string) => {
    startSpatialSearchFilterTransition(() => {
      setSpatialSearchQuery(q);
    });
  }, [startSpatialSearchFilterTransition]);

  const spatialAttributePropertyKeysForNewRow = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const props = issueGeometryPropertiesForDisplay(row);
      for (const key of Object.keys(props)) {
        if (NON_EDITABLE_SPATIAL_ATTR_KEYS.has(key)) continue;
        set.add(key);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const issueGeometryRowsForTableViewFiltered = useMemo(() => {
    if (!spatialSearchQuery) return rows;
    return rows.filter((row) => {
      const unitTitle = (issueTitleById.get(row.issue_id) ?? row.issue_id).toLowerCase();
      if (unitTitle.includes(spatialSearchQuery)) return true;
      const props = issueGeometryPropertiesForDisplay(row);
      for (const [key, value] of Object.entries(props)) {
        if (key.toLowerCase().includes(spatialSearchQuery)) return true;
        if (spatialSearchValueMatches(value, spatialSearchQuery)) return true;
      }
      return false;
    });
  }, [rows, issueTitleById, spatialSearchQuery]);

  const spatialTableTotalRows = issueGeometryRowsForTableViewFiltered.length;
  const spatialTableTotalPages = Math.max(
    1,
    Math.ceil(spatialTableTotalRows / SPATIAL_TABLE_PAGE_SIZE)
  );

  useEffect(() => {
    setSpatialTablePage(1);
  }, [spatialSearchQuery, selectedProjectId, selectedTaskId]);

  useEffect(() => {
    if (spatialTablePage > spatialTableTotalPages) {
      setSpatialTablePage(spatialTableTotalPages);
    }
  }, [spatialTablePage, spatialTableTotalPages]);

  const issueGeometryRowsForTableViewPaged = useMemo(() => {
    const start = (spatialTablePage - 1) * SPATIAL_TABLE_PAGE_SIZE;
    return issueGeometryRowsForTableViewFiltered.slice(
      start,
      start + SPATIAL_TABLE_PAGE_SIZE
    );
  }, [issueGeometryRowsForTableViewFiltered, spatialTablePage]);

  const issueGeometryAttributeKeysForTableView = useMemo(() => {
    const set = new Set<string>();
    for (const row of issueGeometryRowsForTableViewFiltered) {
      const props = issueGeometryPropertiesForDisplay(row);
      for (const key of Object.keys(props)) {
        if (key === "_row_id") continue;
        set.add(key);
      }
    }
    const keys = [...set].sort((a, b) => a.localeCompare(b));
    return ["feature_key", ...keys.filter((k) => k !== "feature_key")];
  }, [issueGeometryRowsForTableViewFiltered]);

  const openSpatialDeleteConfirm = useCallback(
    (row: SpatialAttributeTableRow) => {
      if (!selectedProjectId) return;
      if (row.geometryFeatureId) {
        const geom = issueGeometryFeatureMap.find((g) => g.id === row.geometryFeatureId);
        if (!geom) return;
      }
      setSpatialDeleteConfirmRow(row);
    },
    [issueGeometryFeatureMap, selectedProjectId]
  );

  const spatialDeleteConfirmDescription = useMemo(() => {
    const row = spatialDeleteConfirmRow;
    if (!row) return "";
    const unit = issueTitleById.get(row.issue_id) ?? row.issue_id;
    if (row.geometryFeatureId) {
      return `Fitur geometri dengan feature_key "${row.feature_key}" pada ${unit} akan dihapus. Bentuk di peta ikut hilang dan tidak bisa dibatalkan lewat tombol ini.`;
    }
    return `Baris atribut dengan feature_key "${row.feature_key}" pada ${unit} akan dihapus dari tabel.`;
  }, [spatialDeleteConfirmRow, issueTitleById]);

  const runSpatialRowDelete = useCallback(
    (row: SpatialAttributeTableRow) => {
      if (!selectedProjectId) return;
      if (row.geometryFeatureId) {
        const geom = issueGeometryFeatureMap.find((g) => g.id === row.geometryFeatureId);
        if (!geom) return;
        startSpatialRowDeleteTransition(async () => {
          setSpatialDeleteMsg(null);
          setSpatialRowDeletingId(row.id);
          const fd = new FormData();
          fd.set("project_id", geom.project_id);
          fd.set("issue_id", geom.issue_id);
          fd.set("feature_id", geom.id);
          const r = await deleteIssueGeometryFeatureByIdAction(fd);
          setSpatialRowDeletingId(null);
          if (r.error) {
            setSpatialDeleteMsg(r.error);
            return;
          }
          router.refresh();
        });
        return;
      }
      startSpatialRowDeleteTransition(async () => {
        setSpatialDeleteMsg(null);
        setSpatialRowDeletingId(row.id);
        const fd = new FormData();
        fd.set("project_id", selectedProjectId);
        fd.set("issue_id", row.issue_id);
        fd.set("feature_key", row.feature_key);
        const r = await deleteIssueFeatureAttributeAction(fd);
        setSpatialRowDeletingId(null);
        if (r.error) {
          setSpatialDeleteMsg(r.error);
          return;
        }
        router.refresh();
      });
    },
    [issueGeometryFeatureMap, router, selectedProjectId, startSpatialRowDeleteTransition]
  );

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <div className="flex min-w-0 flex-nowrap items-center gap-2 border-b border-border px-4 py-2.5">
        <p className="shrink-0 text-sm font-semibold text-foreground">Atribut Spasial</p>
        <SpatialAttributeSearchField
          resetKey={`${selectedProjectId ?? ""}:${selectedTaskId ?? ""}`}
          onDebouncedQuery={applySpatialSearchQuery}
        />
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
          {spatialTableTotalRows.toLocaleString("id-ID")} baris
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2 text-xs">
          <Dialog
            open={spatialAddAttrDialogOpen}
            onOpenChange={(open) => {
              setSpatialAddAttrDialogOpen(open);
              if (open) {
                setSpatialAddAttrMsg(null);
                setSpatialAddAttrKey("");
                setSpatialAddAttrEntries(
                  spatialAttributePropertyKeysForNewRow.length > 0
                    ? spatialAttributePropertyKeysForNewRow.map((k) => ({
                        key: k,
                        value: "",
                      }))
                    : [{ key: "", value: "" }]
                );
              }
            }}
          >
            <DialogTrigger
              render={<Button type="button" size="sm" variant="outline" />}
              disabled={!selectedTaskId}
            >
              + Baris atribut
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Tambah baris atribut</DialogTitle>
                <DialogDescription>
                  Simpan atribut untuk unit kerja terpilih tanpa geometri. Geometri bisa
                  dilengkapi nanti dari tab Peta. Jika tabel sudah punya kolom atribut, nama
                  kolom terisi otomatis — cukup isi nilai. Kolom baru tetap bisa ditambah
                  di bawah.
                </DialogDescription>
              </DialogHeader>
              <form
                className="grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!selectedProjectId || !selectedTaskId) return;
                  setSpatialAddAttrMsg(null);
                  const key = spatialAddAttrKey.trim();
                  if (!key) {
                    setSpatialAddAttrMsg("Kunci (feature_key) wajib diisi.");
                    return;
                  }
                  const props: Record<string, unknown> = {};
                  for (const ent of spatialAddAttrEntries) {
                    const k = ent.key.trim();
                    if (!k || k.startsWith("_")) continue;
                    if (NON_EDITABLE_SPATIAL_ATTR_KEYS.has(k)) continue;
                    props[k] = parseSpatialAttributeValue(ent.value);
                  }
                  const fd = new FormData();
                  fd.set("project_id", selectedProjectId);
                  fd.set("issue_id", selectedTaskId);
                  fd.set("feature_key", key);
                  fd.set("properties_json", JSON.stringify(props));
                  startSpatialAddAttrTransition(async () => {
                    const r = await upsertIssueFeatureAttributePayloadAction(fd);
                    if (r.error) {
                      setSpatialAddAttrMsg(r.error);
                      return;
                    }
                    const keysFromForm = spatialAddAttrEntries
                      .map((e) => e.key.trim())
                      .filter(
                        (k) =>
                          k &&
                          !k.startsWith("_") &&
                          !NON_EDITABLE_SPATIAL_ATTR_KEYS.has(k)
                      );
                    const nextKeys = [
                      ...new Set([
                        ...spatialAttributePropertyKeysForNewRow,
                        ...keysFromForm,
                      ]),
                    ].sort((a, b) => a.localeCompare(b));
                    setSpatialAddAttrMsg("Baris atribut disimpan.");
                    setSpatialAddAttrKey("");
                    setSpatialAddAttrEntries(
                      nextKeys.length > 0
                        ? nextKeys.map((k) => ({ key: k, value: "" }))
                        : [{ key: "", value: "" }]
                    );
                    router.refresh();
                  });
                }}
              >
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Unit kerja:</span>{" "}
                  <span className="font-medium text-foreground">
                    {selectedTaskTitle ?? "—"}
                  </span>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="spatial-add-attr-key">Kunci (feature_key)</Label>
                  <Input
                    id="spatial-add-attr-key"
                    value={spatialAddAttrKey}
                    onChange={(e) => setSpatialAddAttrKey(e.target.value)}
                    placeholder="contoh: blok-A / NIB123"
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Pengenal unik untuk baris ini (sama konsep dengan kolom key di import
                    CSV).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Data atribut</Label>
                  <p className="text-[11px] text-muted-foreground">
                    {spatialAttributePropertyKeysForNewRow.length > 0
                      ? "Nama kolom disesuaikan dengan data yang sudah ada. Isi nilai yang perlu; kosongkan yang tidak dipakai."
                      : "Tambah baris per kolom (nama + nilai). Setelah ada data di tabel, nama kolom akan terisi otomatis di sini."}{" "}
                    Angka cukup diketik angka; teks panjang atau potongan JSON isi biasa
                    saja.
                  </p>
                  <div className="space-y-2">
                    {spatialAddAttrEntries.map((entry, idx) => (
                      <div key={idx} className="flex flex-wrap items-center gap-2">
                        <Input
                          className="h-8 min-w-0 flex-1 font-mono text-xs"
                          placeholder="nama kolom"
                          value={entry.key}
                          onChange={(e) => {
                            const v = e.target.value;
                            setSpatialAddAttrEntries((prev) =>
                              prev.map((p, i) => (i === idx ? { ...p, key: v } : p))
                            );
                          }}
                        />
                        <Input
                          className="h-8 min-w-0 flex-[2] font-mono text-xs"
                          placeholder="nilai"
                          value={entry.value}
                          onChange={(e) => {
                            const v = e.target.value;
                            setSpatialAddAttrEntries((prev) =>
                              prev.map((p, i) => (i === idx ? { ...p, value: v } : p))
                            );
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 shrink-0 px-2 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setSpatialAddAttrEntries((prev) =>
                              prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev
                            )
                          }
                        >
                          Hapus
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs"
                    onClick={() =>
                      setSpatialAddAttrEntries((prev) => [...prev, { key: "", value: "" }])
                    }
                  >
                    Tambah kolom
                  </Button>
                </div>
                <Button
                  type="submit"
                  disabled={spatialAddAttrPending || !selectedTaskId}
                >
                  Simpan baris
                </Button>
                {spatialAddAttrMsg && (
                  <p
                    className={`text-xs ${spatialAddAttrMsg.includes("disimpan") ? "text-emerald-700" : "text-red-600"}`}
                    role="alert"
                  >
                    {spatialAddAttrMsg}
                  </p>
                )}
              </form>
            </DialogContent>
          </Dialog>
          <Dialog
            open={spatialAttrImportDialogOpen}
            onOpenChange={(open) => {
              setSpatialAttrImportDialogOpen(open);
              if (open) {
                setMapAttrMsg(null);
                setMapAttrCsvText("");
              }
            }}
          >
            <DialogTrigger
              render={<Button type="button" size="sm" variant="outline" />}
              disabled={!selectedTaskId}
            >
              Import atribut CSV
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import atribut CSV</DialogTitle>
                <DialogDescription>
                  Upload atribut untuk unit kerja terpilih. Linking menggunakan `feature_key`
                  (atau kolom key yang Anda tentukan).
                </DialogDescription>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => {
                      const csv = attributeFeatureKeyTemplateCsv();
                      const blob = new Blob([csv], {
                        type: "text/csv;charset=utf-8",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "template-atribut-feature_key.csv";
                      a.rel = "noopener";
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Unduh template CSV (feature_key)
                  </Button>
                </div>
              </DialogHeader>
              <form
                className="grid gap-3"
                action={(fd) => {
                  if (!selectedProjectId || !selectedTaskId) return;
                  setMapAttrMsg(null);
                  fd.set("project_id", selectedProjectId);
                  fd.set("issue_id", selectedTaskId);
                  fd.set("attributes_csv", mapAttrCsvText);
                  startMapAttrImportTransition(async () => {
                    const r = await upsertIssueFeatureAttributesCsvAction(fd);
                    if (r.error) {
                      setMapAttrMsg(r.error);
                      return;
                    }
                    const failText = r.failed > 0 ? `, gagal ${r.failed}` : "";
                    const sampleText =
                      r.failureSamples.length > 0
                        ? ` (${r.failureSamples.slice(0, 3).join(" | ")})`
                        : "";
                    setMapAttrMsg(
                      `Import atribut selesai: berhasil ${r.insertedOrUpdated}${failText}.${sampleText}`
                    );
                    router.refresh();
                  });
                }}
              >
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Unit kerja:</span>{" "}
                  <span className="font-medium text-foreground">
                    {selectedTaskTitle ?? "Pilih unit kerja dulu"}
                  </span>
                </div>
                <div className="space-y-1">
                  <Label>File CSV atribut</Label>
                  <Input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      if (!file) {
                        setMapAttrCsvText("");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        const raw =
                          typeof reader.result === "string" ? reader.result : "";
                        setMapAttrCsvText(raw);
                      };
                      reader.onerror = () => {
                        setMapAttrMsg("Gagal membaca file CSV.");
                      };
                      reader.readAsText(file);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Nama kolom key</Label>
                  <Input
                    name="key_column"
                    defaultValue="feature_key"
                    placeholder="contoh: feature_key / nib / no_bidang"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={
                    mapAttrImportPending || !selectedTaskId || !mapAttrCsvText.trim()
                  }
                >
                  Import atribut
                </Button>
                {mapAttrMsg && (
                  <p
                    className={`text-xs ${mapAttrMsg.includes("selesai") ? "text-emerald-700" : "text-red-600"}`}
                    role="alert"
                  >
                    {mapAttrMsg}
                  </p>
                )}
              </form>
            </DialogContent>
          </Dialog>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={spatialTablePage <= 1}
            onClick={() => setSpatialTablePage((p) => Math.max(1, p - 1))}
          >
            Sebelumnya
          </Button>
          <span className="whitespace-nowrap text-muted-foreground">
            Halaman {spatialTablePage} / {spatialTableTotalPages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={spatialTablePage >= spatialTableTotalPages}
            onClick={() =>
              setSpatialTablePage((p) => Math.min(spatialTableTotalPages, p + 1))
            }
          >
            Berikutnya
          </Button>
        </div>
      </div>
      {spatialDeleteMsg && (
        <p
          className="border-b border-border px-4 py-2 text-xs text-red-600"
          role="alert"
        >
          {spatialDeleteMsg}
        </p>
      )}
      <table className="w-full min-w-[44rem] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">{unitKerjaColumnLabel}</th>
            {issueGeometryAttributeKeysForTableView.map((key) => (
              <th key={key} className="px-3 py-2 font-medium">
                {key}
              </th>
            ))}
            <th className="min-w-[9rem] whitespace-nowrap px-3 py-2 text-right font-medium">
              Aksi
            </th>
          </tr>
        </thead>
        <tbody>
          {issueGeometryRowsForTableViewPaged.map((row) => {
            const props = issueGeometryPropertiesForDisplay(row);
            return (
              <tr key={row.id} className="border-b border-border/70">
                <td className="px-3 py-2">
                  {issueTitleById.get(row.issue_id) ?? row.issue_id}
                </td>
                {issueGeometryAttributeKeysForTableView.map((key) => (
                  <td
                    key={`${row.id}:${key}`}
                    className="max-w-[260px] truncate px-3 py-2 font-mono"
                    title={compactValuePreview(props[key], 500)}
                  >
                    {compactValuePreview(props[key])}
                  </td>
                ))}
                <td className="px-3 py-2 text-right align-middle">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      title="Edit atribut"
                      disabled={spatialRowDeletingId === row.id}
                      onClick={() => {
                        setSpatialAttributeEditMsg(null);
                        if (row.geometryFeatureId) {
                          const source = issueGeometryFeatureMap.find(
                            (g) => g.id === row.geometryFeatureId
                          );
                          if (!source) return;
                          setSpatialAttributeEditEntries(
                            buildSpatialAttributeEditEntries(source)
                          );
                          setSpatialAttributeEditRow(source);
                          setSpatialAttributeEditAttrRow(null);
                          return;
                        }
                        setSpatialAttributeEditEntries(
                          buildSpatialAttributeEditEntriesFromTableRow(row)
                        );
                        setSpatialAttributeEditRow(null);
                        setSpatialAttributeEditAttrRow(row);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                      title={
                        row.geometryFeatureId
                          ? "Hapus geometri fitur ini"
                          : "Hapus baris atribut ini"
                      }
                      disabled={spatialRowDeletingId === row.id}
                      onClick={() => openSpatialDeleteConfirm(row)}
                    >
                      Hapus
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {issueGeometryRowsForTableViewFiltered.length === 0 && (
        <p className="m-4 text-xs text-muted-foreground">
          {spatialSearchQuery
            ? "Tidak ada data yang cocok dengan kata kunci pencarian."
            : selectedTaskId
              ? "Belum ada data atribut/geometri untuk unit kerja terpilih."
              : "Belum ada data atribut/geometri unit kerja pada project ini."}
        </p>
      )}
      <Dialog
        open={
          spatialAttributeEditRow !== null || spatialAttributeEditAttrRow !== null
        }
        onOpenChange={(open) => {
          if (!open) {
            setSpatialAttributeEditRow(null);
            setSpatialAttributeEditAttrRow(null);
            setSpatialAttributeEditMsg(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit atribut</DialogTitle>
          </DialogHeader>
          {spatialAttributeEditRow || spatialAttributeEditAttrRow ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Unit kerja:</span>{" "}
                  <span className="font-medium text-foreground">
                    {issueTitleById.get(
                      (spatialAttributeEditRow?.issue_id ??
                        spatialAttributeEditAttrRow?.issue_id) as string
                    ) ??
                      (spatialAttributeEditRow?.issue_id ??
                        spatialAttributeEditAttrRow?.issue_id)}
                  </span>
                </div>
                <div className="mt-1">
                  <span className="text-muted-foreground">feature_key:</span>{" "}
                  <span className="font-mono text-foreground">
                    {spatialAttributeEditRow?.feature_key ??
                      spatialAttributeEditAttrRow?.feature_key}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                {spatialAttributeEditEntries.map((entry, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2">
                    <Input
                      className="h-8 min-w-0 flex-1 font-mono text-xs"
                      placeholder="key"
                      value={entry.key}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSpatialAttributeEditEntries((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, key: v } : p))
                        );
                      }}
                    />
                    <Input
                      className="h-8 min-w-0 flex-[2] font-mono text-xs"
                      placeholder="value (JSON boleh)"
                      value={entry.value}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSpatialAttributeEditEntries((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, value: v } : p))
                        );
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 shrink-0 px-2 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setSpatialAttributeEditEntries((prev) =>
                          prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev
                        )
                      }
                    >
                      Hapus
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 text-xs"
                onClick={() =>
                  setSpatialAttributeEditEntries((prev) => [
                    ...prev,
                    { key: "", value: "" },
                  ])
                }
              >
                Tambah atribut
              </Button>
              {spatialAttributeEditMsg && (
                <p className="text-xs text-destructive" role="alert">
                  {spatialAttributeEditMsg}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSpatialAttributeEditRow(null);
                    setSpatialAttributeEditAttrRow(null);
                    setSpatialAttributeEditMsg(null);
                  }}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={spatialAttributeEditPending}
                  onClick={() => {
                    if (!spatialAttributeEditRow && !spatialAttributeEditAttrRow) {
                      return;
                    }
                    setSpatialAttributeEditMsg(null);
                    const props: Record<string, unknown> = {};
                    for (const e of spatialAttributeEditEntries) {
                      const k = e.key.trim();
                      if (!k || k.startsWith("_")) continue;
                      if (NON_EDITABLE_SPATIAL_ATTR_KEYS.has(k)) continue;
                      props[k] = parseSpatialAttributeValue(e.value);
                    }
                    startSpatialAttributeEditTransition(async () => {
                      let r: { error: string | null };
                      if (spatialAttributeEditRow) {
                        const fd = new FormData();
                        fd.set("project_id", spatialAttributeEditRow.project_id);
                        fd.set("issue_id", spatialAttributeEditRow.issue_id);
                        fd.set("feature_id", spatialAttributeEditRow.id);
                        fd.set("properties_json", JSON.stringify(props));
                        r = await updateIssueGeometryFeaturePropertiesAction(fd);
                      } else {
                        if (!selectedProjectId || !spatialAttributeEditAttrRow) {
                          setSpatialAttributeEditMsg("Unit kerja/project belum terpilih.");
                          return;
                        }
                        const fd = new FormData();
                        fd.set("project_id", selectedProjectId);
                        fd.set("issue_id", spatialAttributeEditAttrRow.issue_id);
                        fd.set("feature_key", spatialAttributeEditAttrRow.feature_key);
                        fd.set("properties_json", JSON.stringify(props));
                        r = await upsertIssueFeatureAttributePayloadAction(fd);
                      }
                      if (r.error) {
                        setSpatialAttributeEditMsg(r.error);
                        return;
                      }
                      setSpatialAttributeEditRow(null);
                      setSpatialAttributeEditAttrRow(null);
                      setSpatialAttributeEditMsg(null);
                      router.refresh();
                    });
                  }}
                >
                  Simpan
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={spatialDeleteConfirmRow !== null}
        onOpenChange={(open) => {
          if (!open) setSpatialDeleteConfirmRow(null);
        }}
      >
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Hapus dari tabel?</DialogTitle>
            <DialogDescription>{spatialDeleteConfirmDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSpatialDeleteConfirmRow(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                const row = spatialDeleteConfirmRow;
                if (!row) return;
                setSpatialDeleteConfirmRow(null);
                runSpatialRowDelete(row);
              }}
            >
              Hapus
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const SpatialAttributesPanel = memo(SpatialAttributesPanelInner);
