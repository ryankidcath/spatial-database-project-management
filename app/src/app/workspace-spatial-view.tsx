"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { pilihRuangKerjaUntuk, ruangKerjaIni } from "@/lib/product-labels";
import { cn } from "@/lib/utils";
import {
  isMapTableLayerVisible,
  loadMapLayerVisibility,
  saveMapLayerVisibility,
} from "@/lib/workspace-spatial-layer-preference";
import {
  SPATIAL_IMPORT_PREVIEW_COLOR,
  spatialLayerColorForTableIndex,
} from "@/lib/workspace-spatial-layer-colors";
import type {
  IssueGeometryFeatureMapRow,
  IssueFeatureAttributeRow,
} from "./spatial-attribute-types";
import type { MapFootprint, VirtualRowMapSelect } from "./workspace-map";
import type {
  VirtualTableRow,
  VirtualColumnRow,
  VirtualDataRow,
} from "./virtual-table-types";
import {
  type LayerUploadCreated,
} from "./virtual-table-view";
import { WorkspaceSpatialImportWizard } from "./workspace-spatial-import-wizard";
import {
  fetchVirtualRowsAction,
  resolveRelationLabelsAction,
} from "./virtual-table-actions";
import {
  buildVirtualTableMapPopupProperties,
  collectRelationIdsFromVirtualPayloads,
  pickMapRowTitle,
  type VirtualColumnForMapPopup,
} from "@/lib/virtual-table-map-popup";
import { mapPreviewLayersSignature } from "@/lib/virtual-table-map-preview";
import { buildChatRowPathSegments } from "@/lib/chat-row-context";
import {
  WorkspaceSpatialToolbar,
  buildSpatialLayerRows,
} from "./workspace-spatial-toolbar";
import {
  useWorkspaceCollapsibleRail,
  WorkspaceCollapsibleRailShell,
  WorkspaceRailToggleButton,
} from "./workspace-collapsible-rail";
import { WorkspaceSpatialLayerRail } from "./workspace-spatial-layer-rail";
import { useWorkspaceRightPanel } from "./workspace-right-panel-context";

const WorkspaceMap = dynamic(
  () => import("./workspace-map").then((m) => m.WorkspaceMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[12rem] w-full flex-1 items-center justify-center rounded-md border border-border bg-muted/40 text-sm text-muted-foreground">
        <div className="inline-flex items-center gap-2">
          <Spinner className="size-4" />
          <span>Harap tunggu, memuat peta…</span>
        </div>
      </div>
    ),
  }
);

/** Minimal issue shape — retained for props compat; legacy map UI hidden (S2). */
type MapScopeIssue = {
  id: string;
  project_id: string;
  parent_id: string | null;
};

export type WorkspaceSpatialViewProps = {
  selectedProjectId: string | null;
  selectedTaskId: string | null;
  selectedScopePath: string;
  selectedProject: { id: string; name: string } | null;
  isBelowMd: boolean;
  isMapTabActive: boolean;
  issues: MapScopeIssue[];
  issueGeometryFeatureMap: IssueGeometryFeatureMapRow[];
  issueFeatureAttributes: IssueFeatureAttributeRow[];
  allAccessibleVtables: VirtualTableRow[];
  virtualColumns: VirtualColumnRow[];
  memberNameByUserId: Map<string, string>;
  onSelectTableSlug: (slug: string) => void;
};

