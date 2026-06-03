import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DashboardWidget,
  VirtualDashboardRow,
} from "@/app/virtual-dashboard-types";
import type { VirtualColumnRow, VirtualTableRow } from "@/app/virtual-table-types";

export function parseDashboardWidgets(raw: unknown): DashboardWidget[] {
  if (!Array.isArray(raw)) return [];
  return raw as DashboardWidget[];
}

function mapDashboardRow(row: Record<string, unknown>): VirtualDashboardRow {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    name: row.name as string,
    widgets: parseDashboardWidgets(row.widgets),
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
  const kecCol = selectCols.find((c) => c.slug === "kecamatan") ?? selectCols[0];
  const statusCol =
    selectCols.find((c) => c.slug !== kecCol?.slug && c.slug.includes("copy")) ??
    selectCols.find((c) => c.slug !== kecCol?.slug) ??
    selectCols[1];

  const widgets: DashboardWidget[] = [
    {
      id: crypto.randomUUID(),
      type: "stat",
      title: "Total baris",
      w: 1,
      config: { table_id: table.id },
    },
  ];

  if (statusCol) {
    widgets.push({
      id: crypto.randomUUID(),
      type: "status_pie",
      title: statusCol.display_name,
      w: 2,
      config: { table_id: table.id, status_column: statusCol.slug },
    });
  }

  if (kecCol && statusCol) {
    widgets.push({
      id: crypto.randomUUID(),
      type: "bar_by_group",
      title: `Done per ${kecCol.display_name}`,
      w: 4,
      config: {
        table_id: table.id,
        group_column: kecCol.slug,
        status_column: statusCol.slug,
        count_when: "Done",
      },
    });
  }

  return widgets;
}

export async function fetchVirtualDashboardForProject(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ dashboard: VirtualDashboardRow | null; error: string | null }> {
  const { data, error } = await supabase
    .schema("core_pm")
    .from("virtual_dashboards")
    .select("id, project_id, name, widgets, created_by, created_at, updated_at")
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
      created_by: userId,
    })
    .select("id, project_id, name, widgets, created_by, created_at, updated_at")
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
    .select("id, project_id, name, widgets, created_by, created_at, updated_at")
    .in("project_id", projectIds);

  if (error || !data) return {};

  const out: Record<string, VirtualDashboardRow> = {};
  for (const row of data) {
    const mapped = mapDashboardRow(row as Record<string, unknown>);
    out[mapped.project_id] = mapped;
  }
  return out;
}
