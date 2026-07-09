"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { pickDefaultVirtualTableMatchColumn } from "@/lib/virtual-table-geojson-import";
import {
  SURVEY_POINT_GEOM_SLUG,
  SURVEY_POINT_NO_BIDANG_SLUG,
  SURVEY_POINT_URUTAN_SLUG,
} from "@/lib/virtual-table-survey-points-bootstrap";
import {
  groupArchivedPointsByBidang,
} from "@/lib/regenerate-bidang-from-survey-points";
import { fetchVirtualTableRowsWithCache } from "@/lib/virtual-table-rows-fetch";
import type {
  VirtualColumnRow,
  VirtualDataRow,
  VirtualTableRow,
} from "./virtual-table-types";
import { regenerateBidangPolygonsFromSurveyPointsAction } from "./virtual-table-actions";
import { ImportDialogShell } from "./import-dialog-shell";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bidangTable: VirtualTableRow;
  bidangColumns: VirtualColumnRow[];
  allVirtualTables: VirtualTableRow[];
  allVirtualColumns: VirtualColumnRow[];
  defaultPointsTableId?: string;
  onRegenerated: () => void;
  embedded?: boolean;
};

export function VirtualTableRegeneratePolygonDialog({
  open,
  onOpenChange,
  bidangTable,
  bidangColumns,
  allVirtualTables,
  allVirtualColumns,
  defaultPointsTableId = "",
  onRegenerated,
  embedded = false,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [pointsTableId, setPointsTableId] = useState(defaultPointsTableId);
  const [filterNoBidang, setFilterNoBidang] = useState("");
  const [upsertMode, setUpsertMode] = useState<"upsert" | "insert_only">(
    "upsert"
  );
  const [pointsTableRows, setPointsTableRows] = useState<VirtualDataRow[]>([]);

  const bidangGeometryColumns = useMemo(
    () => bidangColumns.filter((c) => c.data_type === "geometry"),
    [bidangColumns]
  );
  const bidangMatchColumns = useMemo(
    () =>
      bidangColumns.filter((c) =>
        ["text", "number", "url"].includes(c.data_type)
      ),
    [bidangColumns]
  );

  const [bidangGeometrySlug, setBidangGeometrySlug] = useState("geom");
  const [bidangMatchSlug, setBidangMatchSlug] = useState("no_bidang");

  const pointsTableOptions = useMemo(
    () =>
      allVirtualTables.filter((t) => t.id !== bidangTable.id),
    [allVirtualTables, bidangTable.id]
  );

  const pointsColumns = useMemo(
    () =>
      pointsTableId
        ? allVirtualColumns.filter((c) => c.table_id === pointsTableId)
        : [],
    [allVirtualColumns, pointsTableId]
  );

  const pointsGeometrySlug = useMemo(() => {
    const geom =
      pointsColumns.find((c) => c.slug === SURVEY_POINT_GEOM_SLUG) ??
      pointsColumns.find((c) => c.data_type === "geometry");
    return geom?.slug ?? SURVEY_POINT_GEOM_SLUG;
  }, [pointsColumns]);

  const archivedGroups = useMemo(() => {
    if (!pointsTableId || pointsTableRows.length === 0) return new Map();
    const rows = pointsTableRows.map((row) => ({
      rowId: row.id,
      payload: (row.payload ?? {}) as Record<string, unknown>,
    }));
    return groupArchivedPointsByBidang(
      rows,
      SURVEY_POINT_NO_BIDANG_SLUG,
      SURVEY_POINT_URUTAN_SLUG,
      pointsGeometrySlug
    );
  }, [pointsTableId, pointsTableRows, pointsGeometrySlug]);

  const bidangKeys = useMemo(
    () => [...archivedGroups.keys()].sort(),
    [archivedGroups]
  );

  useEffect(() => {
    if (!open) return;
    setMsg(null);
    setFilterNoBidang("");
    setUpsertMode("upsert");
    const tid =
      defaultPointsTableId &&
      pointsTableOptions.some((t) => t.id === defaultPointsTableId)
        ? defaultPointsTableId
        : (pointsTableOptions[0]?.id ?? "");
    setPointsTableId(tid);
    const geom =
      bidangGeometryColumns.find(
        (c) => c.slug === "geom" || c.slug === "geometry"
      ) ?? bidangGeometryColumns[0];
    setBidangGeometrySlug(geom?.slug ?? "geom");
    const match = pickDefaultVirtualTableMatchColumn(bidangMatchColumns);
    setBidangMatchSlug(match?.slug ?? "no_bidang");
  }, [
    open,
    defaultPointsTableId,
    pointsTableOptions,
    bidangGeometryColumns,
    bidangMatchColumns,
  ]);

  useEffect(() => {
    if (!open || !pointsTableId) {
      setPointsTableRows([]);
      return;
    }
    let cancelled = false;
    void fetchVirtualTableRowsWithCache(pointsTableId).then((r) => {
      if (cancelled) return;
      setPointsTableRows(r.error ? [] : (r.rows as VirtualDataRow[]));
    });
    return () => {
      cancelled = true;
    };
  }, [open, pointsTableId]);

  const runRegenerate = useCallback(() => {
    if (!pointsTableId) {
      setMsg("Pilih tabel titik sumber.");
      return;
    }
    if (!bidangGeometrySlug || !bidangMatchSlug) {
      setMsg("Pilih kolom geometri dan kunci bidang.");
      return;
    }
    if (bidangKeys.length === 0) {
      setMsg("Tidak ada titik arsip di tabel titik yang dipilih.");
      return;
    }
    setMsg(null);
    const fd = new FormData();
    fd.set("bidang_table_id", bidangTable.id);
    fd.set("points_table_id", pointsTableId);
    fd.set("bidang_geometry_column_slug", bidangGeometrySlug);
    fd.set("bidang_match_column_slug", bidangMatchSlug);
    fd.set("points_no_bidang_column_slug", SURVEY_POINT_NO_BIDANG_SLUG);
    fd.set("points_urutan_column_slug", SURVEY_POINT_URUTAN_SLUG);
    fd.set("points_geometry_column_slug", pointsGeometrySlug);
    fd.set("upsert_mode", upsertMode);
    if (filterNoBidang.trim()) {
      fd.set("filter_no_bidang", filterNoBidang.trim());
    }
    startTransition(async () => {
      const r = await regenerateBidangPolygonsFromSurveyPointsAction(fd);
      if (r.error && r.regenerated === 0) {
        setMsg(r.error);
        return;
      }
      const failText =
        r.failed > 0
          ? ` Gagal ${r.failed}${r.failureSamples.length > 0 ? ` (${r.failureSamples.slice(0, 2).join("; ")})` : ""}.`
          : "";
      const skipText = r.skipped > 0 ? ` ${r.skipped} dilewati.` : "";
      setMsg(
        `Poligon diperbarui: ${r.regenerated} bidang.${skipText}${failText}`
      );
      if (r.regenerated > 0) {
        onRegenerated();
      }
    });
  }, [
    pointsTableId,
    bidangGeometrySlug,
    bidangMatchSlug,
    pointsGeometrySlug,
    upsertMode,
    filterNoBidang,
    bidangTable.id,
    bidangKeys.length,
    onRegenerated,
  ]);

  const targetCount = filterNoBidang.trim()
    ? archivedGroups.has(filterNoBidang.trim())
      ? 1
      : 0
    : bidangKeys.length;

  return (
    <ImportDialogShell
      embedded={embedded}
      open={open}
      onOpenChange={onOpenChange}
      title={`Buat ulang poligon → ${bidangTable.display_name}`}
      description="Gabungkan titik arsip (urutan + koordinat) menjadi poligon bidang. Berguna setelah koreksi urutan atau koordinat titik lapangan."
    >
      <div>
        <Label htmlFor="regen-points-table">Tabel titik sumber</Label>
        <select
          id="regen-points-table"
          value={pointsTableId}
          onChange={(e) => setPointsTableId(e.target.value)}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
          disabled={pending}
        >
          {pointsTableOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.display_name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="regen-filter-bidang">No. bidang (opsional)</Label>
        <Input
          id="regen-filter-bidang"
          value={filterNoBidang}
          onChange={(e) => setFilterNoBidang(e.target.value)}
          list="regen-bidang-keys"
          placeholder="Kosongkan = semua bidang di tabel titik"
          className="mt-1 font-mono"
          disabled={pending}
        />
        <datalist id="regen-bidang-keys">
          {bidangKeys.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {bidangKeys.length} bidang punya titik arsip
          {targetCount > 0 ? ` · target regenerasi: ${targetCount}` : ""}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="regen-bidang-geom">Kolom geometri bidang</Label>
          <select
            id="regen-bidang-geom"
            value={bidangGeometrySlug}
            onChange={(e) => setBidangGeometrySlug(e.target.value)}
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            disabled={pending}
          >
            {bidangGeometryColumns.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.display_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="regen-bidang-match">Kolom kunci bidang</Label>
          <select
            id="regen-bidang-match"
            value={bidangMatchSlug}
            onChange={(e) => setBidangMatchSlug(e.target.value)}
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            disabled={pending}
          >
            {bidangMatchColumns.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="regen-upsert">Mode</Label>
        <select
          id="regen-upsert"
          value={upsertMode}
          onChange={(e) =>
            setUpsertMode(e.target.value as "upsert" | "insert_only")
          }
          className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          disabled={pending}
        >
          <option value="upsert">Upsert (baru + perbarui geometri)</option>
          <option value="insert_only">Hanya bidang baru</option>
        </select>
      </div>

      {msg ? (
        <p
          className={`text-xs ${msg.startsWith("Poligon") ? "text-green-700" : "text-red-600"}`}
          role="alert"
        >
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
          {embedded ? "Kembali" : "Tutup"}
        </Button>
        <Button
          type="button"
          onClick={runRegenerate}
          disabled={pending || targetCount === 0}
        >
          {pending ? (
            <>
              <Spinner className="mr-2 size-4" />
              Memproses…
            </>
          ) : (
            `Buat ulang poligon (${targetCount})`
          )}
        </Button>
      </div>
    </ImportDialogShell>
  );
}