export function WorkspaceSpatialView({
  selectedProjectId,
  selectedProject,
  isBelowMd,
  isMapTabActive,
  allAccessibleVtables,
  virtualColumns,
  memberNameByUserId,
  onSelectTableSlug,
}: WorkspaceSpatialViewProps) {
  const router = useRouter();
  const rail = useWorkspaceCollapsibleRail("Map");
  const { panel, openRowDetail, closePanel } = useWorkspaceRightPanel();

  const [tableLayerVisibility, setTableLayerVisibility] = useState<
    Record<string, boolean>
  >({});

  const [vtableGeometryLayers, setVtableGeometryLayers] = useState<MapFootprint[]>(
    []
  );
  const [mapTabEpoch, setMapTabEpoch] = useState(0);
  const [mapImportTableId, setMapImportTableId] = useState<string>("");
  const [spatialImportWizardOpen, setSpatialImportWizardOpen] = useState(false);
  const [mapImportTableRows, setMapImportTableRows] = useState<VirtualDataRow[]>(
    []
  );
  const [mapImportPreviewLayers, setMapImportPreviewLayers] = useState<
    MapFootprint[]
  >([]);
  const [importPreviewVisible, setImportPreviewVisible] = useState(true);

  useEffect(() => {
    if (!selectedProjectId) {
      setTableLayerVisibility({});
      return;
    }
    setTableLayerVisibility(loadMapLayerVisibility(selectedProjectId));
  }, [selectedProjectId]);

  useEffect(() => {
    if (!isMapTabActive) {
      setMapImportPreviewLayers([]);
      setImportPreviewVisible(true);
      setSpatialImportWizardOpen(false);
    }
  }, [isMapTabActive]);

  useEffect(() => {
    setMapTabEpoch((n) => n + 1);
  }, [selectedProjectId]);

  useEffect(() => {
    if (mapImportPreviewLayers.length > 0) {
      setImportPreviewVisible(true);
    }
  }, [mapImportPreviewLayers.length]);

  const layersInRail = !isBelowMd && rail.isOpen;

  const visibleMapLayers = useMemo(() => {
    const combined = [...mapImportPreviewLayers, ...vtableGeometryLayers];
    return combined.filter((layer) => {
      const k = layer.layerKind ?? "demo";
      if (k === "import_preview") return importPreviewVisible;
      if (k === "virtual_table" && layer.virtualTableId) {
        return isMapTableLayerVisible(
          tableLayerVisibility,
          layer.virtualTableId
        );
      }
      return false;
    });
  }, [
    mapImportPreviewLayers,
    vtableGeometryLayers,
    tableLayerVisibility,
    importPreviewVisible,
  ]);

  const vtablesWithGeometry = useMemo(() => {
    const geoCols = virtualColumns.filter((c) => c.data_type === "geometry");
    if (geoCols.length === 0) return [];
    const tableIdsWithGeo = new Set(geoCols.map((c) => c.table_id));
    return allAccessibleVtables.filter((vt) => tableIdsWithGeo.has(vt.id));
  }, [virtualColumns, allAccessibleVtables]);

  const vtablesWithGeometrySig = useMemo(
    () => vtablesWithGeometry.map((vt) => vt.id).join(","),
    [vtablesWithGeometry]
  );

  const virtualColumnsGeomSig = useMemo(
    () =>
      virtualColumns
        .filter((c) => c.data_type === "geometry")
        .map((c) => `${c.id}:${c.table_id}:${c.slug}`)
        .join("|"),
    [virtualColumns]
  );

  const featureCountByTableId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const layer of vtableGeometryLayers) {
      if (layer.layerKind !== "virtual_table" || !layer.virtualTableId) continue;
      counts.set(
        layer.virtualTableId,
        (counts.get(layer.virtualTableId) ?? 0) + 1
      );
    }
    return counts;
  }, [vtableGeometryLayers]);

  const spatialLayerRows = useMemo(
    () =>
      buildSpatialLayerRows(
        vtablesWithGeometry,
        featureCountByTableId,
        tableLayerVisibility
      ),
    [vtablesWithGeometry, featureCountByTableId, tableLayerVisibility]
  );

  const handleTableLayerVisibilityChange = useCallback(
    (tableId: string, visible: boolean) => {
      setTableLayerVisibility((prev) => {
        const next = { ...prev, [tableId]: visible };
        if (selectedProjectId) {
          saveMapLayerVisibility(selectedProjectId, next);
        }
        return next;
      });
    },
    [selectedProjectId]
  );

  useEffect(() => {
    if (vtablesWithGeometry.length === 0) {
      setMapImportTableId("");
      return;
    }
    setMapImportTableId((prev) => {
      if (prev && vtablesWithGeometry.some((vt) => vt.id === prev)) return prev;
      const preferred =
        vtablesWithGeometry.find((vt) => {
          const name = `${vt.display_name} ${vt.slug}`.toLowerCase();
          return (
            name.includes("daftar bidang") ||
            name.includes("bidang tanah") ||
            name.includes("bidang")
          );
        }) ?? vtablesWithGeometry[0];
      return preferred?.id ?? "";
    });
  }, [vtablesWithGeometry]);


  const handleSpatialImportTableChange = useCallback((tableId: string) => {
    setMapImportTableId(tableId);
    setMapImportPreviewLayers([]);
  }, []);

  const handleMapImportPreviewChange = useCallback(
    (layers: MapFootprint[] | null) => {
      setMapImportPreviewLayers((prev) => {
        const nextSig = mapPreviewLayersSignature(layers);
        const prevSig = mapPreviewLayersSignature(prev);
        if (nextSig === prevSig) return prev;
        return layers ?? [];
      });
    },
    []
  );

  const handleSpatialImportWizardOpenChange = useCallback((open: boolean) => {
    setSpatialImportWizardOpen(open);
    if (!open) setMapImportPreviewLayers([]);
  }, []);

  const handleMapGeoImported = useCallback(() => {
    setMapImportPreviewLayers([]);
    setSpatialImportWizardOpen(false);
    setMapTabEpoch((n) => n + 1);
    router.refresh();
  }, [router]);

  const handleMapDxfImported = useCallback(() => {
    setSpatialImportWizardOpen(false);
    setMapTabEpoch((n) => n + 1);
    router.refresh();
  }, [router]);

  const handleMapLayerCreated = useCallback(
    (result: LayerUploadCreated) => {
      setMapImportPreviewLayers([]);
      setSpatialImportWizardOpen(false);
      setMapImportTableId(result.tableId);
      onSelectTableSlug(result.tableSlug);
      setMapTabEpoch((n) => n + 1);
      router.refresh();
    },
    [router, onSelectTableSlug]
  );

  useEffect(() => {
    if (!spatialImportWizardOpen || !mapImportTableId) {
      setMapImportTableRows([]);
      return;
    }
    let cancelled = false;
    void fetchVirtualRowsAction(mapImportTableId).then((result) => {
      if (cancelled) return;
      setMapImportTableRows(
        result.error ? [] : (result.rows as VirtualDataRow[])
      );
    });
    return () => {
      cancelled = true;
    };
  }, [spatialImportWizardOpen, mapImportTableId]);

  useEffect(() => {
    if (vtablesWithGeometry.length === 0) {
      setVtableGeometryLayers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const layers: MapFootprint[] = [];
      for (const vt of vtablesWithGeometry) {
        const result = await fetchVirtualRowsAction(vt.id);
        if (cancelled) return;
        if (result.error || !result.rows) continue;

        const tableCols: VirtualColumnForMapPopup[] = virtualColumns
          .filter((c) => c.table_id === vt.id)
          .map((c) => ({
            slug: c.slug,
            display_name: c.display_name,
            data_type: c.data_type,
            position: c.position,
          }));

        const geoCols = tableCols.filter((c) => c.data_type === "geometry");

        const rowPayloads = result.rows.map((row) => ({
          payload:
            ((row as Record<string, unknown>).payload as Record<string, unknown> | null) ??
            {},
        }));
        const relationIds = collectRelationIdsFromVirtualPayloads(
          rowPayloads,
          tableCols
        );
        let relationLabels: Record<string, string> = {};
        if (relationIds.length > 0) {
          const resolved = await resolveRelationLabelsAction(relationIds);
          if (cancelled) return;
          if (!resolved.error) relationLabels = resolved.labels;
        }

        for (const row of result.rows) {
          const payload = (row as Record<string, unknown>).payload as Record<
            string,
            unknown
          > | null;
          if (!payload) continue;
          const rowId = (row as Record<string, unknown>).id as string;
          const rowTitle = pickMapRowTitle(
            payload,
            tableCols,
            relationLabels,
            rowId
          );
          const chatPathSegments = buildChatRowPathSegments({
            projectName: selectedProject?.name ?? null,
            tableDisplayName: vt.display_name,
            rowLabel: rowTitle,
          });

          for (const gc of geoCols) {
            const geo = payload[gc.slug];
            if (!geo || typeof geo !== "object") continue;
            layers.push({
              id: `vtable:${rowId}:${gc.slug}`,
              label: `${vt.display_name}: ${rowTitle}`,
              geojson: geo,
              popupProperties: buildVirtualTableMapPopupProperties(
                vt.display_name,
                tableCols,
                payload,
                relationLabels,
                memberNameByUserId,
                {
                  skipGeometrySlug: gc.slug,
                  rowTitle,
                  virtualRowId: rowId,
                  virtualTableId: vt.id,
                  projectName: selectedProject?.name ?? null,
                  chatPathSegments,
                }
              ),
              layerKind: "virtual_table",
              virtualTableId: vt.id,
              virtualRowId: rowId,
              rowPayload: payload,
              relationLabels,
              chatPathSegments,
            });
          }
        }
      }
      if (!cancelled) setVtableGeometryLayers(layers);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    mapTabEpoch,
    vtablesWithGeometry,
    vtablesWithGeometrySig,
    virtualColumnsGeomSig,
    memberNameByUserId,
    selectedProject?.name,
    virtualColumns,
  ]);

  const hasAnyGeometry =
    vtableGeometryLayers.length > 0 || mapImportPreviewLayers.length > 0;
  const allLayersHidden = hasAnyGeometry && visibleMapLayers.length === 0;

  const layerPickerHint = layersInRail
    ? "panel Lapisan di kiri"
    : "menu Lapisan di toolbar";

  const highlightVirtualRowId =
    panel?.kind === "row-detail" ? panel.rowId : null;

  const handleVirtualRowSelect = useCallback(
    (select: VirtualRowMapSelect) => {
      openRowDetail({
        tableId: select.tableId,
        rowId: select.rowId,
        pathSegments: select.pathSegments,
        rowPayload: select.rowPayload,
        relationLabels: select.relationLabels,
      });
    },
    [openRowDetail]
  );

  const handleMapBackgroundClick = useCallback(() => {
    if (panel?.kind === "row-detail") closePanel();
  }, [panel?.kind, closePanel]);

  return (
    <div className="flex h-0 min-h-0 flex-1 basis-0 flex-col">
      {!selectedProjectId ? (
        <p className="p-3 text-sm text-muted-foreground">
          {pilihRuangKerjaUntuk("untuk melihat peta.")}
        </p>
      ) : (
        <div className="flex h-0 min-h-0 min-w-0 flex-1 basis-0 flex-row overflow-hidden">
          {!isBelowMd ? (
            <WorkspaceCollapsibleRailShell isOpen={rail.isOpen}>
              <WorkspaceSpatialLayerRail
                layerRows={spatialLayerRows}
                importPreviewCount={mapImportPreviewLayers.length}
                importPreviewVisible={importPreviewVisible}
                onImportPreviewVisibilityChange={setImportPreviewVisible}
                onTableLayerVisibilityChange={handleTableLayerVisibilityChange}
              />
            </WorkspaceCollapsibleRailShell>
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {selectedProjectId ? (
            <WorkspaceSpatialImportWizard
              open={spatialImportWizardOpen}
              onOpenChange={handleSpatialImportWizardOpenChange}
              projectId={selectedProjectId}
              vtablesWithGeometry={vtablesWithGeometry}
              allAccessibleVtables={allAccessibleVtables}
              virtualColumns={virtualColumns}
              defaultTableId={mapImportTableId}
              importTableRows={mapImportTableRows}
              mapPreviewEnabled
              onPreviewChange={handleMapImportPreviewChange}
              onImported={() => {
                handleMapGeoImported();
              }}
              onLayerCreated={handleMapLayerCreated}
              onTableIdChange={handleSpatialImportTableChange}
            />
          ) : null}

          <WorkspaceSpatialToolbar
            layerRows={spatialLayerRows}
            importPreviewCount={mapImportPreviewLayers.length}
            importPreviewVisible={importPreviewVisible}
            onImportPreviewVisibilityChange={setImportPreviewVisible}
            onTableLayerVisibilityChange={handleTableLayerVisibilityChange}
            onOpenImportWizard={() => setSpatialImportWizardOpen(true)}
            isBelowMd={isBelowMd}
            layersInRail={layersInRail}
            headerLeading={
              rail.railEnabled ? (
                <WorkspaceRailToggleButton
                  isOpen={rail.isOpen}
                  onToggle={rail.toggle}
                  touchFriendly={isBelowMd}
                />
              ) : undefined
            }
          />

          {!hasAnyGeometry ? (
            <p className="shrink-0 px-3 py-2 text-sm text-muted-foreground">
              Belum ada geometri di peta untuk {ruangKerjaIni}. Gunakan{" "}
              <span className="font-medium text-foreground">Impor</span> untuk
              menambah data ke tabel virtual.
            </p>
          ) : null}

          {allLayersHidden ? (
            <p
              className="mx-3 mb-2 shrink-0 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground"
              role="status"
            >
              Semua lapisan dimatikan. Aktifkan minimal satu lapisan lewat{" "}
              <span className="font-semibold">{layerPickerHint}</span>.
            </p>
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <WorkspaceMap
              footprints={visibleMapLayers}
              highlightBerkasId={null}
              highlightVirtualRowId={highlightVirtualRowId}
              onVirtualRowSelect={handleVirtualRowSelect}
              onMapBackgroundClick={handleMapBackgroundClick}
            />
          </div>

          {!layersInRail &&
          (spatialLayerRows.some((r) => r.visible) ||
            (mapImportPreviewLayers.length > 0 && importPreviewVisible)) ? (
            <div
              className={cn(
                "flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-xs text-muted-foreground",
                isBelowMd && "gap-y-2"
              )}
            >
              {spatialLayerRows
                .filter((r) => r.visible)
                .map((row) => (
                  <span key={row.tableId} className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block size-2 rounded-sm"
                      style={{ background: row.color }}
                      aria-hidden
                    />
                    {row.displayName}
                  </span>
                ))}
              {mapImportPreviewLayers.length > 0 && importPreviewVisible ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block size-2 rounded-sm border border-teal-700"
                    style={{
                      background: SPATIAL_IMPORT_PREVIEW_COLOR,
                      borderStyle: "dashed",
                    }}
                    aria-hidden
                  />
                  Pratinjau impor
                </span>
              ) : null}
            </div>
          ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
