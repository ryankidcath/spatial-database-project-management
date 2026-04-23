"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { writeProjectAuditLog } from "./audit-log-actions";

export type UpdateProjectPropertiesResult = { error: string | null };

const MAX_NAME_LEN = 200;
const MAX_DESC_LEN = 4000;
const MAX_LABEL_LEN = 200;

function sanitizeHierarchyLabelsForDb(
  labels: Record<number, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (let d = 0; d < 4; d++) {
    const t = String(labels[d] ?? "").trim();
    if (!t) continue;
    out[String(d)] = t.length > MAX_LABEL_LEN ? t.slice(0, MAX_LABEL_LEN) : t;
  }
  return out;
}

export async function updateProjectPropertiesAction(input: {
  projectId: string;
  name: string;
  description: string;
  hierarchyLabels: Record<number, string>;
}): Promise<UpdateProjectPropertiesResult> {
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
    return { error: "Project tidak valid" };
  }

  let name = input.name.trim();
  if (!name) {
    return { error: "Nama project tidak boleh kosong" };
  }
  if (name.length > MAX_NAME_LEN) {
    name = name.slice(0, MAX_NAME_LEN);
  }

  let description = input.description.trim();
  if (description.length > MAX_DESC_LEN) {
    description = description.slice(0, MAX_DESC_LEN);
  }

  const labelsPayload = sanitizeHierarchyLabelsForDb(input.hierarchyLabels);

  const { error } = await supabase.schema("core_pm").rpc("update_project_properties", {
    p_project_id: pid,
    p_name: name,
    p_description: description,
    p_hierarchy_labels: labelsPayload,
  });

  if (error) {
    return { error: error.message };
  }

  await writeProjectAuditLog(supabase, {
    projectId: pid,
    actorUserId: user.id,
    action: "project_properties_updated",
    entity: "project",
    entityId: pid,
    payload: {
      name,
      description_len: description.length,
      hierarchy_labels_count: Object.keys(labelsPayload).length,
    },
  });

  revalidatePath("/", "layout");
  return { error: null };
}
