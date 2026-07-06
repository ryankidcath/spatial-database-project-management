"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import type {
  DashboardGlobalFilterDef,
  DashboardGlobalFilterValue,
  DashboardLayoutConfig,
  DashboardStatMetric,
  DashboardWidget,
  DashboardWidgetType,
  MiniMapWidgetConfig,
  VirtualDashboardRow,
} from "./virtual-dashboard-types";
import { DASHBOARD_GRID_COLS, DASHBOARD_WIDGET_TYPES } from "./virtual-dashboard-types";
import type { VirtualColumnRow, VirtualDataRow, VirtualTableRow } from "./virtual-table-types";
import {
  bundleNeedsFromWidgetsWithGlobalFilters,
  type DashboardTableBundle,
} from "@/lib/dashboard-table-bundle";
import { resolveVirtualColumnSlug } from "@/lib/dashboard-column-resolve";
import {
  defaultSizeForWidgetType,
  nextWidgetPosition,
  normalizeDashboardWidgetsLayout,
} from "@/lib/dashboard-widget-layout";
import {
  ensureVirtualDashboardAction,
  fetchDashboardMapLayersAction,
  fetchDashboardTableBundleAction,
  saveVirtualDashboardWidgetsAction,
} from "./virtual-dashboard-actions";
import type { DashboardMapLayerData } from "./dashboard-widget-body";
import {
  DashboardCrossWidgetProvider,
  useDashboardCrossWidget,
} from "./dashboard-cross-widget-context";
import { DashboardFilterBar } from "./dashboard-filter-bar";
import { DashboardGrid } from "./dashboard-grid";
import { mapLayerSpecsFromWidgets } from "@/lib/dashboard-map-layer-needs";
import { syncDashboardFiltersToViewSessions } from "@/lib/dashboard-spatial-session-sync";
import { buildVirtualTableRowFootprints } from "@/lib/virtual-table-map-footprints";
import { computeLayerExtentStats } from "@/lib/workspace-map-layer-stats";
import { useWorkspaceSpatialDataSyncOptional } from "./workspace-spatial-data-sync-context";
import type { VirtualRowMapSelect } from "./workspace-map";
import { RUANG_KERJA_LABEL, ruangKerjaLc } from "@/lib/product-labels";

const CARD_CLASS =
  "rounded-xl border border-border bg-card shadow-sm bg-gradient-to-b from-card to-muted/20";

type Props = {
  projectId: string;
  projectName: string;
  virtualTables: VirtualTableRow[];
  virtualColumns: VirtualColumnRow[];
  memberNameByUserId?: Map<string, string>;
  initialDashboard?: VirtualDashboardRow | null;
};

function parseWidgetsWithLayout(
  raw: DashboardWidget[] | undefined
): DashboardWidget[] {
  return normalizeDashboardWidgetsLayout(raw ?? []);
}

export function VirtualDashboardView(props: Props) {
  return (
    <DashboardCrossWidgetProvider>
      <VirtualDashboardViewInner {...props} />
    </DashboardCrossWidgetProvider>
  );
}

