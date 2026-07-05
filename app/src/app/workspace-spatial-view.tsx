"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { pilihRuangKerjaUntuk, ruangKerjaIni } from "@/lib/product-labels";
import { cn } from "@/lib/utils";
import {
  isMapTableLayerVisible,
  loadMapLayerVisibility,
  saveMapLayerVisibility,
} from "@/lib/workspace-spatial-layer-preference";
import {
  createSpatialLayerGroupId,
  loadSpatialFilterSyncEnabled,
  loadSpatialLayerLayout,
  mergeTableOrder,
  saveSpatialFilterSyncEnabled,
  saveSpatialLayerLayout,
  type SpatialLayerLayoutPrefs,
} from "@/lib/workspace-spatial-layer-layout-preference";
import {
  loadSpatialLayerStyles,
  saveSpatialLayerStyles,
  type SpatialLayerStyleByTable,
  type SpatialLayerSymbolStyle,
} from "@/lib/workspace-spatial-layer-style-preference";
import { rowMatchesVirtualViewFilters } from "@/lib/virtual-table-row-filters";
import { viewSessionFilters } from "@/lib/virtual-table-view-session";
import {
  loadMapExtentBookmark,
  loadMapLayerOpacity,
  loadMapUiPreferences,
  saveMapExtentBookmark,
  saveMapLayerOpacity,
  saveMapUiPreferences,
} from "@/lib/workspace-spatial-map-preferences";
import {
  loadSpatialDesktopPrefs,
  saveSpatialDesktopPrefs,
  type SpatialDesktopPrefs,
} from "@/lib/workspace-spatial-desktop-prefs";
import {
  loadExternalMapLayers,
  saveExternalMapLayers,
  type ExternalMapLayerConfig,
} from "@/lib/workspace-spatial-external-layers";
import type { ResolvedExternalMapLayer } from "@/lib/workspace-spatial-external-layers";
import {
  externalLayersResolveKey,
  resolveExternalMapLayers,
} from "@/lib/workspace-spatial-resolve-external-layers";
import { externalLayerBounds } from "@/lib/workspace-map-external-layers";
import {
  loadOfflineTilePrefs,
  type OfflineTilePrefs,
} from "@/lib/workspace-spatial-offline-tiles";
import { deleteGeoJsonBlob } from "@/lib/workspace-spatial-geojson-store";
import { buildMapAttributeRows } from "@/lib/workspace-map-attribute-rows";
import type { MapAttributeRow } from "@/lib/workspace-map-attribute-rows";
import { filterFootprintsByTableId } from "@/lib/workspace-map-bounds";
import { computeImportOverlapFootprintIds } from "@/lib/workspace-map-import-diff";
import type { WorkspaceBasemapId } from "@/lib/workspace-map-basemaps";
import type {
  CoordinateDisplayMode,
  MapIdentifyHit,
  MapMeasureResult,
  WorkspaceMapToolMode,
} from "@/lib/workspace-map-tool-types";
import type { CoordinateDisplayMode as CoordPref } from "@/lib/workspace-spatial-map-preferences";
import {
  spatialLayerColorForTableIndex,
} from "@/lib/workspace-spatial-layer-colors";
import type {
  IssueGeometryFeatureMapRow,
  IssueFeatureAttributeRow,
} from "./spatial-attribute-types";
import type { MapFootprint, VirtualRowMapSelect, WorkspaceMapHandle } from "./workspace-map";
import { WorkspaceMapLegend } from "./workspace-map-legend";
import { WorkspaceMapMinimap } from "./workspace-map-minimap";
import { WorkspaceMapBasemapSwipeControl } from "./workspace-map-basemap-swipe-control";
import { WorkspaceMapBasemapSwipeDivider } from "./workspace-map-basemap-swipe-divider";
import { WorkspaceSpatialAttributeDock } from "./workspace-spatial-attribute-dock";
import {
  WorkspaceMapStatusBar,
  type MapStatusState,
} from "./workspace-map-gis-chrome";
import { WorkspaceMapToolHud } from "./workspace-map-tool-hud";
import type { MeasureDraftState } from "./workspace-map-tool-controller";
import { WorkspaceSpatialGoToDialog } from "./workspace-spatial-go-to-dialog";
import { WorkspaceSpatialAnalysisDialog } from "./workspace-spatial-analysis-dialog";
import { WorkspaceSpatialExternalLayersDialog } from "./workspace-spatial-external-layers-dialog";
import { WorkspaceSpatialOfflinePackDialog } from "./workspace-spatial-offline-pack-dialog";
import { useWorkspaceSpatialDataSync } from "./workspace-spatial-data-sync-context";
import { formatSpatialMapContextText } from "@/lib/workspace-spatial-map-context-text";
import type {
  VirtualTableRow,
  VirtualColumnRow,
  VirtualDataRow,
} from "./virtual-table-types";
import type { ProjectEntity360Profile } from "@/lib/project-entity-360-profile";
import { WorkspaceEntity360ProfileDialog } from "./workspace-entity-360-profile-dialog";
import {
  type LayerUploadCreated,
} from "./virtual-table-view";
import { WorkspaceSpatialImportWizard } from "./workspace-spatial-import-wizard";
import {
  fetchRelationTraceTargetsAction,
  fetchVirtualRowsAction,
  resolveRelationLabelsAction,
} from "./virtual-table-actions";
import {
  buildRelationTraceSegments,
  type RelationTraceEndpoint,
  type RelationTraceTarget,
} from "@/lib/workspace-map-relation-trace";
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
import { moveTableInOrder } from "./workspace-spatial-layer-organizer";
import { useWorkspaceRightPanel } from "./workspace-right-panel-context";
import { Button } from "@/components/ui/button";
import { Minimize2 } from "lucide-react";
import type { Map as LeafletMap } from "leaflet";

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
  entity360Profile?: ProjectEntity360Profile;
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
  entity360Profile,
}: WorkspaceSpatialViewProps) {
  const router = useRouter();
  const mapHandleRef = useRef<WorkspaceMapHandle>(null);
  const mapBottomChromeRef = useRef<HTMLDivElement>(null);
  const rail = useWorkspaceCollapsibleRail("Map");
  const { panel, openEntity360, closePanel } = useWorkspaceRightPanel();
  const spatialSync = useWorkspaceSpatialDataSync();

  const [tableLayerVisibility, setTableLayerVisibility] = useState<
    Record<string, boolean>
  >({});
  const [tableLayerOpacity, setTableLayerOpacity] = useState<
    Record<string, number>
  >({});
  const [layerLayout, setLayerLayout] = useState<SpatialLayerLayoutPrefs>({
    tableOrder: [],
    groups: [],
    tableGroupId: {},
  });
  const [layerStyles, setLayerStyles] = useState<SpatialLayerStyleByTable>({});
  const [filterSyncEnabled, setFilterSyncEnabled] = useState(true);
  const [totalFeatureCountByTableId, setTotalFeatureCountByTableId] = useState<
    Map<string, number>
  >(new Map());
  const [basemapId, setBasemapId] = useState<WorkspaceBasemapId>("osm");
  const [showFeatureLabels, setShowFeatureLabels] = useState(false);
  const [coordinateDisplay, setCoordinateDisplay] =
    useState<CoordinateDisplayMode>("latlng");
  const [hasMapBookmark, setHasMapBookmark] = useState(false);
  const [toolMode, setToolMode] = useState<WorkspaceMapToolMode>("navigate");
  const [measureDraft, setMeasureDraft] = useState<MeasureDraftState>({
    pointCount: 0,
    liveResult: null,
  });
  const [measureFinished, setMeasureFinished] =
    useState<MapMeasureResult | null>(null);
  const [identifyHits, setIdentifyHits] = useState<MapIdentifyHit[]>([]);
  const [identifyPoint, setIdentifyPoint] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [goToOpen, setGoToOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [entity360ProfileOpen, setEntity360ProfileOpen] = useState(false);
  const [analysisHighlightIds, setAnalysisHighlightIds] = useState<string[]>(
    []
  );
  const [finishMeasureSignal, setFinishMeasureSignal] = useState(0);
  const [clearMeasureSignal, setClearMeasureSignal] = useState(0);
  const [leafletMap, setLeafletMap] = useState<LeafletMap | null>(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [desktopPrefs, setDesktopPrefs] = useState<SpatialDesktopPrefs>(() =>
    selectedProjectId
      ? loadSpatialDesktopPrefs(selectedProjectId)
      : loadSpatialDesktopPrefs("")
  );
  const [attributeDockExpanded, setAttributeDockExpanded] = useState(true);
  const [mapStatusState, setMapStatusState] = useState<MapStatusState>({
    lat: -6.74,
    lng: 108.55,
    zoom: 12,
    hasPointer: false,
  });
  const [mapBottomChromeHeight, setMapBottomChromeHeight] = useState(0);
  const [externalLayerConfigs, setExternalLayerConfigs] = useState<
    ExternalMapLayerConfig[]
  >([]);
  const [resolvedExternalLayers, setResolvedExternalLayers] = useState<
    ResolvedExternalMapLayer[]
  >([]);
  const [externalLayersDialogOpen, setExternalLayersDialogOpen] =
    useState(false);
  const [offlinePackDialogOpen, setOfflinePackDialogOpen] = useState(false);
  const [offlineTilePrefs, setOfflineTilePrefs] = useState<OfflineTilePrefs>({
    offlineMode: false,
    packs: [],
  });
  const [relationTraceAnchorEndpoints, setRelationTraceAnchorEndpoints] =
    useState<RelationTraceEndpoint[]>([]);
  const [relationTraceTargets, setRelationTraceTargets] = useState<
    RelationTraceTarget[]
  >([]);

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
      setTableLayerOpacity({});
      setLayerLayout({ tableOrder: [], groups: [], tableGroupId: {} });
      setLayerStyles({});
      setFilterSyncEnabled(true);
      setTotalFeatureCountByTableId(new Map());
      setHasMapBookmark(false);
      setMapFullscreen(false);
      setLeafletMap(null);
      return;
    }
    setTableLayerVisibility(loadMapLayerVisibility(selectedProjectId));
    setTableLayerOpacity(loadMapLayerOpacity(selectedProjectId));
    setLayerLayout(loadSpatialLayerLayout(selectedProjectId));
    setLayerStyles(loadSpatialLayerStyles(selectedProjectId));
    setFilterSyncEnabled(loadSpatialFilterSyncEnabled(selectedProjectId));
    setHasMapBookmark(loadMapExtentBookmark(selectedProjectId) != null);
    setDesktopPrefs(loadSpatialDesktopPrefs(selectedProjectId));
    setExternalLayerConfigs(loadExternalMapLayers(selectedProjectId));
    setOfflineTilePrefs(loadOfflineTilePrefs(selectedProjectId));
    setMapFullscreen(false);
  }, [selectedProjectId]);

  const externalLayersKey = useMemo(
    () => externalLayersResolveKey(externalLayerConfigs),
    [externalLayerConfigs]
  );

  useEffect(() => {
    if (!selectedProjectId) {
      setResolvedExternalLayers([]);
      return;
    }
    let cancelled = false;
    void resolveExternalMapLayers(externalLayerConfigs).then((resolved) => {
      if (!cancelled) setResolvedExternalLayers(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, externalLayersKey, externalLayerConfigs]);

  const persistExternalLayers = useCallback(
    (layers: ExternalMapLayerConfig[]) => {
      setExternalLayerConfigs(layers);
      if (selectedProjectId) saveExternalMapLayers(selectedProjectId, layers);
    },
    [selectedProjectId]
  );

  const handleExternalLayerVisibilityChange = useCallback(
    (id: string, visible: boolean) => {
      persistExternalLayers(
        externalLayerConfigs.map((l) =>
          l.id === id ? { ...l, visible } : l
        )
      );
    },
    [externalLayerConfigs, persistExternalLayers]
  );

  const handleExternalLayerOpacityChange = useCallback(
    (id: string, opacity: number) => {
      persistExternalLayers(
        externalLayerConfigs.map((l) =>
          l.id === id ? { ...l, opacity } : l
        )
      );
    },
    [externalLayerConfigs, persistExternalLayers]
  );

  const projectVirtualTables = useMemo(
    () =>
      selectedProjectId
        ? allAccessibleVtables.filter(
            (vt) => vt.project_id === selectedProjectId
          )
        : [],
    [allAccessibleVtables, selectedProjectId]
  );

  const openEntity360ProfileDialog = useCallback(() => {
    setEntity360ProfileOpen(true);
  }, []);

  const handleExternalLayerRemove = useCallback(
    async (id: string) => {
      const layer = externalLayerConfigs.find((l) => l.id === id);
      if (layer?.geojsonStoreKey) {
        await deleteGeoJsonBlob(layer.geojsonStoreKey);
      }
      persistExternalLayers(externalLayerConfigs.filter((l) => l.id !== id));
    },
    [externalLayerConfigs, persistExternalLayers]
  );

  const handleExternalLayerZoom = useCallback(
    (id: string) => {
      const resolved = resolvedExternalLayers.find((l) => l.id === id);
      if (!resolved) return;
      const bounds = externalLayerBounds(resolved);
      if (bounds) {
        mapHandleRef.current?.fitBounds(bounds);
      }
    },
    [resolvedExternalLayers]
  );

  useEffect(() => {
    const ui = loadMapUiPreferences();
    setBasemapId(ui.basemapId);
    setShowFeatureLabels(ui.showFeatureLabels);
    setCoordinateDisplay(ui.coordinateDisplay);
  }, []);

  useEffect(() => {
    if (!isMapTabActive) {
      setAnalysisOpen(false);
      setAnalysisHighlightIds([]);
    }
  }, [isMapTabActive]);

  useEffect(() => {
    if (!isMapTabActive) {
      setToolMode("navigate");
      setIdentifyHits([]);
      setIdentifyPoint(null);
      setMeasureFinished(null);
    }
  }, [isMapTabActive]);

  useEffect(() => {
    if (!isMapTabActive) {
      setMapImportPreviewLayers([]);
      setImportPreviewVisible(true);
      setSpatialImportWizardOpen(false);
    }
  }, [isMapTabActive]);

  useEffect(() => {
    if (!isMapTabActive) {
      setMapFullscreen(false);
    }
  }, [isMapTabActive]);

  const updateDesktopPrefs = useCallback(
    (patch: Partial<SpatialDesktopPrefs>) => {
      setDesktopPrefs((prev) => {
        const next = { ...prev, ...patch };
        if (selectedProjectId) {
          saveSpatialDesktopPrefs(selectedProjectId, next);
        }
        return next;
      });
    },
    [selectedProjectId]
  );

  const handleShowMinimapChange = useCallback(
    (show: boolean) => updateDesktopPrefs({ showMinimap: show }),
    [updateDesktopPrefs]
  );

  const handleShowAttributeDockChange = useCallback(
    (show: boolean) => updateDesktopPrefs({ showAttributeDock: show }),
    [updateDesktopPrefs]
  );

  const handleShowRelationTraceChange = useCallback(
    (show: boolean) => updateDesktopPrefs({ showRelationTrace: show }),
    [updateDesktopPrefs]
  );

  const handleSwipeCompareChange = useCallback(
    (enabled: boolean) => {
      setDesktopPrefs((prev) => {
        let compareBasemapId = prev.compareBasemapId;
        if (enabled && compareBasemapId === basemapId) {
          compareBasemapId = basemapId === "osm" ? "topo" : "osm";
        }
        const next = {
          ...prev,
          swipeCompareEnabled: enabled,
          compareBasemapId,
        };
        if (selectedProjectId) saveSpatialDesktopPrefs(selectedProjectId, next);
        return next;
      });
    },
    [basemapId, selectedProjectId]
  );

  const handleCompareBasemapChange = useCallback(
    (id: WorkspaceBasemapId) => updateDesktopPrefs({ compareBasemapId: id }),
    [updateDesktopPrefs]
  );

  const handleSwipePercentChange = useCallback(
    (percent: number) => updateDesktopPrefs({ swipePercent: percent }),
    [updateDesktopPrefs]
  );

  const handleMapReady = useCallback((map: LeafletMap | null) => {
    setLeafletMap(map);
  }, []);

  const handleClearMapInteraction = useCallback(() => {
    setToolMode("navigate");
    setIdentifyHits([]);
    setIdentifyPoint(null);
    setMeasureFinished(null);
    setClearMeasureSignal((n) => n + 1);
    setAnalysisHighlightIds([]);
    setGoToOpen(false);
    setAnalysisOpen(false);
    if (panel?.kind === "row-detail" || panel?.kind === "entity-360") closePanel();
    spatialSync.clearRowSelection();
  }, [panel?.kind, closePanel, spatialSync]);

  useEffect(() => {
    if (!isMapTabActive || !selectedProjectId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [role='dialog']"))
      ) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        handleClearMapInteraction();
        if (mapFullscreen) setMapFullscreen(false);
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        mapHandleRef.current?.zoomIn();
        return;
      }

      if (event.key === "-") {
        event.preventDefault();
        mapHandleRef.current?.zoomOut();
        return;
      }

      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        mapHandleRef.current?.fitAllFootprints();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isMapTabActive,
    selectedProjectId,
    handleClearMapInteraction,
    mapFullscreen,
  ]);

  useEffect(() => {
    setMapTabEpoch((n) => n + 1);
  }, [selectedProjectId]);

  useEffect(() => {
    if (isMapTabActive) {
      setMapTabEpoch((n) => n + 1);
    }
  }, [isMapTabActive]);

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

  useEffect(() => {
    if (vtablesWithGeometry.length === 0) return;
    const allIds = vtablesWithGeometry.map((vt) => vt.id);
    setLayerLayout((prev) => {
      const merged = mergeTableOrder(
        prev.tableOrder.length > 0 ? prev.tableOrder : allIds,
        allIds
      );
      if (merged.join(",") === prev.tableOrder.join(",")) return prev;
      const next = { ...prev, tableOrder: merged };
      if (selectedProjectId) saveSpatialLayerLayout(selectedProjectId, next);
      return next;
    });
  }, [vtablesWithGeometrySig, selectedProjectId, vtablesWithGeometry]);

  const filterActiveByTable = useMemo(() => {
    const map: Record<string, boolean> = {};
    if (!filterSyncEnabled) return map;
    for (const vt of vtablesWithGeometry) {
      const filters = viewSessionFilters(vt.id);
      if (filters.length > 0) map[vt.id] = true;
    }
    return map;
  }, [filterSyncEnabled, vtablesWithGeometry, mapTabEpoch]);

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
        totalFeatureCountByTableId,
        tableLayerVisibility,
        tableLayerOpacity,
        layerStyles,
        layerLayout.tableOrder,
        layerLayout.tableGroupId,
        filterActiveByTable
      ),
    [
      vtablesWithGeometry,
      featureCountByTableId,
      totalFeatureCountByTableId,
      tableLayerVisibility,
      tableLayerOpacity,
      layerStyles,
      layerLayout.tableOrder,
      layerLayout.tableGroupId,
      filterActiveByTable,
    ]
  );

  const allMapFootprints = useMemo(
    () => [...mapImportPreviewLayers, ...vtableGeometryLayers],
    [mapImportPreviewLayers, vtableGeometryLayers]
  );

  const importOverlapFootprintIds = useMemo(() => {
    if (mapImportPreviewLayers.length === 0 || !importPreviewVisible) {
      return new Set<string>();
    }
    return computeImportOverlapFootprintIds(
      mapImportPreviewLayers,
      vtableGeometryLayers
    );
  }, [
    mapImportPreviewLayers,
    vtableGeometryLayers,
    importPreviewVisible,
  ]);

  const analysisHighlightFootprintIds = useMemo(
    () => new Set(analysisHighlightIds),
    [analysisHighlightIds]
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

  const handleTableLayerOpacityChange = useCallback(
    (tableId: string, opacity: number) => {
      setTableLayerOpacity((prev) => {
        const next = { ...prev, [tableId]: opacity };
        if (selectedProjectId) {
          saveMapLayerOpacity(selectedProjectId, next);
        }
        return next;
      });
    },
    [selectedProjectId]
  );

  const handleTableLayerStyleChange = useCallback(
    (tableId: string, style: SpatialLayerSymbolStyle) => {
      setLayerStyles((prev) => {
        const next = { ...prev, [tableId]: style };
        if (selectedProjectId) saveSpatialLayerStyles(selectedProjectId, next);
        return next;
      });
    },
    [selectedProjectId]
  );

  const handleMoveLayer = useCallback(
    (tableId: string, direction: "up" | "down") => {
      setLayerLayout((prev) => {
        const nextOrder = moveTableInOrder(prev.tableOrder, tableId, direction);
        const next = { ...prev, tableOrder: nextOrder };
        if (selectedProjectId) saveSpatialLayerLayout(selectedProjectId, next);
        return next;
      });
    },
    [selectedProjectId]
  );

  const handleTableGroupChange = useCallback(
    (tableId: string, groupId: string | null) => {
      setLayerLayout((prev) => {
        const next = {
          ...prev,
          tableGroupId: { ...prev.tableGroupId, [tableId]: groupId },
        };
        if (selectedProjectId) saveSpatialLayerLayout(selectedProjectId, next);
        return next;
      });
    },
    [selectedProjectId]
  );

  const handleAddGroup = useCallback(() => {
    const name = window.prompt("Nama grup lapisan:", "Grup baru");
    if (!name?.trim()) return;
    setLayerLayout((prev) => {
      const group = {
        id: createSpatialLayerGroupId(),
        name: name.trim(),
      };
      const next = { ...prev, groups: [...prev.groups, group] };
      if (selectedProjectId) saveSpatialLayerLayout(selectedProjectId, next);
      return next;
    });
  }, [selectedProjectId]);

  const handleToggleGroupCollapsed = useCallback(
    (groupId: string) => {
      setLayerLayout((prev) => {
        const next = {
          ...prev,
          groups: prev.groups.map((g) =>
            g.id === groupId ? { ...g, collapsed: !g.collapsed } : g
          ),
        };
        if (selectedProjectId) saveSpatialLayerLayout(selectedProjectId, next);
        return next;
      });
    },
    [selectedProjectId]
  );

  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      const group = layerLayout.groups.find((g) => g.id === groupId);
      if (!group) return;
      if (
        !window.confirm(
          `Hapus grup "${group.name}"?\n\nLapisan di grup ini tidak dihapus — hanya dikelompokkan ulang ke tanpa grup.`
        )
      ) {
        return;
      }
      setLayerLayout((prev) => {
        const next = {
          ...prev,
          groups: prev.groups.filter((g) => g.id !== groupId),
          tableGroupId: Object.fromEntries(
            Object.entries(prev.tableGroupId).map(([tableId, gid]) => [
              tableId,
              gid === groupId ? null : gid,
            ])
          ),
        };
        if (selectedProjectId) saveSpatialLayerLayout(selectedProjectId, next);
        return next;
      });
    },
    [layerLayout.groups, selectedProjectId]
  );

  const handleFilterSyncChange = useCallback(
    (enabled: boolean) => {
      setFilterSyncEnabled(enabled);
      if (selectedProjectId) {
        saveSpatialFilterSyncEnabled(selectedProjectId, enabled);
      }
      setMapTabEpoch((n) => n + 1);
    },
    [selectedProjectId]
  );

  const handleBasemapChange = useCallback(
    (id: WorkspaceBasemapId) => {
      setBasemapId(id);
      saveMapUiPreferences({
        basemapId: id,
        showFeatureLabels,
        coordinateDisplay,
      });
    },
    [showFeatureLabels, coordinateDisplay]
  );

  const handleShowFeatureLabelsChange = useCallback(
    (show: boolean) => {
      setShowFeatureLabels(show);
      saveMapUiPreferences({
        basemapId,
        showFeatureLabels: show,
        coordinateDisplay,
      });
    },
    [basemapId, coordinateDisplay]
  );

  const handleCoordinateDisplayToggle = useCallback(() => {
    setCoordinateDisplay((prev) => {
      const next: CoordPref = prev === "latlng" ? "utm" : "latlng";
      saveMapUiPreferences({
        basemapId,
        showFeatureLabels,
        coordinateDisplay: next,
      });
      return next;
    });
  }, [basemapId, showFeatureLabels]);

  const handleFitAllLayers = useCallback(() => {
    mapHandleRef.current?.fitAllFootprints();
  }, []);

  const handleZoomToLayer = useCallback(
    (tableId: string) => {
      const fps = filterFootprintsByTableId(vtableGeometryLayers, tableId);
      mapHandleRef.current?.fitFootprints(fps);
    },
    [vtableGeometryLayers]
  );

  const handleSaveMapBookmark = useCallback(() => {
    if (!selectedProjectId) return;
    const view = mapHandleRef.current?.getView();
    if (!view) return;
    saveMapExtentBookmark(selectedProjectId, view);
    setHasMapBookmark(true);
  }, [selectedProjectId]);

  const handleRestoreMapBookmark = useCallback(() => {
    if (!selectedProjectId) return;
    const bookmark = loadMapExtentBookmark(selectedProjectId);
    if (!bookmark) return;
    mapHandleRef.current?.setView(bookmark);
  }, [selectedProjectId]);

  const handleToolModeChange = useCallback((mode: WorkspaceMapToolMode) => {
    setToolMode(mode);
    if (mode !== "identify") {
      setIdentifyHits([]);
      setIdentifyPoint(null);
    }
    if (mode === "navigate") {
      setMeasureFinished(null);
      setClearMeasureSignal((n) => n + 1);
    }
  }, []);

  const handleIdentifyResults = useCallback(
    (hits: MapIdentifyHit[], lat: number, lng: number) => {
      setIdentifyHits(hits);
      setIdentifyPoint({ lat, lng });
    },
    []
  );

  const handleIdentifyHitSelect = useCallback(
    (hit: MapIdentifyHit) => {
      if (hit.virtualTableId && hit.virtualRowId) {
        const fp = visibleMapLayers.find((l) => l.id === hit.footprintId);
        openEntity360({
          tableId: hit.virtualTableId,
          rowId: hit.virtualRowId,
          pathSegments:
            fp?.chatPathSegments ??
            buildChatRowPathSegments({
              projectName: selectedProject?.name ?? null,
              tableDisplayName:
                typeof hit.properties.Tabel === "string"
                  ? hit.properties.Tabel
                  : hit.label,
              rowLabel:
                typeof hit.properties._popup_row_title === "string"
                  ? hit.properties._popup_row_title
                  : hit.label,
            }),
          rowPayload: fp?.rowPayload,
          relationLabels: fp?.relationLabels,
        });
      }
    },
    [visibleMapLayers, openEntity360, selectedProject?.name]
  );

  const handleGoTo = useCallback((lat: number, lng: number) => {
    mapHandleRef.current?.setView({ lat, lng, zoom: 16 });
  }, []);

  const handleAnalysisHighlight = useCallback((ids: string[]) => {
    setAnalysisHighlightIds(ids);
  }, []);

  const handleZoomToFootprintIds = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      const fps = allMapFootprints.filter((fp) => idSet.has(fp.id));
      if (fps.length > 0) {
        mapHandleRef.current?.fitFootprints(fps);
      }
    },
    [allMapFootprints]
  );

  const handleGetMapCenter = useCallback(() => {
    return mapHandleRef.current?.getView() ?? null;
  }, []);

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
      const totalCounts = new Map<string, number>();
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
        const viewFilters = filterSyncEnabled ? viewSessionFilters(vt.id) : [];

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

        const resolveFilterLabel = (column: string, val: unknown) => {
          const col = tableCols.find((c) => c.slug === column);
          if (!col) return String(val ?? "");
          if (col.data_type === "relation" && val != null && val !== "") {
            return relationLabels[String(val)] ?? String(val);
          }
          if (col.data_type === "user" && val != null && val !== "") {
            return memberNameByUserId.get(String(val)) ?? String(val);
          }
          return String(val ?? "");
        };

        for (const row of result.rows) {
          const payload = (row as Record<string, unknown>).payload as Record<
            string,
            unknown
          > | null;
          if (!payload) continue;
          const passesFilter =
            viewFilters.length === 0 ||
            rowMatchesVirtualViewFilters(
              row as VirtualDataRow,
              viewFilters,
              resolveFilterLabel
            );
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
            totalCounts.set(vt.id, (totalCounts.get(vt.id) ?? 0) + 1);
            if (!passesFilter) continue;

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
      if (!cancelled) {
        setVtableGeometryLayers(layers);
        setTotalFeatureCountByTableId(totalCounts);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    mapTabEpoch,
    filterSyncEnabled,
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
    panel?.kind === "row-detail" || panel?.kind === "entity-360"
      ? panel.rowId
      : null;

  const selectedSpatialRowIds = spatialSync.getAllSelectedRowIds();

  const highlightVirtualRowIds = useMemo(() => {
    if (!spatialSync.selectionSyncEnabled || selectedSpatialRowIds.length === 0) {
      return undefined;
    }
    return new Set(selectedSpatialRowIds);
  }, [spatialSync.selectionSyncEnabled, selectedSpatialRowIds]);

  const layerNameByTableId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const vt of vtablesWithGeometry) {
      map[vt.id] = vt.display_name;
    }
    return map;
  }, [vtablesWithGeometry]);

  const attributeRows = useMemo(
    () => buildMapAttributeRows(visibleMapLayers, layerNameByTableId),
    [visibleMapLayers, layerNameByTableId]
  );

  const highlightAttributeFootprintId = useMemo(() => {
    if (panel?.kind !== "row-detail" && panel?.kind !== "entity-360") return null;
    const fp = visibleMapLayers.find(
      (layer) =>
        layer.virtualRowId === panel.rowId &&
        layer.virtualTableId === panel.tableId
    );
    return fp?.id ?? null;
  }, [panel, visibleMapLayers]);

  const entity360Panel =
    panel?.kind === "entity-360" ? panel : null;

  useEffect(() => {
    if (!desktopPrefs.showRelationTrace || !entity360Panel) {
      setRelationTraceAnchorEndpoints([]);
      setRelationTraceTargets([]);
      return;
    }

    let cancelled = false;
    void fetchRelationTraceTargetsAction(
      entity360Panel.tableId,
      entity360Panel.rowId,
      entity360Panel.rowPayload
    ).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setRelationTraceAnchorEndpoints([]);
        setRelationTraceTargets([]);
        return;
      }
      setRelationTraceAnchorEndpoints(result.anchorEndpoints);
      setRelationTraceTargets(result.targets);
    });

    return () => {
      cancelled = true;
    };
  }, [
    desktopPrefs.showRelationTrace,
    entity360Panel?.tableId,
    entity360Panel?.rowId,
    entity360Panel?.rowPayload,
  ]);

  const relationTraceSegments = useMemo(
    () =>
      entity360Panel && desktopPrefs.showRelationTrace
        ? buildRelationTraceSegments({
            anchorTableId: entity360Panel.tableId,
            anchorRowId: entity360Panel.rowId,
            anchorEndpoints: relationTraceAnchorEndpoints,
            targets: relationTraceTargets,
            footprints: allMapFootprints,
          })
        : [],
    [
      entity360Panel,
      desktopPrefs.showRelationTrace,
      relationTraceAnchorEndpoints,
      relationTraceTargets,
      allMapFootprints,
    ]
  );

  const prefillCompareFootprintIds = useMemo((): [string, string] | null => {
    if (!spatialSync.selectionSyncEnabled) return null;
    const rowIds = spatialSync.getAllSelectedRowIds();
    if (rowIds.length !== 2) return null;
    const fps = vtableGeometryLayers.filter(
      (fp) => fp.virtualRowId && rowIds.includes(fp.virtualRowId)
    );
    if (fps.length < 2) return null;
    return [fps[0]!.id, fps[1]!.id];
  }, [spatialSync, vtableGeometryLayers]);

  const handleAttributeRowClick = useCallback(
    (row: MapAttributeRow) => {
      if (row.virtualTableId && row.virtualRowId) {
        openEntity360({
          tableId: row.virtualTableId,
          rowId: row.virtualRowId,
          pathSegments:
            row.chatPathSegments ??
            buildChatRowPathSegments({
              projectName: selectedProject?.name ?? null,
              tableDisplayName: row.layerLabel,
              rowLabel: row.label,
            }),
          rowPayload: row.rowPayload,
          relationLabels: row.relationLabels,
        });
      }
      const fp = visibleMapLayers.find((layer) => layer.id === row.footprintId);
      if (fp) {
        mapHandleRef.current?.fitFootprints([fp]);
      }
    },
    [openEntity360, selectedProject?.name, visibleMapLayers]
  );

  useEffect(() => {
    const el = mapBottomChromeRef.current;
    if (!desktopPrefs.showAttributeDock || !el) {
      setMapBottomChromeHeight(0);
      return;
    }
    const syncHeight = () => setMapBottomChromeHeight(el.offsetHeight);
    syncHeight();
    const ro = new ResizeObserver(syncHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, [desktopPrefs.showAttributeDock, attributeDockExpanded]);

  const minimapBottomStyle =
    mapBottomChromeHeight > 0 ? { bottom: mapBottomChromeHeight + 8 } : undefined;

  const legendBottomStyle: CSSProperties | undefined = useMemo(() => {
    if (desktopPrefs.showAttributeDock && mapBottomChromeHeight > 0) {
      return { bottom: mapBottomChromeHeight + 8 };
    }
    return { bottom: 44 };
  }, [desktopPrefs.showAttributeDock, mapBottomChromeHeight]);

  const mapExportChromeStyle = useMemo(
    () =>
      ({
        "--map-bottom-chrome-height":
          mapBottomChromeHeight > 0
            ? `${mapBottomChromeHeight}px`
            : undefined,
      }) as CSSProperties,
    [mapBottomChromeHeight]
  );

  useEffect(() => {
    if (!isMapTabActive || !spatialSync.focusRequest) return;
    const { tableId, rowIds, zoomToSelection } = spatialSync.focusRequest;
    setTableLayerVisibility((prev) => {
      const next = { ...prev, [tableId]: true };
      if (selectedProjectId) saveMapLayerVisibility(selectedProjectId, next);
      return next;
    });
    if (rowIds?.length && zoomToSelection) {
      const idSet = new Set(rowIds);
      const fps = vtableGeometryLayers.filter(
        (fp) => fp.virtualRowId && idSet.has(fp.virtualRowId)
      );
      if (fps.length > 0) {
        mapHandleRef.current?.fitFootprints(fps);
      } else {
        const layerFps = filterFootprintsByTableId(vtableGeometryLayers, tableId);
        mapHandleRef.current?.fitFootprints(layerFps);
      }
    } else {
      const layerFps = filterFootprintsByTableId(vtableGeometryLayers, tableId);
      mapHandleRef.current?.fitFootprints(layerFps);
    }
    spatialSync.consumeFocusRequest();
  }, [
    isMapTabActive,
    spatialSync.focusEpoch,
    spatialSync.focusRequest,
    spatialSync.consumeFocusRequest,
    vtableGeometryLayers,
    selectedProjectId,
  ]);

  const handleVirtualRowSelect = useCallback(
    (select: VirtualRowMapSelect) => {
      if (spatialSync.selectionSyncEnabled) {
        spatialSync.setRowSelection(select.tableId, [select.rowId]);
      }
      openEntity360({
        tableId: select.tableId,
        rowId: select.rowId,
        pathSegments: select.pathSegments,
        rowPayload: select.rowPayload,
        relationLabels: select.relationLabels,
      });
    },
    [openEntity360, spatialSync]
  );

  const handleCopyMapContext = useCallback(async () => {
    const view = mapHandleRef.current?.getView();
    const text = formatSpatialMapContextText({
      projectName: selectedProject?.name ?? null,
      view,
      activeLayerCount: spatialLayerRows.filter((r) => r.visible).length,
      featureCount: visibleMapLayers.filter(
        (fp) => fp.layerKind === "virtual_table"
      ).length,
      rowLabel:
        panel?.kind === "row-detail" || panel?.kind === "entity-360"
          ? (panel.pathSegments[panel.pathSegments.length - 1] ?? null)
          : null,
    });
    try {
      await navigator.clipboard.writeText(text);
      spatialSync.setPendingChatContext(text);
    } catch {
      spatialSync.setPendingChatContext(text);
    }
  }, [
    selectedProject?.name,
    spatialLayerRows,
    visibleMapLayers,
    panel,
    spatialSync,
  ]);

  const handleMapBackgroundClick = useCallback(() => {
    if (panel?.kind === "row-detail" || panel?.kind === "entity-360") closePanel();
    if (spatialSync.selectionSyncEnabled) {
      spatialSync.clearRowSelection();
    }
  }, [panel?.kind, closePanel, spatialSync]);

  return (
    <div className="flex h-0 min-h-0 flex-1 basis-0 flex-col">
      {!selectedProjectId ? (
        <p className="p-3 text-sm text-muted-foreground">
          {pilihRuangKerjaUntuk("untuk melihat peta.")}
        </p>
      ) : (
        <div className="flex h-0 min-h-0 min-w-0 flex-1 basis-0 flex-row overflow-hidden">
          {!isBelowMd && !mapFullscreen ? (
            <WorkspaceCollapsibleRailShell isOpen={rail.isOpen}>
              <WorkspaceSpatialLayerRail
                layerRows={spatialLayerRows}
                groups={layerLayout.groups}
                importPreviewCount={mapImportPreviewLayers.length}
                importPreviewVisible={importPreviewVisible}
                onImportPreviewVisibilityChange={setImportPreviewVisible}
                onTableLayerVisibilityChange={handleTableLayerVisibilityChange}
                onTableLayerOpacityChange={handleTableLayerOpacityChange}
                onTableLayerStyleChange={handleTableLayerStyleChange}
                onTableGroupChange={handleTableGroupChange}
                onMoveLayer={handleMoveLayer}
                onZoomToLayer={handleZoomToLayer}
                onAddGroup={handleAddGroup}
                onToggleGroupCollapsed={handleToggleGroupCollapsed}
                onDeleteGroup={handleDeleteGroup}
                externalLayers={externalLayerConfigs}
                onExternalLayerVisibilityChange={
                  handleExternalLayerVisibilityChange
                }
                onExternalLayerOpacityChange={handleExternalLayerOpacityChange}
                onExternalLayerZoom={handleExternalLayerZoom}
                onExternalLayerRemove={(id) =>
                  void handleExternalLayerRemove(id)
                }
                onManageExternalLayers={() =>
                  setExternalLayersDialogOpen(true)
                }
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

          {!mapFullscreen ? (
          <WorkspaceSpatialToolbar
            layerRows={spatialLayerRows}
            groups={layerLayout.groups}
            importPreviewCount={mapImportPreviewLayers.length}
            importPreviewVisible={importPreviewVisible}
            onImportPreviewVisibilityChange={setImportPreviewVisible}
            onTableLayerVisibilityChange={handleTableLayerVisibilityChange}
            onTableLayerOpacityChange={handleTableLayerOpacityChange}
            onTableLayerStyleChange={handleTableLayerStyleChange}
            onTableGroupChange={handleTableGroupChange}
            onMoveLayer={handleMoveLayer}
            onZoomToLayer={handleZoomToLayer}
            onOpenImportWizard={() => setSpatialImportWizardOpen(true)}
            basemapId={basemapId}
            onBasemapChange={handleBasemapChange}
            showFeatureLabels={showFeatureLabels}
            onShowFeatureLabelsChange={handleShowFeatureLabelsChange}
            onFitAllLayers={handleFitAllLayers}
            onSaveMapBookmark={handleSaveMapBookmark}
            onRestoreMapBookmark={handleRestoreMapBookmark}
            hasMapBookmark={hasMapBookmark}
            toolMode={toolMode}
            onToolModeChange={handleToolModeChange}
            onOpenGoToDialog={() => setGoToOpen(true)}
            importOverlapCount={importOverlapFootprintIds.size}
            filterSyncEnabled={filterSyncEnabled}
            onFilterSyncChange={handleFilterSyncChange}
            selectionSyncEnabled={spatialSync.selectionSyncEnabled}
            onSelectionSyncChange={spatialSync.setSelectionSyncEnabled}
            onCopyMapContext={handleCopyMapContext}
            onOpenAnalysisDialog={() => setAnalysisOpen(true)}
            onOpenEntity360ProfileDialog={
              selectedProjectId ? openEntity360ProfileDialog : undefined
            }
            mapFullscreen={mapFullscreen}
            onMapFullscreenToggle={() => setMapFullscreen((v) => !v)}
            showMinimap={desktopPrefs.showMinimap}
            onShowMinimapChange={handleShowMinimapChange}
            showAttributeDock={desktopPrefs.showAttributeDock}
            onShowAttributeDockChange={handleShowAttributeDockChange}
            showRelationTrace={desktopPrefs.showRelationTrace}
            onShowRelationTraceChange={handleShowRelationTraceChange}
            swipeCompareEnabled={desktopPrefs.swipeCompareEnabled}
            onSwipeCompareChange={handleSwipeCompareChange}
            onOpenExternalLayersDialog={() =>
              setExternalLayersDialogOpen(true)
            }
            onOpenOfflinePackDialog={() => setOfflinePackDialogOpen(true)}
            offlineModeActive={offlineTilePrefs.offlineMode}
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
          ) : null}

          {!mapFullscreen && !hasAnyGeometry ? (
            <p className="shrink-0 px-3 py-2 text-sm text-muted-foreground">
              Belum ada geometri di peta untuk {ruangKerjaIni}. Gunakan{" "}
              <span className="font-medium text-foreground">Impor</span> untuk
              menambah data ke tabel virtual.
            </p>
          ) : null}

          {!mapFullscreen && allLayersHidden ? (
            <p
              className="mx-3 mb-2 shrink-0 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground"
              role="status"
            >
              Semua lapisan dimatikan. Aktifkan minimal satu lapisan lewat{" "}
              <span className="font-semibold">{layerPickerHint}</span>.
            </p>
          ) : null}

          <div
            data-map-bottom-chrome={
              desktopPrefs.showAttributeDock && mapBottomChromeHeight > 0
                ? "on"
                : undefined
            }
            style={mapExportChromeStyle}
            className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          >
            <WorkspaceMap
              ref={mapHandleRef}
              footprints={visibleMapLayers}
              allFootprints={allMapFootprints}
              highlightBerkasId={null}
              highlightVirtualRowId={highlightVirtualRowId}
              highlightVirtualRowIds={highlightVirtualRowIds}
              onVirtualRowSelect={handleVirtualRowSelect}
              onMapBackgroundClick={handleMapBackgroundClick}
              basemapId={basemapId}
              showFeatureLabels={showFeatureLabels}
              layerOpacityByTableId={tableLayerOpacity}
              layerStyleByTableId={layerStyles}
              enableGisChrome
              toolMode={toolMode}
              importOverlapFootprintIds={importOverlapFootprintIds}
              analysisHighlightFootprintIds={analysisHighlightFootprintIds}
              identifyFootprints={visibleMapLayers}
              onIdentifyResults={handleIdentifyResults}
              onMeasureDraftChange={setMeasureDraft}
              onMeasureFinished={setMeasureFinished}
              finishMeasureSignal={finishMeasureSignal}
              clearMeasureSignal={clearMeasureSignal}
              coordinateDisplay={coordinateDisplay}
              onCoordinateDisplayToggle={handleCoordinateDisplayToggle}
              onMapReady={handleMapReady}
              swipeCompareEnabled={desktopPrefs.swipeCompareEnabled}
              compareBasemapId={
                desktopPrefs.swipeCompareEnabled
                  ? desktopPrefs.compareBasemapId
                  : null
              }
              swipePercent={desktopPrefs.swipePercent}
              externalLayers={resolvedExternalLayers}
              offlineBasemapMode={offlineTilePrefs.offlineMode}
              externalStatusBar={desktopPrefs.showAttributeDock}
              onStatusStateChange={setMapStatusState}
              relationTraceSegments={relationTraceSegments}
              showRelationTrace={desktopPrefs.showRelationTrace}
            />
            {mapFullscreen ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="pointer-events-auto absolute right-2 top-2 z-[470] gap-1.5 shadow-md"
                onClick={() => setMapFullscreen(false)}
                data-testid="spatial-fullscreen-exit"
              >
                <Minimize2 className="size-3.5 shrink-0" aria-hidden />
                Keluar layar penuh
              </Button>
            ) : null}
            <WorkspaceMapBasemapSwipeDivider
              enabled={desktopPrefs.swipeCompareEnabled}
              swipePercent={desktopPrefs.swipePercent}
            />
            <WorkspaceMapBasemapSwipeControl
              enabled={desktopPrefs.swipeCompareEnabled}
              primaryBasemapId={basemapId}
              compareBasemapId={desktopPrefs.compareBasemapId}
              swipePercent={desktopPrefs.swipePercent}
              onCompareBasemapChange={handleCompareBasemapChange}
              onSwipePercentChange={handleSwipePercentChange}
              onClose={() => handleSwipeCompareChange(false)}
              map={leafletMap}
            />
            {desktopPrefs.showMinimap ? (
              <WorkspaceMapMinimap
                map={leafletMap}
                basemapId={basemapId}
                style={minimapBottomStyle}
              />
            ) : null}
            {desktopPrefs.showAttributeDock ? (
              <div
                ref={mapBottomChromeRef}
                className="pointer-events-none absolute inset-x-0 bottom-0 z-[440] flex flex-col"
              >
                <WorkspaceMapStatusBar
                  docked
                  state={mapStatusState}
                  coordinateDisplay={coordinateDisplay}
                  onCoordinateDisplayToggle={handleCoordinateDisplayToggle}
                />
                <WorkspaceSpatialAttributeDock
                  embedded
                  rows={attributeRows}
                  expanded={attributeDockExpanded}
                  onExpandedChange={setAttributeDockExpanded}
                  highlightFootprintId={highlightAttributeFootprintId}
                  onRowClick={handleAttributeRowClick}
                  className="pointer-events-auto"
                />
              </div>
            ) : null}
            <WorkspaceMapToolHud
              toolMode={toolMode}
              measureDraft={measureDraft}
              measureFinished={measureFinished}
              identifyHits={identifyHits}
              identifyPoint={identifyPoint}
              onFinishMeasure={() => setFinishMeasureSignal((n) => n + 1)}
              onClearMeasure={() => {
                setMeasureFinished(null);
                setClearMeasureSignal((n) => n + 1);
              }}
              onClearIdentify={() => {
                setIdentifyHits([]);
                setIdentifyPoint(null);
              }}
              onIdentifyHitSelect={handleIdentifyHitSelect}
              onToolModeChange={handleToolModeChange}
            />
            {hasAnyGeometry && visibleMapLayers.length > 0 ? (
              <WorkspaceMapLegend
                layerRows={spatialLayerRows}
                importPreviewVisible={importPreviewVisible}
                importPreviewCount={mapImportPreviewLayers.length}
                importOverlapCount={importOverlapFootprintIds.size}
                className={cn(
                  "bottom-auto left-2",
                  isBelowMd && "max-w-[40vw]"
                )}
                style={legendBottomStyle}
              />
            ) : null}
          </div>

          <WorkspaceSpatialGoToDialog
            open={goToOpen}
            onOpenChange={setGoToOpen}
            onGoTo={handleGoTo}
          />

          <WorkspaceSpatialAnalysisDialog
            open={analysisOpen}
            onOpenChange={setAnalysisOpen}
            layerRows={spatialLayerRows}
            footprints={vtableGeometryLayers}
            onHighlightFootprints={handleAnalysisHighlight}
            onZoomToFootprints={handleZoomToFootprintIds}
            onGetMapCenter={handleGetMapCenter}
            prefillCompareFootprintIds={prefillCompareFootprintIds}
          />

          {selectedProjectId ? (
            <WorkspaceEntity360ProfileDialog
              open={entity360ProfileOpen}
              onOpenChange={setEntity360ProfileOpen}
              projectId={selectedProjectId}
              projectTables={projectVirtualTables}
              virtualColumns={virtualColumns}
              initialProfile={entity360Profile}
            />
          ) : null}

          <WorkspaceSpatialExternalLayersDialog
            open={externalLayersDialogOpen}
            onOpenChange={setExternalLayersDialogOpen}
            layers={externalLayerConfigs}
            onLayersChange={persistExternalLayers}
          />

          {selectedProjectId ? (
            <WorkspaceSpatialOfflinePackDialog
              open={offlinePackDialogOpen}
              onOpenChange={setOfflinePackDialogOpen}
              projectId={selectedProjectId}
              basemapId={basemapId}
              getMapView={handleGetMapCenter}
              onPrefsChange={setOfflineTilePrefs}
            />
          ) : null}

          </div>
        </div>
      )}
    </div>
  );
}
