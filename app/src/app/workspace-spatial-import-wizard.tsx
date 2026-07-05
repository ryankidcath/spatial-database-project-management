"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { MapFootprint } from "./workspace-map";
import type {
  VirtualColumnRow,
  VirtualDataRow,
  VirtualTableRow,
} from "./virtual-table-types";
import {
  VirtualTableDxfImportDialog,
  VirtualTableGeoJsonImportDialog,
  VirtualTableLayerUploadDialog,
  type LayerUploadCreated,
} from "./virtual-table-view";

export type SpatialImportTarget = "existing" | "new_layer";
export type SpatialImportFormat = "geojson" | "dxf";

type WizardStep = "target" | "configure" | "import";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  vtablesWithGeometry: VirtualTableRow[];
  allAccessibleVtables: VirtualTableRow[];
  virtualColumns: VirtualColumnRow[];
  defaultTableId?: string;
  importTableRows: VirtualDataRow[];
  mapPreviewEnabled?: boolean;
  onPreviewChange?: (footprints: MapFootprint[] | null) => void;
  onImported: () => void;
  onLayerCreated: (result: LayerUploadCreated) => void;
  onTableIdChange?: (tableId: string) => void;
};

const STEP_LABELS: Record<WizardStep, string> = {
  target: "Tujuan",
  configure: "Tabel & format",
  import: "File & impor",
};

