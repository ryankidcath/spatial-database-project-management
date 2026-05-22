"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  DashboardWidget,
  VirtualDashboardRow,
} from "./virtual-dashboard-types";
import type { VirtualColumnRow, VirtualTableRow } from "./virtual-table-types";

type ActionResult = { error: string | null };

function parseWidgets(raw: unknown): DashboardWidget[] {
  if (!Array.isArray(raw)) return [];
  return raw as DashboardWidget[];
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

export async function fetchVirtualDashboardAction(
  projectId: string
): Promise<{ dashboard: VirtualDashboardRow | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { dashboard: null, error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { dashboard: null, error: "Belum masuk" };

  const { data, error } = await supabase
    .schema("core_pm")
    .from("virtual_dashboards")
    .select("id, project_id, name, widgets, created_by, created_at, updated_at")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) return { dashboard: null, error: error.message };
  if (!data) return { dashboard: null, error: null };

  const row = data as Record<string, unknown>;
  return {
    dashboard: {
      id: row.id as string,
      project_id: row.project_id as string,
      name: row.name as string,
      widgets: parseWidgets(row.widgets),
      created_by: (row.created_by as string) ?? null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    },
    error: null,
  };
}

export async function ensureVirtualDashboardAction(
  projectId: string
): Promise<{ dashboard: VirtualDashboardRow | null; error: string | null }> {
  const existing = await fetchVirtualDashboardAction(projectId);
  if (existing.error) return existing;
  if (existing.dashboard) return existing;

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { dashboard: null, error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { dashboard: null, error: "Belum masuk" };

  let widgets: DashboardWidget[] = [];

  const { data: vtables } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("id, project_id, organization_id, slug, display_name, description, icon, sort_order, created_by, created_at")
    .eq("project_id", projectId)
    .is("deleted_at", null);

  const tables = (vtables ?? []) as VirtualTableRow[];
  const progresTable =
    tables.find((t) => t.slug === "desa" || t.display_name.toLowerCase() === "progres") ??
    tables[0];

  if (progresTable) {
    const { data: cols } = await supabase
      .schema("core_pm")
      .from("virtual_columns")
      .select("id, table_id, slug, display_name, data_type, position, is_required, config")
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
      created_by: user.id,
    })
    .select("id, project_id, name, widgets, created_by, created_at, updated_at")
    .single();

  if (error) return { dashboard: null, error: error.message };

  const row = inserted as Record<string, unknown>;
  revalidatePath("/", "layout");
  return {
    dashboard: {
      id: row.id as string,
      project_id: row.project_id as string,
      name: row.name as string,
      widgets: parseWidgets(row.widgets),
      created_by: (row.created_by as string) ?? null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    },
    error: null,
  };
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

  if (!dashboardId) return { error: "dashboard_id kosong" };

  let widgets: DashboardWidget[];
  try {
    widgets = JSON.parse(widgetsRaw);
    if (!Array.isArray(widgets)) throw new Error();
  } catch {
    return { error: "widgets bukan JSON array valid" };
  }

  const { error } = await supabase
    .schema("core_pm")
    .from("virtual_dashboards")
    .update({
      widgets,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dashboardId);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { error: null };
}
