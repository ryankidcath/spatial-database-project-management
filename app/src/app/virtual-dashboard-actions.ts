"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ensureVirtualDashboardForProject,
  fetchVirtualDashboardForProject,
  parseDashboardWidgets,
} from "@/lib/virtual-dashboard-server";
import { VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE } from "@/lib/virtual-table-import-limits";
import type {
  DashboardWidget,
  VirtualDashboardRow,
} from "./virtual-dashboard-types";
import { fetchVirtualRowsAction } from "./virtual-table-actions";

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

/** Baris widget dashboard — terpisah dari virtual-table-actions agar bundle client ringan. */
export async function fetchDashboardWidgetRowsAction(
  tableId: string
): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  const r = await fetchVirtualRowsAction(tableId, {
    limit: VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE,
    offset: 0,
  });
  return { rows: r.rows, error: r.error };
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
