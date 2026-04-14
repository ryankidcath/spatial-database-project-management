"use server";

import { revalidatePath } from "next/cache";
import { insertAuditLogRow } from "@/lib/audit-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SetModuleResult = { error: string | null };

export async function setOrganizationModuleAction(
  formData: FormData
): Promise<SetModuleResult> {
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

  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const moduleCode = String(formData.get("module_code") ?? "").trim();
  const enabledRaw = String(formData.get("enabled") ?? "");
  const enabled = enabledRaw === "true" || enabledRaw === "on";

  if (!organizationId || !moduleCode) {
    return { error: "organization_id atau module_code kosong" };
  }

  const { error } = await supabase.schema("core_pm").rpc(
    "set_organization_module_enabled",
    {
      p_organization_id: organizationId,
      p_module_code: moduleCode,
      p_enabled: enabled,
    }
  );

  if (error) {
    return { error: error.message };
  }

  await insertAuditLogRow(supabase, {
    organizationId: organizationId,
    projectId: null,
    actorUserId: user.id,
    action: "core_pm.organization_modules.set",
    entity: "core_pm.organization_modules",
    entityId: organizationId,
    payload: { module_code: moduleCode.toLowerCase(), enabled },
  });

  revalidatePath("/", "layout");
  return { error: null };
}
