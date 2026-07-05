"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  parseProjectEntity360Profile,
  serializeProjectEntity360Profile,
  type ProjectEntity360Profile,
} from "@/lib/project-entity-360-profile";
import { writeProjectAuditLog } from "./audit-log-actions";
import { RUANG_KERJA_LABEL } from "@/lib/product-labels";

export type Entity360ProfileActionResult = {
  profile: ProjectEntity360Profile;
  error: string | null;
};

export async function fetchProjectEntity360ProfileAction(
  projectId: string
): Promise<Entity360ProfileActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { profile: {}, error: "Supabase tidak dikonfigurasi" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { profile: {}, error: "Belum masuk" };
  }

  const pid = projectId.trim();
  if (!pid) {
    return { profile: {}, error: `${RUANG_KERJA_LABEL} tidak valid` };
  }

  const { data, error } = await supabase
    .schema("core_pm")
    .from("projects")
    .select("entity_360_profile")
    .eq("id", pid)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return { profile: {}, error: error.message };
  }
  if (!data) {
    return { profile: {}, error: "Project tidak ditemukan" };
  }

  return {
    profile: parseProjectEntity360Profile(
      (data as { entity_360_profile?: unknown }).entity_360_profile
    ),
    error: null,
  };
}

export async function updateProjectEntity360ProfileAction(input: {
  projectId: string;
  profile: ProjectEntity360Profile;
}): Promise<{ error: string | null }> {
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

  const pid = input.projectId.trim();
  if (!pid) {
    return { error: `${RUANG_KERJA_LABEL} tidak valid` };
  }

  const payload = serializeProjectEntity360Profile(input.profile);

  const { error } = await supabase.schema("core_pm").rpc(
    "update_project_entity_360_profile",
    {
      p_project_id: pid,
      p_profile: payload,
    }
  );

  if (error) {
    return { error: error.message };
  }

  await writeProjectAuditLog(supabase, {
    projectId: pid,
    actorUserId: user.id,
    action: "project_entity_360_profile_updated",
    entity: "project",
    entityId: pid,
    payload: {
      anchor_table_id: input.profile.anchor_table_id ?? null,
      geometry_holder: input.profile.geometry_holder ?? null,
      panel_sections_count: input.profile.panel_sections?.length ?? 0,
    },
  });

  revalidatePath("/", "layout");
  return { error: null };
}
