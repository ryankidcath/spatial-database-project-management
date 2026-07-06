"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ensureVirtualDashboardForProject,
  fetchVirtualDashboardForProject,
  parseDashboardLayoutConfig,
} from "@/lib/virtual-dashboard-server";
import {
  dashboardFilterCountKey,
  type DashboardTableBundle,
  type DashboardTableBundleNeeds,
} from "@/lib/dashboard-table-bundle";
import {
  fetchDashboardBarByGroupByKey,
  fetchDashboardColumnSeriesByWidget,
  fetchDashboardDistinctCount,
  fetchDashboardStatusPieByColumn,
  fetchDashboardSumColumn,
  fetchDashboardValueDistributionByColumn,
} from "@/lib/dashboard-table-aggregate-server";
import { resolveVirtualColumnSlug } from "@/lib/dashboard-column-resolve";
import { mergedFiltersForTable } from "@/lib/dashboard-global-filters";
import type { DashboardMapLayerSpec } from "@/lib/dashboard-map-layer-needs";
import type { VirtualDataRow } from "./virtual-table-types";
import type {
  DashboardGlobalFilterValue,
  DashboardLayoutConfig,
  DashboardWidget,
  VirtualDashboardRow,
} from "./virtual-dashboard-types";
import { fetchVirtualRowsAction, fetchVirtualRowsForMapAction } from "./virtual-table-actions";

type ActionResult = { error: string | null };

