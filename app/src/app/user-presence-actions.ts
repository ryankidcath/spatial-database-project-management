"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type HeartbeatPresenceResult = { error: string | null };

export async function heartbeatUserPresenceAction(
  formData: FormData
): Promise<HeartbeatPresenceResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const projectId = String(formData.get("project_id") ?? "").trim();
  if (!projectId) return { error: "project_id wajib diisi" };

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .schema("core_pm")
    .from("user_presence")
    .upsert(
      {
        user_id: user.id,
        project_id: projectId,
        last_seen_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "user_id,project_id" }
    );
  if (error) return { error: error.message };
  return { error: null };
}