function VirtualDashboardViewInner({
  projectId,
  projectName,
  virtualTables,
  virtualColumns,
  memberNameByUserId = new Map(),
  initialDashboard = null,
}: Props) {
  const spatialSync = useWorkspaceSpatialDataSyncOptional();
  const { highlightTableId, highlightRowId, setHighlight } =
    useDashboardCrossWidget();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hasInitial =
    initialDashboard != null && initialDashboard.project_id === projectId;
  const [loading, setLoading] = useState(!hasInitial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadSeqRef = useRef(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [dashboard, setDashboard] = useState<VirtualDashboardRow | null>(
    hasInitial ? initialDashboard : null
  );
  const [widgets, setWidgets] = useState<DashboardWidget[]>(() =>
    parseWidgetsWithLayout(hasInitial ? initialDashboard?.widgets : undefined)
  );
  const [layoutConfig, setLayoutConfig] = useState<DashboardLayoutConfig>(
    () =>
      initialDashboard?.layout_config ?? {
        version: 2,
        globalFilters: [],
      }
  );
  const [globalFilterValues, setGlobalFilterValues] = useState<
    DashboardGlobalFilterValue[]
  >([]);
  const [editing, setEditing] = useState(false);
  const [bundlesByTable, setBundlesByTable] = useState<
    Map<string, DashboardTableBundle>
  >(new Map());
  const [widgetDialogOpen, setWidgetDialogOpen] = useState(false);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [formType, setFormType] = useState<DashboardWidgetType>("stat");
  const [formTitle, setFormTitle] = useState("");
  const [formTableId, setFormTableId] = useState("");
  const [formStatusCol, setFormStatusCol] = useState("");
  const [formValueCol, setFormValueCol] = useState("");
  const [formChartType, setFormChartType] = useState<"pie" | "bar">("pie");
  const [formCenterUnit, setFormCenterUnit] = useState("baris");
  const [formSeriesCols, setFormSeriesCols] = useState<string[]>([]);
  const [formSeriesMatchValue, setFormSeriesMatchValue] = useState("");
  const [formGroupCol, setFormGroupCol] = useState("");
  const [formFilterCol, setFormFilterCol] = useState("");
  const [formFilterVal, setFormFilterVal] = useState("");
  const [formMetric, setFormMetric] = useState<DashboardStatMetric>("count");
  const [formStatColumn, setFormStatColumn] = useState("");
  const [formPrefix, setFormPrefix] = useState("");
  const [formSuffix, setFormSuffix] = useState("");
  const [formCountWhen, setFormCountWhen] = useState("Done");
  const [formHeaderText, setFormHeaderText] = useState("");
  const [formPreviewLimit, setFormPreviewLimit] = useState(8);
  const [formW, setFormW] = useState(3);
  const [formH, setFormH] = useState(2);
  const [draftFilterTableId, setDraftFilterTableId] = useState("");
  const [draftFilterColumn, setDraftFilterColumn] = useState("");
  const [formGeoCol, setFormGeoCol] = useState("");
  const [formLayer2TableId, setFormLayer2TableId] = useState("");
  const [formLayer2GeoCol, setFormLayer2GeoCol] = useState("");
  const [formAreaCol, setFormAreaCol] = useState("");
  const [formShortcutLabel, setFormShortcutLabel] = useState("");
  const [mapLayersLoading, setMapLayersLoading] = useState(false);
  const [mapLayersRaw, setMapLayersRaw] = useState<
    Map<string, { geometryColumn: string; rows: VirtualDataRow[] }>
  >(new Map());

  const projectTables = useMemo(
    () => virtualTables.filter((t) => t.project_id === projectId),
    [virtualTables, projectId]
  );

  const filterDefs = layoutConfig.globalFilters ?? [];

  const resetWidgetForm = useCallback(() => {
    setEditingWidgetId(null);
    setFormType("stat");
    setFormTitle("");
    setFormTableId(projectTables[0]?.id ?? "");
    setFormStatusCol("");
    setFormValueCol("");
    setFormChartType("pie");
    setFormCenterUnit("baris");
    setFormSeriesCols([]);
    setFormSeriesMatchValue("");
    setFormGroupCol("");
    setFormFilterCol("");
    setFormFilterVal("");
    setFormMetric("count");
    setFormStatColumn("");
    setFormPrefix("");
    setFormSuffix("");
    setFormCountWhen("Done");
    setFormHeaderText("");
    setFormPreviewLimit(8);
    setFormGeoCol("");
    setFormLayer2TableId("");
    setFormLayer2GeoCol("");
    setFormAreaCol("");
    setFormShortcutLabel("");
    const def = defaultSizeForWidgetType("stat");
    setFormW(def.w);
    setFormH(def.h);
  }, [projectTables]);

  const populateWidgetForm = useCallback((widget: DashboardWidget) => {
    const cfg = widget.config as Record<string, string | number | undefined> & {
      series?: { column: string; match_value?: string }[];
    };
    setEditingWidgetId(widget.id);
    setFormType(widget.type);
    setFormTitle(widget.title);
    setFormW(widget.w ?? defaultSizeForWidgetType(widget.type).w);
    setFormH(widget.h ?? defaultSizeForWidgetType(widget.type).h);
    setFormTableId(String(cfg.table_id ?? ""));
    setFormStatusCol(String(cfg.status_column ?? ""));
    setFormValueCol(String(cfg.column ?? cfg.status_column ?? ""));
    setFormChartType((cfg.chart_type as "pie" | "bar") ?? "pie");
    setFormCenterUnit(String(cfg.center_unit ?? "baris"));
    setFormSeriesCols(
      Array.isArray(cfg.series) ? cfg.series.map((s) => s.column) : []
    );
    setFormSeriesMatchValue(
      Array.isArray(cfg.series)
        ? (cfg.series.find((s) => s.match_value)?.match_value ?? "")
        : ""
    );
    setFormGroupCol(String(cfg.group_column ?? ""));
    setFormFilterCol(String(cfg.filter_column ?? ""));
    setFormFilterVal(String(cfg.filter_value ?? ""));
    setFormMetric((cfg.metric as DashboardStatMetric) ?? "count");
    setFormStatColumn(String(cfg.column ?? ""));
    setFormPrefix(String(cfg.prefix ?? ""));
    setFormSuffix(String(cfg.suffix ?? ""));
    setFormCountWhen(String(cfg.count_when ?? "Done"));
    setFormHeaderText(String(cfg.text ?? ""));
    setFormPreviewLimit(
      typeof cfg.limit === "number" && cfg.limit > 0 ? cfg.limit : 8
    );
    setFormGeoCol(String(cfg.geometry_column ?? ""));
    setFormLayer2TableId(String(cfg.layer2_table_id ?? ""));
    setFormLayer2GeoCol(String(cfg.layer2_geometry_column ?? ""));
    setFormAreaCol(String(cfg.area_column ?? ""));
    setFormShortcutLabel(String(cfg.label ?? ""));
  }, []);

  const openAddWidgetDialog = useCallback(() => {
    resetWidgetForm();
    setWidgetDialogOpen(true);
  }, [resetWidgetForm]);

  const openEditWidgetDialog = useCallback(
    (widget: DashboardWidget) => {
      populateWidgetForm(widget);
      setWidgetDialogOpen(true);
    },
    [populateWidgetForm]
  );

  const allPickerTables = useMemo(() => virtualTables, [virtualTables]);

  const columnsByTableId = useMemo(() => {
    const m = new Map<string, VirtualColumnRow[]>();
    for (const t of virtualTables) {
      m.set(
        t.id,
        virtualColumns
          .filter((c) => c.table_id === t.id)
          .sort((a, b) => a.position - b.position)
      );
    }
    return m;
  }, [virtualTables, virtualColumns]);

  const tableNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of virtualTables) m.set(t.id, t.display_name);
    return m;
  }, [virtualTables]);

  const fetchBundlesForWidgets = useCallback(
    async (
      list: DashboardWidget[],
      filters: DashboardGlobalFilterValue[]
    ) => {
      const needsByTable = bundleNeedsFromWidgetsWithGlobalFilters(
        list,
        filters
      );
      const next = new Map<string, DashboardTableBundle>();
      const errors: string[] = [];
      await Promise.all(
        [...needsByTable.entries()].map(async ([tid, needs]) => {
          const r = await fetchDashboardTableBundleAction(tid, needs);
          if (r.error) errors.push(r.error);
          if (r.bundle) next.set(tid, r.bundle);
        })
      );
      if (errors.length > 0) {
        toast.error(errors[0] ?? "Gagal memuat data widget");
      }
      return next;
    },
    []
  );

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      setLoadError(null);
      setDashboard(null);
      setWidgets([]);
      setBundlesByTable(new Map());
      return undefined;
    }

    if (hasInitial && reloadToken === 0) {
      setLoading(false);
      setLoadError(null);
      const w = parseWidgetsWithLayout(initialDashboard?.widgets);
      void fetchBundlesForWidgets(w, globalFilterValues).then(setBundlesByTable);
      return undefined;
    }

    const seq = ++loadSeqRef.current;
    setLoading(true);
    setLoadError(null);

    let cancelled = false;
    const frameId = requestAnimationFrame(() => {
      if (cancelled) return;
      void ensureVirtualDashboardAction(projectId)
        .then(async (res) => {
          if (cancelled || loadSeqRef.current !== seq) return;
          if (res.error) {
            setLoadError(res.error);
            toast.error(res.error);
            return;
          }
          const d = res.dashboard;
          setDashboard(d);
          const w = parseWidgetsWithLayout(d?.widgets);
          setWidgets(w);
          setLayoutConfig(
            d?.layout_config ?? { version: 2, globalFilters: [] }
          );
          setLoadError(null);
          setLoading(false);

          if (w.length) {
            const next = await fetchBundlesForWidgets(w, globalFilterValues);
            if (!cancelled && loadSeqRef.current === seq) setBundlesByTable(next);
          } else {
            setBundlesByTable(new Map());
          }
        })
        .catch(() => {
          if (cancelled || loadSeqRef.current !== seq) return;
          const msg = "Gagal memuat dashboard";
          setLoadError(msg);
          toast.error(msg);
        })
        .finally(() => {
          if (!cancelled && loadSeqRef.current === seq) setLoading(false);
        });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      loadSeqRef.current += 1;
    };
    // globalFilterValues intentionally excluded on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, reloadToken, hasInitial, initialDashboard, fetchBundlesForWidgets]);

  useEffect(() => {
    if (loading || widgets.length === 0) return;
    void fetchBundlesForWidgets(widgets, globalFilterValues).then(
      setBundlesByTable
    );
  }, [globalFilterValues, fetchBundlesForWidgets, loading, widgets]);

  const mapLayerSpecs = useMemo(
    () => mapLayerSpecsFromWidgets(widgets, columnsByTableId),
    [widgets, columnsByTableId]
  );

  useEffect(() => {
    if (loading || mapLayerSpecs.length === 0) {
      setMapLayersRaw(new Map());
      return;
    }
    let cancelled = false;
    setMapLayersLoading(true);
    void fetchDashboardMapLayersAction(mapLayerSpecs, globalFilterValues)
      .then((res) => {
        if (cancelled) return;
        if (res.error) toast.error(res.error);
        const next = new Map<
          string,
          { geometryColumn: string; rows: VirtualDataRow[] }
        >();
        for (const layer of res.layers) {
          next.set(layer.tableId, {
            geometryColumn: layer.geometryColumn,
            rows: layer.rows,
          });
        }
        setMapLayersRaw(next);
      })
      .finally(() => {
        if (!cancelled) setMapLayersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, mapLayerSpecs, globalFilterValues]);

  const mapLayers = useMemo((): Map<string, DashboardMapLayerData> => {
    const out = new Map<string, DashboardMapLayerData>();
    for (const [tableId, layer] of mapLayersRaw) {
      const table = virtualTables.find((t) => t.id === tableId);
      if (!table) continue;
      const cols = columnsByTableId.get(tableId) ?? [];
      const footprints = buildVirtualTableRowFootprints({
        table,
        columns: cols,
        rows: layer.rows,
        relationLabels: {},
        memberNameByUserId,
        projectName,
        geometryColumnSlug: layer.geometryColumn,
      });
      const stats = computeLayerExtentStats(footprints, [
        { tableId, displayName: table.display_name },
      ])[0];
      out.set(tableId, {
        tableId,
        geometryColumn: layer.geometryColumn,
        rows: layer.rows,
        footprints,
        featureCount: stats?.featureCount ?? footprints.length,
        totalAreaLabel: stats?.totalAreaLabel ?? "—",
      });
    }
    return out;
  }, [
    mapLayersRaw,
    virtualTables,
    columnsByTableId,
    memberNameByUserId,
    projectName,
  ]);

  const handleMapRowSelect = useCallback(
    (select: VirtualRowMapSelect) => {
      setHighlight(select.tableId, select.rowId);
    },
    [setHighlight]
  );

  const handleOpenSpatial = useCallback(
    (tableId: string) => {
      const tableIds = [
        ...new Set(
          widgets
            .map((w) => (w.config as { table_id?: string }).table_id)
            .filter(Boolean) as string[]
        ),
      ];
      syncDashboardFiltersToViewSessions(
        tableIds.length > 0 ? tableIds : [tableId],
        globalFilterValues
      );
      const rowIds =
        highlightTableId === tableId && highlightRowId
          ? [highlightRowId]
          : undefined;
      spatialSync?.openInSpatial({
        tableId,
        rowIds,
        zoomToSelection: Boolean(rowIds?.length),
      });
    },
    [
      widgets,
      globalFilterValues,
      highlightTableId,
      highlightRowId,
      spatialSync,
    ]
  );

  const refreshBundlesForWidgets = useCallback(
    async (list: DashboardWidget[]) => {
      const next = await fetchBundlesForWidgets(list, globalFilterValues);
      setBundlesByTable(next);
    },
    [fetchBundlesForWidgets, globalFilterValues]
  );

  const saveDashboard = () => {
    if (!dashboard) return;
    const fd = new FormData();
    fd.set("dashboard_id", dashboard.id);
    fd.set("widgets", JSON.stringify(widgets));
    fd.set(
      "layout_config",
      JSON.stringify({ ...layoutConfig, version: 2 })
    );
    startTransition(async () => {
      const r = await saveVirtualDashboardWidgetsAction(fd);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Dashboard disimpan");
        setEditing(false);
        router.refresh();
      }
    });
  };

  const cancelEditing = () => {
    setWidgets(parseWidgetsWithLayout(dashboard?.widgets));
    setLayoutConfig(
      dashboard?.layout_config ?? { version: 2, globalFilters: [] }
    );
    setGlobalFilterValues([]);
    setEditing(false);
  };

  const buildWidgetConfig = (): DashboardWidget["config"] | null => {
    if (formType === "header") {
      return { text: formHeaderText.trim() || "Judul" };
    }
    if (!formTableId) {
      toast.error("Pilih tabel sumber");
      return null;
    }
    const cols = columnsByTableId.get(formTableId) ?? [];

    if (formType === "stat") {
      const metric = formMetric;
      if (metric === "count_distinct" || metric === "sum") {
        if (!formStatColumn) {
          toast.error("Pilih kolom untuk agregasi");
          return null;
        }
        return {
          table_id: formTableId,
          metric,
          column: resolveVirtualColumnSlug(cols, formStatColumn),
          prefix: formPrefix || undefined,
          suffix: formSuffix || undefined,
        };
      }
      const filterCol = resolveVirtualColumnSlug(cols, formFilterCol.trim());
      const filterVal = formFilterVal.trim();
      if (filterCol && filterVal) {
        return {
          table_id: formTableId,
          metric: "count",
          filter_column: filterCol,
          filter_value: filterVal,
          prefix: formPrefix || undefined,
          suffix: formSuffix || undefined,
        };
      }
      return {
        table_id: formTableId,
        metric: "count",
        prefix: formPrefix || undefined,
        suffix: formSuffix || undefined,
      };
    }

    if (formType === "value_distribution") {
      const col = formValueCol || formStatusCol;
      if (!col) {
        toast.error("Pilih kolom distribusi");
        return null;
      }
      return {
        table_id: formTableId,
        column: resolveVirtualColumnSlug(cols, col),
        chart_type: formChartType,
        center_unit: formCenterUnit.trim() || "baris",
      };
    }

    if (formType === "multi_column_chart") {
      if (formSeriesCols.length === 0) {
        toast.error("Pilih minimal satu kolom untuk chart");
        return null;
      }
      return {
        table_id: formTableId,
        series: formSeriesCols.map((slug) => ({
          column: resolveVirtualColumnSlug(cols, slug),
          match_value: formSeriesMatchValue.trim() || undefined,
        })),
        chart_type: formChartType,
        center_unit: formCenterUnit.trim() || "baris",
      };
    }

    if (formType === "status_pie") {
      if (!formStatusCol) {
        toast.error("Pilih kolom status");
        return null;
      }
      return {
        table_id: formTableId,
        status_column: resolveVirtualColumnSlug(cols, formStatusCol),
      };
    }

    if (formType === "bar_by_group") {
      if (!formGroupCol || !formStatusCol) {
        toast.error("Pilih kolom grup dan status");
        return null;
      }
      return {
        table_id: formTableId,
        group_column: resolveVirtualColumnSlug(cols, formGroupCol),
        status_column: resolveVirtualColumnSlug(cols, formStatusCol),
        count_when: formCountWhen.trim() || "Done",
      };
    }

    if (formType === "mini_map") {
      const geoCols = cols.filter((c) => c.data_type === "geometry");
      if (geoCols.length === 0) {
        toast.error("Tabel tidak punya kolom geometri");
        return null;
      }
      const geo = formGeoCol || geoCols[0]?.slug || "";
      const config: MiniMapWidgetConfig = {
        table_id: formTableId,
        geometry_column: resolveVirtualColumnSlug(cols, geo),
      };
      if (formLayer2TableId) {
        const cols2 = columnsByTableId.get(formLayer2TableId) ?? [];
        const geo2Cols = cols2.filter((c) => c.data_type === "geometry");
        if (geo2Cols.length === 0) {
          toast.error("Lapisan kedua tidak punya kolom geometri");
          return null;
        }
        config.layer2_table_id = formLayer2TableId;
        const geo2 = formLayer2GeoCol || geo2Cols[0]?.slug || "";
        config.layer2_geometry_column = resolveVirtualColumnSlug(cols2, geo2);
      }
      return config;
    }

    if (formType === "spatial_summary") {
      const geoCols = cols.filter((c) => c.data_type === "geometry");
      if (!formAreaCol && geoCols.length === 0) {
        toast.error("Pilih kolom luas atau pastikan tabel punya geometri");
        return null;
      }
      return {
        table_id: formTableId,
        ...(formGeoCol
          ? { geometry_column: resolveVirtualColumnSlug(cols, formGeoCol) }
          : {}),
        ...(formAreaCol
          ? { area_column: resolveVirtualColumnSlug(cols, formAreaCol) }
          : {}),
      };
    }

    if (formType === "spatial_shortcut") {
      return {
        table_id: formTableId,
        label: formShortcutLabel.trim() || undefined,
        sync_filters: true,
      };
    }

    if (formType === "table_preview") {
      return {
        table_id: formTableId,
        limit: Math.min(20, Math.max(1, formPreviewLimit || 8)),
      };
    }

    return { table_id: formTableId };
  };

  const saveWidgetFromDialog = () => {
    const config = buildWidgetConfig();
    if (!config) return;

    const title =
      formTitle.trim() ||
      (formType === "header"
        ? formHeaderText.trim()
        : (tableNameById.get(formTableId) ?? "Widget"));

    const def = defaultSizeForWidgetType(formType);
    const existing = editingWidgetId
      ? widgets.find((w) => w.id === editingWidgetId)
      : undefined;
    const pos = existing
      ? { x: existing.x ?? 0, y: existing.y ?? 0 }
      : nextWidgetPosition(widgets);

    const widget: DashboardWidget = {
      id: editingWidgetId ?? crypto.randomUUID(),
      type: formType,
      title,
      w: existing
        ? Math.min(DASHBOARD_GRID_COLS, Math.max(1, existing.w ?? def.w))
        : Math.min(DASHBOARD_GRID_COLS, Math.max(1, formW || def.w)),
      h: existing
        ? Math.max(1, existing.h ?? def.h)
        : Math.max(1, formH || def.h),
      x: pos.x,
      y: pos.y,
      config,
    };

    const next = editingWidgetId
      ? widgets.map((w) => (w.id === editingWidgetId ? widget : w))
      : [...widgets, widget];

    setWidgets(next);
    void refreshBundlesForWidgets(next);
    setWidgetDialogOpen(false);
    resetWidgetForm();
  };

  const onGlobalFilterChange = (
    tableId: string,
    column: string,
    value: string
  ) => {
    setGlobalFilterValues((prev) => {
      const rest = prev.filter(
        (f) => !(f.table_id === tableId && f.column === column)
      );
      if (!value) return rest;
      return [...rest, { table_id: tableId, column, value }];
    });
  };

  const addGlobalFilterDef = () => {
    if (!draftFilterTableId || !draftFilterColumn) {
      toast.error("Pilih tabel dan kolom filter");
      return;
    }
    const cols = columnsByTableId.get(draftFilterTableId) ?? [];
    const slug = resolveVirtualColumnSlug(cols, draftFilterColumn);
    const exists = filterDefs.some(
      (f) => f.table_id === draftFilterTableId && f.column_slug === slug
    );
    if (exists) {
      toast.error("Filter ini sudah ada");
      return;
    }
    const next: DashboardGlobalFilterDef = {
      table_id: draftFilterTableId,
      column_slug: slug,
    };
    setLayoutConfig((lc) => ({
      ...lc,
      globalFilters: [...(lc.globalFilters ?? []), next],
    }));
    setDraftFilterColumn("");
    setFilterDialogOpen(false);
  };

  const removeGlobalFilterDef = (tableId: string, columnSlug: string) => {
    setLayoutConfig((lc) => ({
      ...lc,
      globalFilters: (lc.globalFilters ?? []).filter(
        (f) => !(f.table_id === tableId && f.column_slug === columnSlug)
      ),
    }));
    setGlobalFilterValues((prev) =>
      prev.filter(
        (f) => !(f.table_id === tableId && f.column === columnSlug)
      )
    );
  };

  const colsForPicker = formTableId
    ? (columnsByTableId.get(formTableId) ?? [])
    : [];
  const geoCols = colsForPicker.filter((c) => c.data_type === "geometry");
  const layer2Cols = formLayer2TableId
    ? (columnsByTableId.get(formLayer2TableId) ?? []).filter(
        (c) => c.data_type === "geometry"
      )
    : [];
  const tablesWithGeometry = useMemo(
    () =>
      allPickerTables.filter((t) =>
        (columnsByTableId.get(t.id) ?? []).some(
          (c) => c.data_type === "geometry"
        )
      ),
    [allPickerTables, columnsByTableId]
  );
  const pickerTables =
    formType === "mini_map" || formType === "spatial_summary"
      ? tablesWithGeometry
      : allPickerTables;
  const seriesPickerCols = colsForPicker.filter((c) =>
    ["select", "checkbox", "text"].includes(c.data_type)
  );
  const selectCols = colsForPicker.filter((c) => c.data_type === "select");
  const numberCols = colsForPicker.filter((c) => c.data_type === "number");
  const filterCols = colsForPicker.filter(
    (c) => c.data_type !== "file" && c.data_type !== "geometry"
  );
  const draftFilterCols = draftFilterTableId
    ? (columnsByTableId.get(draftFilterTableId) ?? []).filter(
        (c) => c.data_type === "select"
      )
    : [];

  if (loading) {
    return (
      <div className="mt-6 flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Spinner className="size-5" /> Memuat dashboard…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mt-6 space-y-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm">
        <p className="font-medium text-destructive">Gagal memuat dashboard</p>
        <p className="text-muted-foreground">{loadError}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setReloadToken((t) => t + 1)}
        >
          Coba lagi
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{projectName}</h2>
          <p className="text-sm text-muted-foreground">Dashboard custom</p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="outline" onClick={openAddWidgetDialog}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Widget
              </Button>
              <Button size="sm" onClick={saveDashboard} disabled={pending}>
                <Save className="mr-1 h-3.5 w-3.5" /> Simpan
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEditing}>
                Batal
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>
      </div>

      <DashboardFilterBar
        filterDefs={filterDefs}
        filterValues={globalFilterValues}
        virtualTables={virtualTables}
        columnsByTableId={columnsByTableId}
        editing={editing}
        onChangeValue={onGlobalFilterChange}
        onConfigureFilters={
          editing ? () => setFilterDialogOpen(true) : undefined
        }
      />

      {editing && widgets.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Seret sudut widget untuk ubah ukuran. Gunakan ikon pensil untuk mengedit
          isi widget.
        </p>
      ) : null}

      {widgets.length === 0 ? (
        <div className={`${CARD_CLASS} p-8 text-center`}>
          <p className="text-sm text-muted-foreground">
            Belum ada widget. Klik <strong>Edit</strong> lalu tambah widget.
          </p>
          {projectTables.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Buat tabel {ruangKerjaLc} dulu di tab Data (+ di daftar tabel).
            </p>
          ) : null}
        </div>
      ) : (
        <DashboardGrid
          widgets={widgets}
          editing={editing}
          bundlesByTable={bundlesByTable}
          mapLayers={mapLayers}
          mapLayersLoading={mapLayersLoading}
          highlightTableId={highlightTableId}
          highlightRowId={highlightRowId}
          columnsByTableId={columnsByTableId}
          tableNameById={tableNameById}
          onLayoutChange={setWidgets}
          onEditWidget={openEditWidgetDialog}
          onRemoveWidget={(id) =>
            setWidgets((prev) => prev.filter((x) => x.id !== id))
          }
          onMapRowSelect={handleMapRowSelect}
          onOpenSpatial={handleOpenSpatial}
        />
      )}

      <Dialog
        open={widgetDialogOpen}
        onOpenChange={(open) => {
          setWidgetDialogOpen(open);
          if (!open) resetWidgetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingWidgetId ? "Edit widget" : "Tambah widget"}
            </DialogTitle>
            <DialogDescription>
              Pilih jenis widget, sumber data, dan tampilan di grid 12 kolom.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Jenis</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={formType}
                onChange={(e) => {
                  const t = e.target.value as DashboardWidgetType;
                  setFormType(t);
                  const def = defaultSizeForWidgetType(t);
                  setFormW(def.w);
                  setFormH(def.h);
                }}
              >
                {DASHBOARD_WIDGET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} — {t.description}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Judul widget</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Opsional"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {!editingWidgetId ? (
                <>
                  <div className="space-y-1">
                    <Label>Lebar (1–12)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={DASHBOARD_GRID_COLS}
                      value={formW}
                      onChange={(e) => setFormW(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Tinggi (baris)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={12}
                      value={formH}
                      onChange={(e) => setFormH(Number(e.target.value))}
                    />
                  </div>
                </>
              ) : (
                <p className="col-span-2 text-xs text-muted-foreground">
                  Ukuran & posisi diatur lewat drag/resize di grid.
                </p>
              )}
            </div>
            {formType === "header" ? (
              <div className="space-y-1">
                <Label>Teks judul</Label>
                <Input
                  value={formHeaderText}
                  onChange={(e) => setFormHeaderText(e.target.value)}
                  placeholder="Contoh: Ringkasan Progres"
                />
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label>Tabel sumber</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={formTableId}
                    onChange={(e) => {
                      setFormTableId(e.target.value);
                      setFormStatusCol("");
                      setFormValueCol("");
                      setFormGroupCol("");
                      setFormFilterCol("");
                      setFormStatColumn("");
                    }}
                  >
                    <option value="">— Pilih —</option>
                    {pickerTables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.display_name}
                        {t.organization_id ? " (Org)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                {formType === "stat" && (
                  <>
                    <div className="space-y-1">
                      <Label>Metrik</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={formMetric}
                        onChange={(e) =>
                          setFormMetric(e.target.value as DashboardStatMetric)
                        }
                      >
                        <option value="count">Jumlah baris</option>
                        <option value="count_distinct">Jumlah unik</option>
                        <option value="sum">Jumlah (SUM)</option>
                      </select>
                    </div>
                    {formMetric === "count_distinct" ? (
                      <div className="space-y-1">
                        <Label>Kolom unik</Label>
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={formStatColumn}
                          onChange={(e) => setFormStatColumn(e.target.value)}
                        >
                          <option value="">— Pilih —</option>
                          {filterCols.map((c) => (
                            <option key={c.id} value={c.slug}>
                              {c.display_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    {formMetric === "sum" ? (
                      <div className="space-y-1">
                        <Label>Kolom angka</Label>
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={formStatColumn}
                          onChange={(e) => setFormStatColumn(e.target.value)}
                        >
                          <option value="">— Pilih —</option>
                          {numberCols.map((c) => (
                            <option key={c.id} value={c.slug}>
                              {c.display_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    {formMetric === "count" ? (
                      <>
                        <div className="space-y-1">
                          <Label>Filter kolom (opsional)</Label>
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={formFilterCol}
                            onChange={(e) => setFormFilterCol(e.target.value)}
                          >
                            <option value="">— Tanpa filter —</option>
                            {filterCols.map((c) => (
                              <option key={c.id} value={c.slug}>
                                {c.display_name}
                              </option>
                            ))}
                          </select>
                        </div>
                        {formFilterCol ? (
                          <div className="space-y-1">
                            <Label>Nilai filter</Label>
                            <Input
                              value={formFilterVal}
                              onChange={(e) => setFormFilterVal(e.target.value)}
                              placeholder="Contoh: Selesai"
                            />
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Awalan (opsional)</Label>
                        <Input
                          value={formPrefix}
                          onChange={(e) => setFormPrefix(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Akhiran (opsional)</Label>
                        <Input
                          value={formSuffix}
                          onChange={(e) => setFormSuffix(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}
                {formType === "value_distribution" && (
                  <>
                    <div className="space-y-1">
                      <Label>Kolom distribusi</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={formValueCol}
                        onChange={(e) => setFormValueCol(e.target.value)}
                      >
                        <option value="">— Pilih —</option>
                        {selectCols.map((c) => (
                          <option key={c.id} value={c.slug}>
                            {c.display_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Tipe chart</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={formChartType}
                        onChange={(e) =>
                          setFormChartType(e.target.value as "pie" | "bar")
                        }
                      >
                        <option value="pie">Donut (pie)</option>
                        <option value="bar">Bar</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Label tengah donut</Label>
                      <Input
                        value={formCenterUnit}
                        onChange={(e) => setFormCenterUnit(e.target.value)}
                        placeholder="Contoh: Bidang"
                      />
                    </div>
                  </>
                )}
                {formType === "multi_column_chart" && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Centang kolom tahap yang ingin dibandingkan. Setiap kolom =
                      satu segmen chart (tahap boleh paralel antar kolom).
                    </p>
                    <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-input p-2">
                      {seriesPickerCols.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Tidak ada kolom centang/pilihan/teks di tabel ini.
                        </p>
                      ) : (
                        seriesPickerCols.map((c) => (
                          <label
                            key={c.id}
                            className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted/50"
                          >
                            <input
                              type="checkbox"
                              className="size-3.5"
                              checked={formSeriesCols.includes(c.slug)}
                              onChange={(e) => {
                                setFormSeriesCols((prev) =>
                                  e.target.checked
                                    ? [...prev, c.slug]
                                    : prev.filter((s) => s !== c.slug)
                                );
                              }}
                            />
                            <span className="flex-1">{c.display_name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {c.data_type}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>Nilai yang dihitung (opsional)</Label>
                      <Input
                        value={formSeriesMatchValue}
                        onChange={(e) => setFormSeriesMatchValue(e.target.value)}
                        placeholder="Kosong = centang aktif / kolom terisi. Contoh: Selesai"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Untuk kolom centang: kosongkan. Untuk kolom pilihan: isi
                        nilai exact match (mis. Selesai).
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label>Tipe chart</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={formChartType}
                        onChange={(e) =>
                          setFormChartType(e.target.value as "pie" | "bar")
                        }
                      >
                        <option value="pie">Donut (pie)</option>
                        <option value="bar">Bar</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Label tengah donut</Label>
                      <Input
                        value={formCenterUnit}
                        onChange={(e) => setFormCenterUnit(e.target.value)}
                        placeholder="Contoh: Bidang"
                      />
                    </div>
                  </>
                )}
                {(formType === "status_pie" || formType === "bar_by_group") && (
                  <div className="space-y-1">
                    <Label>Kolom status (pilihan)</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={formStatusCol}
                      onChange={(e) => setFormStatusCol(e.target.value)}
                    >
                      <option value="">— Pilih —</option>
                      {selectCols.map((c) => (
                        <option key={c.id} value={c.slug}>
                          {c.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {formType === "bar_by_group" && (
                  <>
                    <div className="space-y-1">
                      <Label>Kolom grup</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={formGroupCol}
                        onChange={(e) => setFormGroupCol(e.target.value)}
                      >
                        <option value="">— Pilih —</option>
                        {selectCols.map((c) => (
                          <option key={c.id} value={c.slug}>
                            {c.display_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Hitung baris dengan status</Label>
                      <Input
                        value={formCountWhen}
                        onChange={(e) => setFormCountWhen(e.target.value)}
                        placeholder="Done"
                      />
                    </div>
                  </>
                )}
                {formType === "table_preview" && (
                  <div className="space-y-1">
                    <Label>Jumlah baris cuplikan</Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={formPreviewLimit}
                      onChange={(e) =>
                        setFormPreviewLimit(Number(e.target.value))
                      }
                    />
                  </div>
                )}
                {formType === "mini_map" && (
                  <>
                    <div className="space-y-1">
                      <Label>Kolom geometri</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={formGeoCol}
                        onChange={(e) => setFormGeoCol(e.target.value)}
                      >
                        {geoCols.map((c) => (
                          <option key={c.id} value={c.slug}>
                            {c.display_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Lapisan kedua (opsional)</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={formLayer2TableId}
                        onChange={(e) => {
                          setFormLayer2TableId(e.target.value);
                          setFormLayer2GeoCol("");
                        }}
                      >
                        <option value="">— Tidak ada —</option>
                        {tablesWithGeometry
                          .filter((t) => t.id !== formTableId)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.display_name}
                            </option>
                          ))}
                      </select>
                    </div>
                    {formLayer2TableId ? (
                      <div className="space-y-1">
                        <Label>Geometri lapisan 2</Label>
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={formLayer2GeoCol}
                          onChange={(e) => setFormLayer2GeoCol(e.target.value)}
                        >
                          {layer2Cols.map((c) => (
                            <option key={c.id} value={c.slug}>
                              {c.display_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </>
                )}
                {formType === "spatial_summary" && (
                  <>
                    <div className="space-y-1">
                      <Label>Kolom geometri (opsional)</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={formGeoCol}
                        onChange={(e) => setFormGeoCol(e.target.value)}
                      >
                        <option value="">— Otomatis —</option>
                        {geoCols.map((c) => (
                          <option key={c.id} value={c.slug}>
                            {c.display_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Kolom luas angka (opsional)</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={formAreaCol}
                        onChange={(e) => setFormAreaCol(e.target.value)}
                      >
                        <option value="">— Hitung dari geometri —</option>
                        {numberCols.map((c) => (
                          <option key={c.id} value={c.slug}>
                            {c.display_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                {formType === "spatial_shortcut" && (
                  <div className="space-y-1">
                    <Label>Teks tombol</Label>
                    <Input
                      value={formShortcutLabel}
                      onChange={(e) => setFormShortcutLabel(e.target.value)}
                      placeholder="Buka di tab Spasial"
                    />
                  </div>
                )}
              </>
            )}
            <Button type="button" onClick={saveWidgetFromDialog}>
              {editingWidgetId ? "Simpan perubahan" : "Tambahkan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filter global dashboard</DialogTitle>
            <DialogDescription>
              Filter ini muncul di atas grid dan memengaruhi semua widget saat
              dipilih.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {filterDefs.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {filterDefs.map((f) => (
                  <li
                    key={`${f.table_id}:${f.column_slug}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                  >
                    <span>
                      {tableNameById.get(f.table_id)} ·{" "}
                      {(columnsByTableId.get(f.table_id) ?? []).find(
                        (c) => c.slug === f.column_slug
                      )?.display_name ?? f.column_slug}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        removeGlobalFilterDef(f.table_id, f.column_slug)
                      }
                    >
                      Hapus
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Belum ada filter global.
              </p>
            )}
            <div className="space-y-1">
              <Label>Tabel</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={draftFilterTableId}
                onChange={(e) => {
                  setDraftFilterTableId(e.target.value);
                  setDraftFilterColumn("");
                }}
              >
                <option value="">— Pilih —</option>
                {allPickerTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Kolom (pilihan)</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={draftFilterColumn}
                onChange={(e) => setDraftFilterColumn(e.target.value)}
                disabled={!draftFilterTableId}
              >
                <option value="">— Pilih —</option>
                {draftFilterCols.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.display_name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" onClick={addGlobalFilterDef}>
              Tambah filter
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
