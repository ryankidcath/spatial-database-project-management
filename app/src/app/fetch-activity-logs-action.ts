"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActivityLogRow } from "./activity-log-types";

const AUDIT_LOG_SELECT =
  "id, organization_id, project_id, actor_user_id, action, entity, entity_id, payload, created_at";

export async function fetchActivityLogsAction(
  organizationId: string,
  scopedProjectIds: string[]
): Promise<{ error: string | null; logs: ActivityLogRow[] }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi", logs: [] };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk", logs: [] };

  const auditLogFetches = [];

  if (scopedProjectIds.length > 0) {
    auditLogFetches.push(
      supabase
        .schema("core_pm")
        .from("audit_log")
        .select(AUDIT_LOG_SELECT)
        .in("project_id", scopedProjectIds)
        .order("created_at", { ascending: false })
        .limit(400)
    );
  }

  auditLogFetches.push(
    supabase
      .schema("core_pm")
      .from("audit_log")
      .select(AUDIT_LOG_SELECT)
      .eq("organization_id", organizationId)
      .is("project_id", null)
      .order("created_at", { ascending: false })
      .limit(150)
  );

  const auditLogResults = await Promise.all(auditLogFetches);

  type AuditRaw = {
    id: string;
    organization_id: string;
    project_id: string | null;
    actor_user_id: string;
    action: string;
    entity: string;
    entity_id: string;
    payload: Record<string, unknown> | null;
    created_at: string;
  };

  const auditById = new Map<string, AuditRaw>();
  for (const res of auditLogResults) {
    if (res.error) return { error: res.error.message, logs: [] };
    for (const row of res.data ?? []) {
      const r = row as AuditRaw;
      auditById.set(r.id, r);
    }
  }

  const auditLogsBase = [...auditById.values()]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 500);

  const actorUserIds = [...new Set(auditLogsBase.map((l) => l.actor_user_id))];
  const { data: profilesRaw, error: profilesError } =
    actorUserIds.length > 0
      ? await supabase
          .schema("core_pm")
          .from("profiles")
          .select("id, display_name")
          .in("id", actorUserIds)
      : { data: [] as Array<{ id: string; display_name: string | null }>, error: null };

  if (profilesError) return { error: profilesError.message, logs: [] };

  const displayNameByUserId = new Map(
    ((profilesRaw ?? []) as Array<{ id: string; display_name: string | null }>).map(
      (p) => [p.id, p.display_name]
    )
  );

  const logs: ActivityLogRow[] = auditLogsBase.map((l) => ({
    id: l.id,
    organization_id: l.organization_id,
    project_id: l.project_id,
    actor_user_id: l.actor_user_id,
    actor_display_name: displayNameByUserId.get(l.actor_user_id) ?? null,
    action: l.action,
    entity: l.entity,
    entity_id: l.entity_id,
    payload: l.payload ?? {},
    created_at: l.created_at,
  }));

  return { error: null, logs };
}