export async function fetchVirtualDashboardAction(
  projectId: string
): Promise<{ dashboard: VirtualDashboardRow | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { dashboard: null, error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { dashboard: null, error: "Belum masuk" };

  return fetchVirtualDashboardForProject(supabase, projectId);
}

export async function ensureVirtualDashboardAction(
  projectId: string
): Promise<{ dashboard: VirtualDashboardRow | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { dashboard: null, error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { dashboard: null, error: "Belum masuk" };

  const result = await ensureVirtualDashboardForProject(
    supabase,
    user.id,
    projectId
  );
  if (result.dashboard && !result.error) {
    revalidatePath("/", "layout");
  }
  return result;
}

/** Data widget dashboard v2: agregasi SQL + filter global. */
export async function fetchDashboardTableBundleAction(
  tableId: string,
  needs: DashboardTableBundleNeeds
): Promise<{ bundle: DashboardTableBundle | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { bundle: null, error: "Supabase tidak dikonfigurasi" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { bundle: null, error: "Belum masuk" };

  const { data: colMetaRaw } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("slug, display_name, data_type")
    .eq("table_id", tableId)
    .order("position");

  const columnMeta = (colMetaRaw ?? []) as {
    slug: string;
    display_name: string;
    data_type?: string;
  }[];

  const allFilters = mergedFiltersForTable(
    tableId,
    needs.globalFilters.map((f) => ({
      table_id: tableId,
      column: f.column,
      value: f.value,
    })),
    needs.filters
  );

  const base = () =>
    supabase
      .schema("core_pm")
      .from("virtual_rows")
      .select("id", { count: "exact", head: true })
      .eq("table_id", tableId)
      .is("deleted_at", null);

  let countQuery = base();
  for (const f of allFilters) {
    const slug = resolveVirtualColumnSlug(columnMeta, f.column);
    countQuery = countQuery.filter(`payload->>${slug}`, "eq", f.value.trim());
  }

  const { count: totalRaw, error: totalErr } = await countQuery;
  if (totalErr) return { bundle: null, error: totalErr.message };

  const totalCount = totalRaw ?? 0;
  const filterCounts: Record<string, number> = {};

  for (const f of needs.filters) {
    const colSlug = resolveVirtualColumnSlug(columnMeta, f.column);
    const combined = mergedFiltersForTable(
      tableId,
      needs.globalFilters.map((g) => ({
        table_id: tableId,
        column: g.column,
        value: g.value,
      })),
      [f]
    );
    let fq = base();
    for (const cf of combined) {
      const s = resolveVirtualColumnSlug(columnMeta, cf.column);
      fq = fq.filter(`payload->>${s}`, "eq", cf.value.trim());
    }
    const { count, error } = await fq;
    if (error) return { bundle: null, error: error.message };
    filterCounts[dashboardFilterCountKey(f.column, f.value)] = count ?? 0;
    if (colSlug !== f.column) {
      filterCounts[dashboardFilterCountKey(colSlug, f.value)] = count ?? 0;
    }
  }

  const distinctCounts: Record<string, number> = {};
  for (const col of needs.distinctColumns) {
    const slug = resolveVirtualColumnSlug(columnMeta, col);
    const res = await fetchDashboardDistinctCount(
      supabase,
      tableId,
      slug,
      allFilters
    );
    if (res.error) return { bundle: null, error: res.error };
    distinctCounts[slug] = res.count;
    if (slug !== col) distinctCounts[col] = res.count;
  }

  const sumByColumn: Record<string, number> = {};
  for (const col of needs.sumColumns) {
    const slug = resolveVirtualColumnSlug(columnMeta, col);
    const res = await fetchDashboardSumColumn(
      supabase,
      tableId,
      slug,
      allFilters
    );
    if (res.error) return { bundle: null, error: res.error };
    sumByColumn[slug] = res.sum;
    if (slug !== col) sumByColumn[col] = res.sum;
  }

  const [statusPieRes, valueDistRes, barRes, columnSeriesRes] = await Promise.all([
    needs.statusPieColumns.length > 0
      ? fetchDashboardStatusPieByColumn(
          supabase,
          tableId,
          needs.statusPieColumns,
          columnMeta,
          allFilters
        )
      : Promise.resolve({
          byColumn: {} as Record<string, never>,
          error: null as string | null,
        }),
    needs.valueDistributionColumns.length > 0
      ? fetchDashboardValueDistributionByColumn(
          supabase,
          tableId,
          needs.valueDistributionColumns,
          columnMeta,
          allFilters
        )
      : Promise.resolve({
          byColumn: {} as Record<string, never>,
          error: null as string | null,
        }),
    needs.barByGroupSpecs.length > 0
      ? fetchDashboardBarByGroupByKey(
          supabase,
          tableId,
          needs.barByGroupSpecs,
          columnMeta,
          allFilters
        )
      : Promise.resolve({
          byKey: {} as Record<string, never>,
          error: null as string | null,
        }),
    needs.columnSeriesSpecs.length > 0
      ? fetchDashboardColumnSeriesByWidget(
          supabase,
          tableId,
          needs.columnSeriesSpecs,
          columnMeta,
          allFilters
        )
      : Promise.resolve({
          byWidgetId: {} as Record<string, never>,
          error: null as string | null,
        }),
  ]);

  if (statusPieRes.error && needs.statusPieColumns.length > 0) {
    return { bundle: null, error: statusPieRes.error };
  }
  if (valueDistRes.error && needs.valueDistributionColumns.length > 0) {
    return { bundle: null, error: valueDistRes.error };
  }
  if (barRes.error && needs.barByGroupSpecs.length > 0) {
    return { bundle: null, error: barRes.error };
  }
  if (columnSeriesRes.error && needs.columnSeriesSpecs.length > 0) {
    return { bundle: null, error: columnSeriesRes.error };
  }

  let rows: Record<string, unknown>[] = [];
  if (needs.previewLimit > 0) {
    const r = await fetchVirtualRowsAction(tableId, {
      limit: needs.previewLimit,
      offset: 0,
    });
    if (r.error) return { bundle: null, error: r.error };
    rows = r.rows;
    if (allFilters.length > 0) {
      rows = rows.filter((row) => {
        const payload = (row.payload ?? {}) as Record<string, unknown>;
        return allFilters.every((f) => {
          const slug = resolveVirtualColumnSlug(columnMeta, f.column);
          return String(payload[slug] ?? "").trim() === f.value.trim();
        });
      });
    }
  }

  return {
    bundle: {
      totalCount,
      filterCounts,
      distinctCounts,
      sumByColumn,
      rows,
      statusPieByColumn: statusPieRes.byColumn,
      valueCountsByColumn: valueDistRes.byColumn,
      columnSeriesByWidgetId: columnSeriesRes.byWidgetId,
      barByGroupByKey: barRes.byKey,
    },
    error: null,
  };
}

export type DashboardMapLayerPayload = {
  tableId: string;
  geometryColumn: string;
  rows: VirtualDataRow[];
};

/** Baris + geometri untuk mini-peta / ringkasan spasial (filter global diterapkan). */
export async function fetchDashboardMapLayersAction(
  specs: DashboardMapLayerSpec[],
  globalFilterValues: DashboardGlobalFilterValue[]
): Promise<{ layers: DashboardMapLayerPayload[]; error: string | null }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { layers: [], error: "Supabase tidak dikonfigurasi" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { layers: [], error: "Belum masuk" };

  const layers: DashboardMapLayerPayload[] = [];
  const errors: string[] = [];

  for (const spec of specs) {
    const { data: colMetaRaw } = await supabase
      .schema("core_pm")
      .from("virtual_columns")
      .select("slug, display_name, data_type, position")
      .eq("table_id", spec.tableId)
      .order("position");

    const columnMeta = (colMetaRaw ?? []) as {
      slug: string;
      display_name: string;
      data_type: string;
      position: number;
    }[];

    const geoSlug = resolveVirtualColumnSlug(
      columnMeta,
      spec.geometryColumn
    );
    const allFilters = mergedFiltersForTable(
      spec.tableId,
      globalFilterValues,
      []
    );
    const filterSlugs = allFilters.map((f) =>
      resolveVirtualColumnSlug(columnMeta, f.column)
    );
    const popupSlugs = columnMeta
      .filter((c) => c.data_type !== "geometry" && c.data_type !== "file")
      .slice(0, 6)
      .map((c) => c.slug);
    const columnSlugs = [
      ...new Set([geoSlug, ...filterSlugs, ...popupSlugs].filter(Boolean)),
    ];

    const result = await fetchVirtualRowsForMapAction(spec.tableId, columnSlugs);
    if (result.error) {
      errors.push(result.error);
      continue;
    }

    let rows = result.rows as VirtualDataRow[];
    if (allFilters.length > 0) {
      rows = rows.filter((row) => {
        const payload = (row.payload ?? {}) as Record<string, unknown>;
        return allFilters.every((f) => {
          const slug = resolveVirtualColumnSlug(columnMeta, f.column);
          return String(payload[slug] ?? "").trim() === f.value.trim();
        });
      });
    }

    layers.push({
      tableId: spec.tableId,
      geometryColumn: geoSlug,
      rows,
    });
  }

  if (errors.length > 0 && layers.length === 0) {
    return { layers: [], error: errors[0] ?? "Gagal memuat lapisan peta" };
  }

  return { layers, error: errors[0] ?? null };
}

export async function saveVirtualDashboardWidgetsAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const dashboardId = String(formData.get("dashboard_id") ?? "").trim();
  const widgetsRaw = String(formData.get("widgets") ?? "[]");
  const layoutConfigRaw = String(formData.get("layout_config") ?? "{}");

  if (!dashboardId) return { error: "dashboard_id kosong" };

  let widgets: DashboardWidget[];
  try {
    widgets = JSON.parse(widgetsRaw);
    if (!Array.isArray(widgets)) throw new Error();
  } catch {
    return { error: "widgets bukan JSON array valid" };
  }

  let layout_config: DashboardLayoutConfig;
  try {
    layout_config = JSON.parse(layoutConfigRaw) as DashboardLayoutConfig;
  } catch {
    return { error: "layout_config bukan JSON valid" };
  }

  const { error } = await supabase
    .schema("core_pm")
    .from("virtual_dashboards")
    .update({
      widgets,
      layout_config,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dashboardId);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { error: null };
}
