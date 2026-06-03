"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ensureVirtualDashboardForProject,
  fetchVirtualDashboardForProject,
  parseDashboardWidgets,
} from "@/lib/virtual-dashboard-server";
import {
  dashboardFilterCountKey,
  type DashboardTableBundle,
  type DashboardTableBundleNeeds,
} from "@/lib/dashboard-table-bundle";
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

/** Data widget dashboard: hitung total di DB, chart dari seluruh baris (bukan cap 50). */
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

  const base = () =>
    supabase
      .schema("core_pm")
      .from("virtual_rows")
      .select("id", { count: "exact", head: true })
      .eq("table_id", tableId)
      .is("deleted_at", null);

  const { count: totalRaw, error: totalErr } = await base();
  if (totalErr) return { bundle: null, error: totalErr.message };

  const totalCount = totalRaw ?? 0;
  const filterCounts: Record<string, number> = {};

  for (const f of needs.filters) {
    const { count, error } = await base().filter(
      `payload->>${f.column}`,
      "eq",
      f.value
    );
    if (error) return { bundle: null, error: error.message };
    filterCounts[dashboardFilterCountKey(f.column, f.value)] = count ?? 0;
  }

  let rows: Record<string, unknown>[] = [];
  if (needs.needsChartRows) {
    const r = await fetchVirtualRowsAction(tableId);
    if (r.error) return { bundle: null, error: r.error };
    rows = r.rows;
  } else if (needs.previewLimit > 0) {
    const r = await fetchVirtualRowsAction(tableId, {
      limit: needs.previewLimit,
      offset: 0,
    });
    if (r.error) return { bundle: null, error: r.error };
    rows = r.rows;
  }

  return {
    bundle: { totalCount, filterCounts, rows },
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
