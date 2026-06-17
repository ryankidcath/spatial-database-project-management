"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  NOTIFICATION_PREFERENCE_CATEGORIES,
  NOTIFICATION_PREFERENCE_DEFAULTS,
  NOTIFICATION_SCOPE_CATEGORIES,
  type NotificationPreferenceCategory,
  type NotificationScopeCategory,
  type NotificationScopeRow,
  type VirtualColumnScopeOption,
  type VirtualTableScopeOption,
} from "./workspace-notification-types";
import { flushDueCellNotifications } from "./workspace-notification-helpers";

export type NotificationPreferenceRow = {
  category: NotificationPreferenceCategory;
  enabled: boolean;
};

export type NotificationPreferencesResult = {
  error: string | null;
  preferences: NotificationPreferenceRow[];
  scopes: NotificationScopeRow[];
  tables: VirtualTableScopeOption[];
};

export async function fetchNotificationPreferencesAction(): Promise<NotificationPreferencesResult> {
  const empty = {
    error: null as string | null,
    preferences: [] as NotificationPreferenceRow[],
    scopes: [] as NotificationScopeRow[],
    tables: [] as VirtualTableScopeOption[],
  };

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ...empty, error: "Supabase tidak dikonfigurasi" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...empty, error: "Belum masuk" };

  await flushDueCellNotifications(supabase);

  const [prefsRes, scopesRes, tablesRes] = await Promise.all([
    supabase
      .schema("core_pm")
      .from("user_notification_preferences")
      .select("category, enabled")
      .eq("user_id", user.id),
    supabase
      .schema("core_pm")
      .from("user_notification_scopes")
      .select("category, virtual_table_id, column_slug")
      .eq("user_id", user.id),
    supabase
      .schema("core_pm")
      .from("virtual_tables")
      .select("id, display_name")
      .is("deleted_at", null)
      .order("display_name"),
  ]);

  if (prefsRes.error) return { ...empty, error: prefsRes.error.message };
  if (scopesRes.error) return { ...empty, error: scopesRes.error.message };
  if (tablesRes.error) return { ...empty, error: tablesRes.error.message };

  const saved = new Map(
    (prefsRes.data ?? []).map((r: { category: string; enabled: boolean }) => [
      r.category,
      r.enabled,
    ])
  );

  const preferences = NOTIFICATION_PREFERENCE_CATEGORIES.map((category) => ({
    category,
    enabled: saved.has(category)
      ? Boolean(saved.get(category))
      : NOTIFICATION_PREFERENCE_DEFAULTS[category],
  }));

  const scopes: NotificationScopeRow[] = (scopesRes.data ?? []).map(
    (r: {
      category: string;
      virtual_table_id: string;
      column_slug: string;
    }) => ({
      category: r.category as NotificationScopeCategory,
      virtualTableId: r.virtual_table_id,
      columnSlug: r.column_slug ?? "",
    })
  );

  const tables: VirtualTableScopeOption[] = (tablesRes.data ?? []).map(
    (r: { id: string; display_name: string }) => ({
      id: r.id,
      displayName: r.display_name,
    })
  );

  return { error: null, preferences, scopes, tables };
}

export async function fetchScopeColumnOptionsAction(
  tableId: string
): Promise<{ columns: VirtualColumnScopeOption[]; error: string | null }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { columns: [], error: "Supabase tidak dikonfigurasi" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { columns: [], error: "Belum masuk" };

  if (!tableId.trim()) return { columns: [], error: "table_id kosong" };

  const { data, error } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("slug, display_name")
    .eq("table_id", tableId)
    .order("position");

  if (error) return { columns: [], error: error.message };

  return {
    columns: (data ?? []).map((c: { slug: string; display_name: string }) => ({
      slug: c.slug,
      displayName: c.display_name,
    })),
    error: null,
  };
}

export async function saveNotificationPreferencesAction(
  formData: FormData
): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  let parsedPrefs: unknown;
  let parsedScopes: unknown;
  try {
    parsedPrefs = JSON.parse(String(formData.get("preferences") ?? "[]"));
    parsedScopes = JSON.parse(String(formData.get("scopes") ?? "[]"));
  } catch {
    return { error: "JSON preferensi tidak valid" };
  }

  if (!Array.isArray(parsedPrefs)) {
    return { error: "preferences harus berupa array" };
  }
  if (!Array.isArray(parsedScopes)) {
    return { error: "scopes harus berupa array" };
  }

  const prefRows: { user_id: string; category: string; enabled: boolean }[] =
    [];
  for (const item of parsedPrefs) {
    if (!item || typeof item !== "object") continue;
    const category = String(
      (item as { category?: unknown }).category ?? ""
    ).trim();
    if (
      !NOTIFICATION_PREFERENCE_CATEGORIES.includes(
        category as NotificationPreferenceCategory
      )
    ) {
      continue;
    }
    prefRows.push({
      user_id: user.id,
      category,
      enabled: Boolean((item as { enabled?: unknown }).enabled),
    });
  }

  if (prefRows.length === 0) {
    return { error: "Tidak ada preferensi yang valid" };
  }

  const scopeRows: {
    user_id: string;
    category: string;
    virtual_table_id: string;
    column_slug: string;
  }[] = [];
  const scopeKeys = new Set<string>();

  for (const item of parsedScopes) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const category = String(raw.category ?? "").trim();
    const virtualTableId = String(
      raw.virtualTableId ?? raw.virtual_table_id ?? ""
    ).trim();
    const columnSlug = String(
      raw.columnSlug ?? raw.column_slug ?? ""
    ).trim();

    if (
      !NOTIFICATION_SCOPE_CATEGORIES.includes(
        category as NotificationScopeCategory
      ) ||
      !virtualTableId
    ) {
      continue;
    }

    if (category !== "cell_value_changed" && columnSlug) {
      continue;
    }

    const key = `${category}:${virtualTableId}:${columnSlug}`;
    if (scopeKeys.has(key)) continue;
    scopeKeys.add(key);

    scopeRows.push({
      user_id: user.id,
      category,
      virtual_table_id: virtualTableId,
      column_slug: columnSlug,
    });
  }

  const { error: prefErr } = await supabase
    .schema("core_pm")
    .from("user_notification_preferences")
    .upsert(prefRows, { onConflict: "user_id,category" });

  if (prefErr) return { error: prefErr.message };

  const { error: delErr } = await supabase
    .schema("core_pm")
    .from("user_notification_scopes")
    .delete()
    .eq("user_id", user.id);

  if (delErr) return { error: delErr.message };

  if (scopeRows.length > 0) {
    const { error: scopeErr } = await supabase
      .schema("core_pm")
      .from("user_notification_scopes")
      .insert(scopeRows);

    if (scopeErr) return { error: scopeErr.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function flushDueCellNotificationsAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return;
  await flushDueCellNotifications(supabase);
}