export function WorkspaceSpatialImportWizard({
  open,
  onOpenChange,
  projectId,
  vtablesWithGeometry,
  allAccessibleVtables,
  virtualColumns,
  defaultTableId = "",
  importTableRows,
  mapPreviewEnabled = false,
  onPreviewChange,
  onImported,
  onLayerCreated,
  onTableIdChange,
}: Props) {
  const [step, setStep] = useState<WizardStep>("target");
  const [target, setTarget] = useState<SpatialImportTarget>("existing");
  const [tableId, setTableId] = useState(defaultTableId);
  const [format, setFormat] = useState<SpatialImportFormat>("geojson");

  const hasExistingTables = vtablesWithGeometry.length > 0;

  useEffect(() => {
    if (!open) return;
    setStep("target");
    setTarget(hasExistingTables ? "existing" : "new_layer");
    setTableId(
      defaultTableId && vtablesWithGeometry.some((t) => t.id === defaultTableId)
        ? defaultTableId
        : (vtablesWithGeometry[0]?.id ?? "")
    );
    setFormat("geojson");
  }, [open, defaultTableId, hasExistingTables, vtablesWithGeometry]);

  useEffect(() => {
    if (!open || target !== "existing" || !tableId) return;
    onTableIdChange?.(tableId);
  }, [open, target, tableId, onTableIdChange]);

  const handleClose = useCallback(
    (next: boolean) => {
      if (!next) onPreviewChange?.(null);
      onOpenChange(next);
    },
    [onOpenChange, onPreviewChange]
  );

  const selectedTable = useMemo(
    () =>
      tableId
        ? allAccessibleVtables.find((t) => t.id === tableId) ?? null
        : null,
    [tableId, allAccessibleVtables]
  );

  const selectedColumns = useMemo(
    () => (tableId ? virtualColumns.filter((c) => c.table_id === tableId) : []),
    [tableId, virtualColumns]
  );

  const stepIndex =
    step === "target" ? 1 : step === "configure" ? 2 : 3;
  const stepTotal = target === "new_layer" ? 2 : 3;

  const goBack = useCallback(() => {
    if (step === "import") {
      setStep(target === "new_layer" ? "target" : "configure");
      onPreviewChange?.(null);
      return;
    }
    if (step === "configure") {
      setStep("target");
    }
  }, [step, target, onPreviewChange]);

  const continueFromTarget = () => {
    if (target === "new_layer") {
      setStep("import");
      return;
    }
    if (!tableId && vtablesWithGeometry[0]) {
      setTableId(vtablesWithGeometry[0].id);
    }
    setStep("configure");
  };

  const continueFromConfigure = () => {
    if (!tableId) return;
    setStep("import");
  };

  const summaryLine = useMemo(() => {
    if (target === "new_layer") return "Tabel virtual baru dari file";
    const name = selectedTable?.display_name ?? "tabel";
    return `${name} · ${format === "geojson" ? "GeoJSON" : "DXF"}`;
  }, [target, selectedTable, format]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "max-h-[90vh] overflow-y-auto",
          step === "import" ? "max-w-2xl" : "max-w-lg"
        )}
        data-testid="spatial-import-wizard"
      >
        {step !== "import" ? (
          <>
            <DialogHeader>
              <DialogTitle>Impor spasial</DialogTitle>
              <DialogDescription>
                Satu alur untuk mengisi tabel virtual ber-geometry atau membuat
                tabel baru dari file GeoJSON/DXF. Pratinjau poligon tampil di
                peta sebelum disimpan.
              </DialogDescription>
            </DialogHeader>

            <ol className="flex gap-2 text-xs text-muted-foreground">
              {(target === "new_layer"
                ? (["target", "import"] as WizardStep[])
                : (["target", "configure", "import"] as WizardStep[])
              ).map((s, i) => (
                <li
                  key={s}
                  className={cn(
                    "rounded-md px-2 py-1",
                    step === s
                      ? "bg-primary/10 font-medium text-primary"
                      : "bg-muted/50"
                  )}
                >
                  {i + 1}. {STEP_LABELS[s]}
                </li>
              ))}
            </ol>

            {step === "target" ? (
              <div className="space-y-3 text-sm">
                <p className="font-medium text-foreground">
                  Apa yang ingin Anda lakukan?
                </p>
                <div className="grid gap-2">
                  <label
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-lg border px-3 py-3 transition-colors",
                      target === "existing"
                        ? "border-primary/40 bg-primary/5"
                        : "border-border hover:bg-muted/40",
                      !hasExistingTables && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <input
                      type="radio"
                      name="spatial-import-target"
                      className="mt-1"
                      checked={target === "existing"}
                      disabled={!hasExistingTables}
                      onChange={() => setTarget("existing")}
                    />
                    <span>
                      <span className="block font-medium text-foreground">
                        Impor ke tabel yang ada
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Tambah atau perbarui baris di tabel virtual ber-geometry
                        yang sudah ada.
                      </span>
                    </span>
                  </label>
                  <label
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-lg border px-3 py-3 transition-colors",
                      target === "new_layer"
                        ? "border-primary/40 bg-primary/5"
                        : "border-border hover:bg-muted/40"
                    )}
                  >
                    <input
                      type="radio"
                      name="spatial-import-target"
                      className="mt-1"
                      checked={target === "new_layer"}
                      onChange={() => setTarget("new_layer")}
                    />
                    <span>
                      <span className="block font-medium text-foreground">
                        Buat tabel baru dari file
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Untuk surveyor: unggah geometri → sistem membuat tabel
                        virtual baru.
                      </span>
                    </span>
                  </label>
                </div>
                <div className="flex justify-end">
                  <Button type="button" onClick={continueFromTarget}>
                    Lanjut
                  </Button>
                </div>
              </div>
            ) : null}

            {step === "configure" ? (
              <div className="space-y-3 text-sm">
                <div>
                  <label
                    htmlFor="wizard-import-table"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Tabel tujuan
                  </label>
                  <select
                    id="wizard-import-table"
                    value={tableId}
                    onChange={(e) => setTableId(e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {vtablesWithGeometry.map((vt) => (
                      <option key={vt.id} value={vt.id}>
                        {vt.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Format file
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["geojson", "GeoJSON"],
                        ["dxf", "DXF"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFormat(value)}
                        className={cn(
                          "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                          format === value
                            ? "border-primary/40 bg-primary/5 font-medium text-foreground"
                            : "border-border hover:bg-muted/40"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between gap-2">
                  <Button type="button" variant="outline" onClick={goBack}>
                    Kembali
                  </Button>
                  <Button
                    type="button"
                    onClick={continueFromConfigure}
                    disabled={!tableId}
                  >
                    Lanjut
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <button
                type="button"
                onClick={goBack}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                data-testid="spatial-import-wizard-back"
              >
                <ChevronLeft className="size-4" aria-hidden />
                Kembali
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {STEP_LABELS.import}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  Langkah {stepIndex} / {stepTotal} · {summaryLine}
                </p>
              </div>
            </div>

            {target === "new_layer" ? (
              <VirtualTableLayerUploadDialog
                embedded
                open
                onOpenChange={(next) => {
                  if (!next) goBack();
                }}
                projectId={projectId}
                mapPreviewEnabled={mapPreviewEnabled}
                onPreviewChange={onPreviewChange}
                onCreated={(result) => {
                  onLayerCreated(result);
                  handleClose(false);
                }}
                cancelLabel="Kembali"
              />
            ) : format === "geojson" && selectedTable ? (
              <VirtualTableGeoJsonImportDialog
                embedded
                open
                onOpenChange={(next) => {
                  if (!next) goBack();
                }}
                table={selectedTable}
                columns={selectedColumns}
                allVirtualTables={allAccessibleVtables}
                mapPreviewEnabled={mapPreviewEnabled}
                onPreviewChange={onPreviewChange}
                onImported={() => {
                  onImported();
                  handleClose(false);
                }}
                cancelLabel="Kembali"
              />
            ) : format === "dxf" && selectedTable ? (
              <VirtualTableDxfImportDialog
                embedded
                open
                onOpenChange={(next) => {
                  if (!next) goBack();
                }}
                table={selectedTable}
                columns={selectedColumns}
                allVirtualTables={allAccessibleVtables}
                rows={importTableRows}
                onImported={() => {
                  onImported();
                  handleClose(false);
                }}
                cancelLabel="Kembali"
              />
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
