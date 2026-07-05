"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crosshair, GitCompareArrows, Layers, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatMeasureArea } from "@/lib/workspace-map-measure";
import {
  findLayerOverlapPairs,
  type LayerOverlapPair,
} from "@/lib/workspace-map-layer-overlap";
import {
  computeAllVisibleLayerStats,
  computeCombinedVisibleStats,
} from "@/lib/workspace-map-layer-stats";
import {
  findFootprintsWithinBuffer,
  findFootprintsWithinReferenceLayer,
  type WithinQueryHit,
} from "@/lib/workspace-map-layer-within";
import {
  compareMapFootprints,
  listComparableFootprints,
} from "@/lib/workspace-map-compare-selection";
import type { MapFootprint } from "./workspace-map";
import type { SpatialLayerRow } from "./workspace-spatial-toolbar";

type Tab = "overlap" | "within" | "stats" | "compare";
type WithinMode = "buffer" | "reference";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layerRows: SpatialLayerRow[];
  footprints: MapFootprint[];
  onHighlightFootprints: (ids: string[]) => void;
  onZoomToFootprints: (ids: string[]) => void;
  onGetMapCenter?: () => { lat: number; lng: number } | null;
  /** Dua footprint id untuk prefill tab Bandingkan (mis. dari seleksi sync). */
  prefillCompareFootprintIds?: [string, string] | null;
};

function LayerSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: SpatialLayerRow[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
      >
        <option value="">— pilih lapisan —</option>
        {options.map((r) => (
          <option key={r.tableId} value={r.tableId}>
            {r.displayName} ({r.featureCount})
          </option>
        ))}
      </select>
    </div>
  );
}

function FootprintSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
      >
        <option value="">— pilih fitur —</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function WorkspaceSpatialAnalysisDialog({
  open,
  onOpenChange,
  layerRows,
  footprints,
  onHighlightFootprints,
  onZoomToFootprints,
  onGetMapCenter,
  prefillCompareFootprintIds = null,
}: Props) {
  const [tab, setTab] = useState<Tab>("stats");
  const [tableIdA, setTableIdA] = useState("");
  const [tableIdB, setTableIdB] = useState("");
  const [overlapResults, setOverlapResults] = useState<LayerOverlapPair[]>([]);
  const [withinMode, setWithinMode] = useState<WithinMode>("buffer");
  const [sourceTableId, setSourceTableId] = useState("");
  const [referenceTableId, setReferenceTableId] = useState("");
  const [bufferLat, setBufferLat] = useState("");
  const [bufferLng, setBufferLng] = useState("");
  const [bufferRadius, setBufferRadius] = useState("500");
  const [withinResults, setWithinResults] = useState<WithinQueryHit[]>([]);
  const [compareIdA, setCompareIdA] = useState("");
  const [compareIdB, setCompareIdB] = useState("");

  const comparableFootprints = useMemo(
    () => listComparableFootprints(footprints),
    [footprints]
  );

  const compareResult = useMemo(() => {
    if (!compareIdA || !compareIdB) return null;
    return compareMapFootprints(footprints, compareIdA, compareIdB);
  }, [footprints, compareIdA, compareIdB]);

  const selectableLayers = useMemo(
    () => layerRows.filter((r) => r.featureCount > 0),
    [layerRows]
  );

  const stats = useMemo(
    () => computeAllVisibleLayerStats(footprints, layerRows),
    [footprints, layerRows]
  );
  const combinedStats = useMemo(
    () => computeCombinedVisibleStats(stats),
    [stats]
  );

  useEffect(() => {
    if (!open) {
      onHighlightFootprints([]);
      return;
    }
    if (selectableLayers.length > 0 && !tableIdA) {
      setTableIdA(selectableLayers[0]!.tableId);
    }
    if (selectableLayers.length > 1 && !tableIdB) {
      setTableIdB(selectableLayers[1]!.tableId);
    }
    if (selectableLayers.length === 1 && !tableIdB) {
      setTableIdB(selectableLayers[0]!.tableId);
    }
    if (selectableLayers.length > 0 && !sourceTableId) {
      setSourceTableId(selectableLayers[0]!.tableId);
    }
    if (selectableLayers.length > 1 && !referenceTableId) {
      setReferenceTableId(selectableLayers[1]!.tableId);
    }
  }, [
    open,
    selectableLayers,
    tableIdA,
    tableIdB,
    sourceTableId,
    referenceTableId,
    onHighlightFootprints,
  ]);

  useEffect(() => {
    if (!open) {
      setCompareIdA("");
      setCompareIdB("");
      return;
    }
    if (comparableFootprints.length < 2) return;
    if (
      prefillCompareFootprintIds &&
      comparableFootprints.some((f) => f.id === prefillCompareFootprintIds[0]) &&
      comparableFootprints.some((f) => f.id === prefillCompareFootprintIds[1])
    ) {
      setCompareIdA(prefillCompareFootprintIds[0]);
      setCompareIdB(prefillCompareFootprintIds[1]);
      return;
    }
    setCompareIdA(comparableFootprints[0]!.id);
    setCompareIdB(comparableFootprints[1]!.id);
  }, [open, prefillCompareFootprintIds, comparableFootprints]);

  useEffect(() => {
    if (!open || tab !== "compare") return;
    if (compareIdA && compareIdB && compareIdA !== compareIdB) {
      onHighlightFootprints([compareIdA, compareIdB]);
    }
  }, [open, tab, compareIdA, compareIdB, onHighlightFootprints]);

  const runOverlap = useCallback(() => {
    if (!tableIdA || !tableIdB) return;
    const pairs = findLayerOverlapPairs(footprints, tableIdA, tableIdB);
    setOverlapResults(pairs);
    const ids = pairs.flatMap((p) => [p.footprintIdA, p.footprintIdB]);
    onHighlightFootprints([...new Set(ids)]);
  }, [footprints, tableIdA, tableIdB, onHighlightFootprints]);

  const runWithin = useCallback(() => {
    if (!sourceTableId) return;
    let hits: WithinQueryHit[] = [];
    if (withinMode === "buffer") {
      const lat = Number.parseFloat(bufferLat);
      const lng = Number.parseFloat(bufferLng);
      const radius = Number.parseFloat(bufferRadius);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || radius <= 0) return;
      hits = findFootprintsWithinBuffer(footprints, sourceTableId, {
        lat,
        lng,
        radiusMeters: radius,
      });
    } else {
      if (!referenceTableId) return;
      hits = findFootprintsWithinReferenceLayer(
        footprints,
        sourceTableId,
        referenceTableId
      );
    }
    setWithinResults(hits);
    onHighlightFootprints(hits.map((h) => h.footprintId));
  }, [
    footprints,
    sourceTableId,
    referenceTableId,
    withinMode,
    bufferLat,
    bufferLng,
    bufferRadius,
    onHighlightFootprints,
  ]);

  const fillMapCenter = useCallback(() => {
    const center = onGetMapCenter?.();
    if (!center) return;
    setBufferLat(center.lat.toFixed(6));
    setBufferLng(center.lng.toFixed(6));
  }, [onGetMapCenter]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "stats", label: "Statistik" },
    { id: "overlap", label: "Overlap" },
    { id: "within", label: "Within / buffer" },
    { id: "compare", label: "Bandingkan" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,40rem)] flex-col gap-0 overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0 pb-3">
          <DialogTitle>Analisis spasial</DialogTitle>
          <DialogDescription>
            Overlap antar lapisan, query within/buffer, statistik extent, dan
            bandingkan dua fitur (jarak centroid + selisih luas).
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 gap-1 rounded-lg border border-border p-1">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                tab === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
              onClick={() => {
                setTab(id);
                onHighlightFootprints([]);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-3">
          {tab === "stats" ? (
            <div className="space-y-3">
              {stats.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tidak ada lapisan aktif dengan geometri.
                </p>
              ) : (
                <>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Total lapisan aktif
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      <span className="font-semibold tabular-nums">
                        {combinedStats.featureCount}
                      </span>{" "}
                      fitur ·{" "}
                      <span className="font-semibold">
                        {combinedStats.totalAreaLabel}
                      </span>
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {stats.map((s) => (
                      <li
                        key={s.tableId}
                        className="rounded-lg border border-border px-3 py-2.5 text-sm"
                      >
                        <div className="flex items-center gap-2 font-medium text-foreground">
                          <Layers className="size-3.5 shrink-0 text-muted-foreground" />
                          {s.displayName}
                        </div>
                        <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
                          <div className="flex justify-between gap-2">
                            <dt>Fitur</dt>
                            <dd className="tabular-nums text-foreground">
                              {s.featureCount}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt>Total luas</dt>
                            <dd className="text-foreground">{s.totalAreaLabel}</dd>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <dt>Bbox (SW → NE)</dt>
                            <dd className="font-mono text-[10px] leading-snug text-foreground">
                              {s.bboxLabel}
                            </dd>
                          </div>
                        </dl>
                        {s.featureCount > 0 ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2 h-7 gap-1 text-xs"
                            onClick={() =>
                              onZoomToFootprints(
                                footprints
                                  .filter(
                                    (fp) =>
                                      fp.virtualTableId === s.tableId
                                  )
                                  .map((fp) => fp.id)
                              )
                            }
                          >
                            <Target className="size-3" />
                            Zoom ke lapisan
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : null}

          {tab === "overlap" ? (
            <div className="space-y-3">
              <LayerSelect
                id="overlap-a"
                label="Lapisan A"
                value={tableIdA}
                options={selectableLayers}
                onChange={setTableIdA}
              />
              <LayerSelect
                id="overlap-b"
                label="Lapisan B"
                value={tableIdB}
                options={selectableLayers}
                onChange={setTableIdB}
              />
              <Button type="button" size="sm" onClick={runOverlap}>
                Cari tumpang tindih
              </Button>
              {overlapResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {tableIdA && tableIdB
                    ? "Belum ada pasangan overlap ditemukan."
                    : "Pilih dua lapisan lalu jalankan analisis."}
                </p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {overlapResults.map((pair) => (
                    <li key={`${pair.footprintIdA}|${pair.footprintIdB}`}>
                      <button
                        type="button"
                        className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                        onClick={() => {
                          onHighlightFootprints([
                            pair.footprintIdA,
                            pair.footprintIdB,
                          ]);
                          onZoomToFootprints([
                            pair.footprintIdA,
                            pair.footprintIdB,
                          ]);
                        }}
                      >
                        <span className="font-medium text-foreground">
                          {formatMeasureArea(pair.overlapAreaSqM)}
                        </span>
                        <span className="mt-0.5 block truncate text-muted-foreground">
                          {pair.labelA} ↔ {pair.labelB}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === "within" ? (
            <div className="space-y-3">
              <div className="flex gap-1 rounded-md border border-border p-0.5">
                {(
                  [
                    ["buffer", "Buffer titik"],
                    ["reference", "Dalam lapisan"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={cn(
                      "flex-1 rounded px-2 py-1 text-[11px] font-medium",
                      withinMode === id
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground"
                    )}
                    onClick={() => setWithinMode(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <LayerSelect
                id="within-source"
                label="Lapisan sumber"
                value={sourceTableId}
                options={selectableLayers}
                onChange={setSourceTableId}
              />

              {withinMode === "buffer" ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="buf-lat">Latitude</Label>
                      <Input
                        id="buf-lat"
                        value={bufferLat}
                        onChange={(e) => setBufferLat(e.target.value)}
                        placeholder="-6.74"
                        inputMode="decimal"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="buf-lng">Longitude</Label>
                      <Input
                        id="buf-lng"
                        value={bufferLng}
                        onChange={(e) => setBufferLng(e.target.value)}
                        placeholder="108.55"
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="buf-radius">Radius (meter)</Label>
                    <Input
                      id="buf-radius"
                      value={bufferRadius}
                      onChange={(e) => setBufferRadius(e.target.value)}
                      inputMode="decimal"
                    />
                  </div>
                  {onGetMapCenter ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={fillMapCenter}
                    >
                      <Crosshair className="size-3.5" />
                      Pusat peta saat ini
                    </Button>
                  ) : null}
                </>
              ) : (
                <LayerSelect
                  id="within-ref"
                  label="Lapisan referensi"
                  value={referenceTableId}
                  options={selectableLayers.filter(
                    (r) => r.tableId !== sourceTableId
                  )}
                  onChange={setReferenceTableId}
                />
              )}

              <Button type="button" size="sm" onClick={runWithin}>
                Jalankan query
              </Button>

              {withinResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada hasil. Atur parameter lalu jalankan query.
                </p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {withinResults.map((hit) => (
                    <li key={hit.footprintId}>
                      <button
                        type="button"
                        className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                        onClick={() => {
                          onHighlightFootprints([hit.footprintId]);
                          onZoomToFootprints([hit.footprintId]);
                        }}
                      >
                        <span className="block truncate font-medium text-foreground">
                          {hit.label}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === "compare" ? (
            <div className="space-y-3">
              {comparableFootprints.length < 2 ? (
                <p className="text-sm text-muted-foreground">
                  Minimal dua fitur di peta untuk dibandingkan.
                </p>
              ) : (
                <>
                  <FootprintSelect
                    id="compare-a"
                    label="Fitur A"
                    value={compareIdA}
                    options={comparableFootprints}
                    onChange={setCompareIdA}
                  />
                  <FootprintSelect
                    id="compare-b"
                    label="Fitur B"
                    value={compareIdB}
                    options={comparableFootprints}
                    onChange={setCompareIdB}
                  />

                  {compareResult ? (
                    <div className="space-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <GitCompareArrows className="size-3.5 shrink-0 text-muted-foreground" />
                        Hasil perbandingan
                      </div>
                      {compareResult.error ? (
                        <p className="text-xs text-destructive">
                          {compareResult.error}
                        </p>
                      ) : null}
                      <dl className="grid gap-2 text-xs">
                        <div>
                          <dt className="text-muted-foreground">Fitur A</dt>
                          <dd className="truncate font-medium text-foreground">
                            {compareResult.labelA}
                          </dd>
                          <dd className="text-muted-foreground">
                            Luas: {compareResult.areaLabelA}
                          </dd>
                          <dd className="font-mono text-[10px] text-foreground">
                            Centroid: {compareResult.centroidALabel}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Fitur B</dt>
                          <dd className="truncate font-medium text-foreground">
                            {compareResult.labelB}
                          </dd>
                          <dd className="text-muted-foreground">
                            Luas: {compareResult.areaLabelB}
                          </dd>
                          <dd className="font-mono text-[10px] text-foreground">
                            Centroid: {compareResult.centroidBLabel}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2 border-t border-border pt-2">
                          <dt className="text-muted-foreground">
                            Jarak centroid
                          </dt>
                          <dd className="font-semibold tabular-nums text-foreground">
                            {compareResult.distanceLabel}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Selisih luas</dt>
                          <dd className="font-semibold text-foreground">
                            {compareResult.areaDeltaLabel}
                          </dd>
                        </div>
                      </dl>
                      {compareIdA && compareIdB && compareIdA !== compareIdB ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-1 h-7 gap-1 text-xs"
                          onClick={() =>
                            onZoomToFootprints([compareIdA, compareIdB])
                          }
                        >
                          <Target className="size-3" />
                          Zoom ke kedua fitur
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Pilih dua fitur berbeda.
                    </p>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
