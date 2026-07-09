"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { RelationTargetPickerDialog } from "@/components/relation-target-picker-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LatLngPoint } from "@/lib/workspace-map-draw-bidang";
import { validateDrawnBidangRing } from "@/lib/workspace-map-draw-bidang";
import { pickDefaultVirtualTableMatchColumn } from "@/lib/virtual-table-geojson-import";
import { fetchVirtualTableRowsWithCache } from "@/lib/virtual-table-rows-fetch";
import type {
  VirtualColumnRow,
  VirtualDataRow,
  VirtualTableRow,
} from "./virtual-table-types";
import { importVirtualRowsDrawnPolygonBatchAction } from "./virtual-table-actions";
import { emitVirtualTableRowsMutated } from "@/lib/workspace-virtual-table-mutations";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ring: LatLngPoint[] | null;
  vtablesWithGeometry: VirtualTableRow[];
  virtualColumns: VirtualColumnRow[];
  allAccessibleVtables: VirtualTableRow[];
  defaultTableId?: string;
  onSaved: () => void;
};

export function WorkspaceSpatialDrawBidangSaveDialog({
  open,
  onOpenChange,
  ring,
  vtablesWithGeometry,
  virtualColumns,
  allAccessibleVtables,
  defaultTableId = "",
  onSaved,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [tableId, setTableId] = useState(defaultTableId);
  const [matchKey, setMatchKey] = useState("");
  const [label, setLabel] = useState("");
  const [geometrySlug, setGeometrySlug] = useState("");
  const [matchSlug, setMatchSlug] = useState("");
  const [desaRelationSlug, setDesaRelationSlug] = useState("");
  const [desaRowId, setDesaRowId] = useState("");
  const [desaRowLabel, setDesaRowLabel] = useState("");
  const [upsertMode, setUpsertMode] = useState<"upsert" | "insert_only">(
    "upsert"
  );
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [tableRows, setTableRows] = useState<VirtualDataRow[]>([]);

  const columns = useMemo(
    () => virtualColumns.filter((c) => c.table_id === tableId),
    [virtualColumns, tableId]
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
    const vt = allAccessibleVtables.find((t) => t.id === relationTargetTableId);
    return vt?.display_name?.trim() || "tabel target";
  }, [relationTargetTableId, allAccessibleVtables]);

  useEffect(() => {
    if (!open) return;
    setMsg(null);
    const tid =
      defaultTableId &&
      vtablesWithGeometry.some((t) => t.id === defaultTableId)
        ? defaultTableId
        : (vtablesWithGeometry[0]?.id ?? "");
    setTableId(tid);
    setMatchKey("");
    setLabel("");
    setDesaRowId("");
    setDesaRowLabel("");
    setUpsertMode("upsert");
  }, [open, defaultTableId, vtablesWithGeometry]);

  useEffect(() => {
    if (!open || !tableId) return;
    const geom =
      geometryColumns.find((c) => c.slug === "geom" || c.slug === "geometry") ??
      geometryColumns[0];
    setGeometrySlug(geom?.slug ?? "");
    const match = pickDefaultVirtualTableMatchColumn(matchColumns);
    setMatchSlug(match?.slug ?? "");
    const requiredRel = relationColumns.find((c) => c.is_required);
    setDesaRelationSlug(requiredRel?.slug ?? "");
  }, [open, tableId, geometryColumns, matchColumns, relationColumns]);

  useEffect(() => {
    if (!open || !tableId) {
      setTableRows([]);
      return;
    }
    let cancelled = false;
    void fetchVirtualTableRowsWithCache(tableId).then((r) => {
      if (cancelled) return;
      setTableRows(r.error ? [] : (r.rows as VirtualDataRow[]));
    });
    return () => {
      cancelled = true;
    };
  }, [open, tableId]);

  const keyExists = useMemo(() => {
    if (!matchKey.trim() || !matchSlug) return false;
    const norm = matchKey.trim().toLowerCase();
    return tableRows.some((row) => {
      const v = row.payload?.[matchSlug];
      return v != null && String(v).trim().toLowerCase() === norm;
    });
  }, [tableRows, matchKey, matchSlug]);

  const runSave = useCallback(() => {
    if (!ring || ring.length < 3) {
      setMsg("Poligon gambar tidak valid.");
      return;
    }
    const validation = validateDrawnBidangRing(ring);
    if (!validation.ok) {
      setMsg(validation.error);
      return;
    }
    if (!tableId || !geometrySlug || !matchSlug || !matchKey.trim()) {
      setMsg("Isi tabel tujuan, kolom, dan nomor bidang.");
      return;
    }
    if (desaRelationSlug && !desaRowId) {
      setMsg(`Pilih baris ${relationTargetLabel} (relasi wajib).`);
      return;
    }
    setMsg(null);
    const fd = new FormData();
    fd.set("table_id", tableId);
    fd.set("ring_json", JSON.stringify(ring));
    fd.set("geometry_column_slug", geometrySlug);
    fd.set("match_column_slug", matchSlug);
    fd.set("match_key", matchKey.trim());
    fd.set("label", label.trim());
    fd.set("upsert_mode", upsertMode);
    if (desaRelationSlug && desaRowId) {
      fd.set("desa_relation_column_slug", desaRelationSlug);
      fd.set("desa_target_row_id", desaRowId);
      fd.set("desa_source_mode", "fixed");
    }
    startTransition(async () => {
      const r = await importVirtualRowsDrawnPolygonBatchAction(fd);
      if (r.error) {
        setMsg(r.error);
        return;
      }
      emitVirtualTableRowsMutated(tableId);
      onSaved();
      onOpenChange(false);
    });
  }, [
    ring,
    tableId,
    geometrySlug,
    matchSlug,
    matchKey,
    label,
    upsertMode,
    desaRelationSlug,
    desaRowId,
    relationTargetLabel,
    onSaved,
    onOpenChange,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Simpan bidang hasil gambar</DialogTitle>
          <DialogDescription>
            Poligon WGS84 dari peta akan disimpan ke tabel virtual. Kunci upsert
            memakai kolom yang dipilih (mis. no_bidang).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <Label htmlFor="draw-save-table">Tabel tujuan</Label>
            <select
              id="draw-save-table"
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              disabled={pending}
            >
              {vtablesWithGeometry.map((vt) => (
                <option key={vt.id} value={vt.id}>
                  {vt.display_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="draw-save-key">Nomor bidang / kunci</Label>
            <Input
              id="draw-save-key"
              value={matchKey}
              onChange={(e) => setMatchKey(e.target.value)}
              placeholder="contoh: BAB-001"
              className="mt-1 font-mono"
              disabled={pending}
            />
            {keyExists ? (
              <p className="mt-1 text-[11px] text-amber-700">
                Kunci sudah ada — baris akan diperbarui (mode upsert).
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Baris baru akan dibuat bila kunci belum ada.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="draw-save-label">Judul (opsional)</Label>
            <Input
              id="draw-save-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`Bidang ${matchKey || "…"}`}
              className="mt-1"
              disabled={pending}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="draw-save-geom">Kolom geometri</Label>
              <select
                id="draw-save-geom"
                value={geometrySlug}
                onChange={(e) => setGeometrySlug(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                disabled={pending}
              >
                {geometryColumns.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="draw-save-match-col">Kolom kunci</Label>
              <select
                id="draw-save-match-col"
                value={matchSlug}
                onChange={(e) => setMatchSlug(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                disabled={pending}
              >
                {matchColumns.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {relationColumns.length > 0 ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
              <div>
                <Label htmlFor="draw-save-rel">Kolom relasi</Label>
                <select
                  id="draw-save-rel"
                  value={desaRelationSlug}
                  onChange={(e) => {
                    setDesaRelationSlug(e.target.value);
                    setDesaRowId("");
                    setDesaRowLabel("");
                  }}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  disabled={pending}
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
                    className="min-h-11"
                    onClick={() => setTargetPickerOpen(true)}
                    disabled={pending}
                  >
                    Pilih {relationTargetLabel}…
                  </Button>
                  {desaRowLabel ? (
                    <span className="text-xs text-muted-foreground">
                      {desaRowLabel}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div>
            <Label htmlFor="draw-save-upsert">Mode</Label>
            <select
              id="draw-save-upsert"
              value={upsertMode}
              onChange={(e) =>
                setUpsertMode(e.target.value as "upsert" | "insert_only")
              }
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              disabled={pending}
            >
              <option value="upsert">Upsert (baru + perbarui)</option>
              <option value="insert_only">Hanya baris baru</option>
            </select>
          </div>

          {msg ? (
            <p className="text-xs text-red-600" role="alert">
              {msg}
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
            <Button type="button" onClick={runSave} disabled={pending}>
              {pending ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Menyimpan…
                </>
              ) : (
                "Simpan"
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
      </DialogContent>
    </Dialog>
  );
}
