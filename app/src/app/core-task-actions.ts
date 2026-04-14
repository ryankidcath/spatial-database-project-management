"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CreateProjectTaskResult = { error: string | null };
export type SetTaskDoneResult = { error: string | null };
export type ReopenTaskResult = { error: string | null };

export async function createProjectTaskAction(
  formData: FormData
): Promise<CreateProjectTaskResult> {
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

  const projectId = String(formData.get("project_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const statusIdRaw = String(formData.get("status_id") ?? "").trim();
  const parentIdRaw = String(formData.get("parent_id") ?? "").trim();
  const startsAtRaw = String(formData.get("starts_at") ?? "").trim();
  const dueAtRaw = String(formData.get("due_at") ?? "").trim();

  if (!projectId || !title) {
    return { error: "Project dan judul task wajib diisi" };
  }

  const startsAt = startsAtRaw ? startsAtRaw : null;
  const dueAt = dueAtRaw ? dueAtRaw : null;
  const statusId = statusIdRaw ? statusIdRaw : null;
  const parentId = parentIdRaw ? parentIdRaw : null;

  let sortQuery = supabase
    .schema("core_pm")
    .from("issues")
    .select("sort_order")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1);
  sortQuery = parentId
    ? sortQuery.eq("parent_id", parentId)
    : sortQuery.is("parent_id", null);
  const { data: topRows, error: topErr } = await sortQuery;

  if (topErr) {
    return { error: topErr.message };
  }

  const sortOrder = Number(topRows?.[0]?.sort_order ?? 0) + 10;

  const { error } = await supabase.schema("core_pm").from("issues").insert({
    project_id: projectId,
    status_id: statusId,
    parent_id: parentId,
    title,
    sort_order: sortOrder,
    starts_at: startsAt,
    due_at: dueAt,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function setTaskDoneAction(
  formData: FormData
): Promise<SetTaskDoneResult> {
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

  const issueId = String(formData.get("issue_id") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "").trim();
  if (!issueId || !projectId) {
    return { error: "issue_id atau project_id kosong" };
  }

  const { data: doneStatus, error: doneErr } = await supabase
    .schema("core_pm")
    .from("statuses")
    .select("id")
    .eq("project_id", projectId)
    .eq("category", "done")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (doneErr) {
    return { error: doneErr.message };
  }
  if (!doneStatus?.id) {
    return { error: "Status Done belum tersedia di project ini" };
  }

  const { data: issueTreeRows, error: treeErr } = await supabase
    .schema("core_pm")
    .from("issues")
    .select("id, parent_id")
    .eq("project_id", projectId)
    .is("deleted_at", null);

  if (treeErr) {
    return { error: treeErr.message };
  }

  const byParent = new Map<string, string[]>();
  for (const row of issueTreeRows ?? []) {
    const pid = row.parent_id ?? "";
    const arr = byParent.get(pid) ?? [];
    arr.push(row.id);
    byParent.set(pid, arr);
  }
  const toUpdate = new Set<string>([issueId]);
  const queue = [issueId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = byParent.get(current) ?? [];
    for (const childId of children) {
      if (toUpdate.has(childId)) continue;
      toUpdate.add(childId);
      queue.push(childId);
    }
  }

  const { error } = await supabase
    .schema("core_pm")
    .from("issues")
    .update({ status_id: doneStatus.id })
    .eq("project_id", projectId)
    .in("id", [...toUpdate])
    .is("deleted_at", null);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function reopenTaskAction(
  formData: FormData
): Promise<ReopenTaskResult> {
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

  const issueId = String(formData.get("issue_id") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "").trim();
  if (!issueId || !projectId) {
    return { error: "issue_id atau project_id kosong" };
  }

  const { data: reopenStatus, error: stErr } = await supabase
    .schema("core_pm")
    .from("statuses")
    .select("id")
    .eq("project_id", projectId)
    .in("category", ["todo", "in_progress"])
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (stErr) {
    return { error: stErr.message };
  }
  if (!reopenStatus?.id) {
    return { error: "Status To Do / In Progress belum tersedia di project ini" };
  }

  const { data: issueTreeRows, error: treeErr } = await supabase
    .schema("core_pm")
    .from("issues")
    .select("id, parent_id")
    .eq("project_id", projectId)
    .is("deleted_at", null);

  if (treeErr) {
    return { error: treeErr.message };
  }

  const parentById = new Map<string, string | null>();
  for (const row of issueTreeRows ?? []) {
    parentById.set(row.id, row.parent_id ?? null);
  }

  const toUpdate = new Set<string>();
  let cursor: string | null = issueId;
  while (cursor) {
    if (toUpdate.has(cursor)) break;
    toUpdate.add(cursor);
    cursor = parentById.get(cursor) ?? null;
  }

  const { error } = await supabase
    .schema("core_pm")
    .from("issues")
    .update({ status_id: reopenStatus.id })
    .eq("project_id", projectId)
    .in("id", [...toUpdate])
    .is("deleted_at", null);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
