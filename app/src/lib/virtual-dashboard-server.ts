import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DashboardLayoutConfig,
  DashboardWidget,
  VirtualDashboardRow,
} from "@/app/virtual-dashboard-types";
import type { VirtualColumnRow, VirtualTableRow } from "@/app/virtual-table-types";
import {
  defaultSizeForWidgetType,
  normalizeDashboardWidgetsLayout,
} from "@/lib/dashboard-widget-layout";

export function parseDashboardWidgets(raw: unknown): DashboardWidget[] {
  if (!Array.isArray(raw)) return [];
  return raw as DashboardWidget[];
}

export function parseDashboardLayoutConfig(raw: unknown): DashboardLayoutConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { version: 2 };
  }
  return raw as DashboardLayoutConfig;
}

function mapDashboardRow(row: Record<string, unknown>): VirtualDashboardRow {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    name: row.name as string,
    widgets: parseDashboardWidgets(row.widgets),
    layout_config: parseDashboardLayoutConfig(row.layout_config),
    created_by: (row.created_by as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/** Suggested widgets when project has a Progres-like table. */
function buildProgresTemplate(
  table: VirtualTableRow,
  columns: VirtualColumnRow[]
): DashboardWidget[] {
  const selectCols = columns.filter((c) => c.data_type === "select");
  const desaCol = selectCols.find((c) => c.slug === "desa") ?? selectCols[0];
  const kecCol = selectCols.find((c) => c.slug === "kecamatan") ?? selectCols[1];
  const statusCol =
    selectCols.find((c) => c.slug.includes("laporan")) ??
    selectCols.find((c) => c.slug !== kecCol?.slug && c.slug !== desaCol?.slug) ??
    selectCols[2];

  const raw: DashboardWidget[] = [];
  const statSize = defaultSizeForWidgetType("stat");

  raw.push({
    id: crypto.randomUUID(),
    type: "stat",
    title: desaCol ? `Jumlah ${desaCol.display_name}` : "Jumlah Desa",
    w: statSize.w,
    h: statSize.h,
    config: {
      table_id: table.id,
      metric: "count_distinct",
      column: desaCol?.slug,
    },
  });

  raw.push({
    id: crypto.randomUUID(),
    type: "stat",
    title: "Jumlah Bidang Tanah",
    w: statSize.w,
    h: statSize.h,
    config: { table_id: table.id, metric: "count" },
  });

  if (statusCol) {
    const distSize = defaultSizeForWidgetType("value_distribution");
    raw.push({
      id: crypto.randomUUID(),
      type: "value_distribution",
      title: statusCol.display_name,
      w: distSize.w,
      h: distSize.h,
      config: {
        table_id: table.id,
        column: statusCol.slug,
        chart_type: "pie",
      },
    });
  }

  if (kecCol && statusCol) {
    const barSize = defaultSizeForWidgetType("bar_by_group");
    raw.push({
      id: crypto.randomUUID(),
      type: "bar_by_group",
      title: `Progres per ${kecCol.display_name}`,
      w: barSize.w,
      h: barSize.h,
      config: {
        table_id: table.id,
        group_column: kecCol.slug,
        status_column: statusCol.slug,
        count_when: "Selesai",
      },
    });
  }

  return normalizeDashboardWidgetsLayout(raw);
}

export async function fetchVirtualDashboardForProject(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ dashboard: VirtualDashboardRow | null; error: string | null }> {
  const { data, error } = await supabase
    .schema("core_pm")
    .from("virtual_dashboards")
    .select(
      "id, project_id, name, widgets, layout_config, created_by, created_at, updated_at"
    )
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) return { dashboard: null, error: error.message };
  if (!data) return { dashboard: null, error: null };

  return {
    dashboard: mapDashboardRow(data as Record<string, unknown>),
    error: null,
  };
}

export async function ensureVirtualDashboardForProject(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<{ dashboard: VirtualDashboardRow | null; error: string | null }> {
  const existing = await fetchVirtualDashboardForProject(supabase, projectId);
  if (existing.error) return existing;
  if (existing.dashboard) return existing;

  let widgets: DashboardWidget[] = [];

  const { data: vtables } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select(
      "id, project_id, organization_id, slug, display_name, description, icon, sort_order, created_by, created_at"
    )
    .eq("project_id", projectId)
    .is("deleted_at", null);

  const tables = (vtables ?? []) as VirtualTableRow[];
  const progresTable =
    tables.find(
      (t) => t.slug === "desa" || t.display_name.toLowerCase() === "progres"
    ) ?? tables[0];

  if (progresTable) {
    const { data: cols } = await supabase
      .schema("core_pm")
      .from("virtual_columns")
      .select(
        "id, table_id, slug, display_name, data_type, position, is_required, config"
      )
      .eq("table_id", progresTable.id)
      .order("position");

    if (cols && cols.length > 0) {
      widgets = buildProgresTemplate(progresTable, cols as VirtualColumnRow[]);
    }
  }

  const { data: inserted, error } = await supabase
    .schema("core_pm")
    .from("virtual_dashboards")
    .insert({
      project_id: projectId,
      name: "Dashboard",
      widgets,
      layout_config: { version: 2 },
      created_by: userId,
    })
    .select(
      "id, project_id, name, widgets, layout_config, created_by, created_at, updated_at"
    )
    .single();

  if (error) return { dashboard: null, error: error.message };

  return {
    dashboard: mapDashboardRow(inserted as Record<string, unknown>),
    error: null,
  };
}

export async function fetchVirtualDashboardsForProjects(
  supabase: SupabaseClient,
  projectIds: string[]
): Promise<Record<string, VirtualDashboardRow>> {
  if (projectIds.length === 0) return {};

  const { data, error } = await supabase
    .schema("core_pm")
    .from("virtual_dashboards")
    .select(
      "id, project_id, name, widgets, layout_config, created_by, created_at, updated_at"
    )
    .in("project_id", projectIds);

  if (error || !data) return {};

  const out: Record<string, VirtualDashboardRow> = {};
  for (const row of data) {
    const mapped = mapDashboardRow(row as Record<string, unknown>);
    out[mapped.project_id] = mapped;
  }
  return out;
}
