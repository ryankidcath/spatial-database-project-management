"use server";

import { revalidatePath } from "next/cache";
import { insertAuditLogRow, fetchOrgProjectForBerkasId } from "@/lib/audit-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAllowedBerkasStatus } from "./plm-berkas-status";

export type UpdateBerkasStatusResult = { error: string | null };

export async function updateBerkasStatusAction(
  formData: FormData
): Promise<UpdateBerkasStatusResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { error: "Supabase tidak dikonfigurasi" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Belum masuk" };
  }

  const id = String(formData.get("berkas_id") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim();
  const status = statusRaw.toLowerCase();

  if (!id) {
    return { error: "berkas_id kosong" };
  }
  if (!isAllowedBerkasStatus(status)) {
    return { error: "Status tidak diizinkan" };
  }

  const { data: prev, error: prevErr } = await supabase
    .schema("plm")
    .from("berkas_permohonan")
    .select("status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (prevErr) {
    return { error: prevErr.message };
  }
  if (!prev) {
    return { error: "Berkas tidak ditemukan" };
  }

  const ctx = await fetchOrgProjectForBerkasId(supabase, id);

  const { error } = await supabase
    .schema("plm")
    .from("berkas_permohonan")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  if (ctx) {
    await insertAuditLogRow(supabase, {
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      actorUserId: user.id,
      action: "plm.berkas_permohonan.status_update",
      entity: "plm.berkas_permohonan",
      entityId: id,
      payload: { from: prev.status, to: status },
    });
  }

  revalidatePath("/", "layout");
  return { error: null };
}
