import type { SupabaseClient } from "@supabase/supabase-js";

const PAYLOAD_MAX_JSON = 12_000;

export type AuditLogPayload = Record<string, unknown>;

/** Konteks org + project untuk berkas PLM. */
export async function fetchOrgProjectForBerkasId(
  supabase: SupabaseClient,
  berkasId: string
): Promise<{ organizationId: string; projectId: string } | null> {
  const { data: b, error: e1 } = await supabase
    .schema("plm")
    .from("berkas_permohonan")
    .select("project_id")
    .eq("id", berkasId)
    .is("deleted_at", null)
    .maybeSingle();
  if (e1 || !b?.project_id) return null;

  const { data: p, error: e2 } = await supabase
    .schema("core_pm")
    .from("projects")
    .select("organization_id")
    .eq("id", b.project_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (e2 || !p?.organization_id) return null;

  return { organizationId: p.organization_id, projectId: b.project_id };
}

export async function fetchOrgProjectForLegalisasiGuId(
  supabase: SupabaseClient,
  legalisasiGuId: string
): Promise<{ organizationId: string; projectId: string } | null> {
  const { data: lg, error: e1 } = await supabase
    .schema("plm")
    .from("legalisasi_gu")
    .select("berkas_id")
    .eq("id", legalisasiGuId)
    .is("deleted_at", null)
    .maybeSingle();
  if (e1 || !lg?.berkas_id) return null;
  return fetchOrgProjectForBerkasId(supabase, lg.berkas_id);
}

export function compactAuditPayload(payload: AuditLogPayload): AuditLogPayload {
  const s = JSON.stringify(payload);
  if (s.length <= PAYLOAD_MAX_JSON) return payload;
  return {
    _truncated: true,
    _originalLength: s.length,
    preview: s.slice(0, PAYLOAD_MAX_JSON),
  };
}

/**
 * Sisip baris audit (best-effort): gagal insert tidak melempar; log ke konsol server.
 */
export async function insertAuditLogRow(
  supabase: SupabaseClient,
  row: {
    organizationId: string;
    projectId: string | null;
    actorUserId: string;
    action: string;
    entity: string;
    entityId: string;
    payload: AuditLogPayload;
  }
): Promise<void> {
  const { error } = await supabase.schema("core_pm").from("audit_log").insert({
    organization_id: row.organizationId,
    project_id: row.projectId,
    actor_user_id: row.actorUserId,
    action: row.action,
    entity: row.entity,
    entity_id: row.entityId,
    payload: compactAuditPayload(row.payload),
  });
  if (error) {
    console.error("[audit_log]", error.message);
  }
}
