"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CreateProjectTaskResult = { error: string | null };
export type SetTaskDoneResult = { error: string | null };
export type ReopenTaskResult = { error: string | null };
export type UpdateTaskProgressResult = { error: string | null };
export type DeleteTaskResult = { error: string | null };
export type DeleteProjectResult = { error: string | null };
export type UpdateTaskLastNoteResult = { error: string | null };
type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createServerSupabaseClient>>
>;

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

function toMillis(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function minIso(values: Array<string | null | undefined>): string | null {
  let best: { iso: string; ms: number } | null = null;
  for (const v of values) {
    if (!v) continue;
    const ms = toMillis(v);
    if (ms == null) continue;
    if (!best || ms < best.ms) best = { iso: v, ms };
  }
  return best?.iso ?? null;
}

async function syncIssueAndProjectStartsAt(
  supabase: ServerSupabase,
  projectId: string,
  seedIssueId: string
): Promise<string | null> {
  const { data: rows, error: rowsErr } = await supabase
    .schema("core_pm")
    .from("issues")
    .select("id, parent_id, starts_at")
    .eq("project_id", projectId)
    .is("deleted_at", null);
  if (rowsErr) return rowsErr.message;

  const byId = new Map(
    (rows ?? []).map((r) => [r.id, { parentId: r.parent_id as string | null, startsAt: r.starts_at as string | null }])
  );
  const childrenByParent = new Map<string, string[]>();
  for (const r of rows ?? []) {
    if (!r.parent_id) continue;
    const arr = childrenByParent.get(r.parent_id) ?? [];
    arr.push(r.id);
    childrenByParent.set(r.parent_id, arr);
  }

  const memo = new Map<string, string | null>();
  const walkMinStart = (issueId: string): string | null => {
    if (memo.has(issueId)) return memo.get(issueId) ?? null;
    const own = byId.get(issueId)?.startsAt ?? null;
    const childIds = childrenByParent.get(issueId) ?? [];
    const childStarts = childIds.map((cid) => walkMinStart(cid));
    const min = minIso([own, ...childStarts]);
    memo.set(issueId, min);
    return min;
  };

  const ancestorIds: string[] = [];
  let cursor = byId.get(seedIssueId)?.parentId ?? null;
  while (cursor) {
    ancestorIds.push(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }

  for (const ancestorId of ancestorIds) {
    const nextStart = walkMinStart(ancestorId);
    const currentStart = byId.get(ancestorId)?.startsAt ?? null;
    if (nextStart === currentStart) continue;
    const { error: upErr } = await supabase
      .schema("core_pm")
      .from("issues")
      .update({ starts_at: nextStart })
      .eq("id", ancestorId)
      .eq("project_id", projectId)
      .is("deleted_at", null);
    if (upErr) return upErr.message;
    const node = byId.get(ancestorId);
    if (node) node.startsAt = nextStart;
  }

  const projectStart = minIso([...byId.values()].map((v) => v.startsAt));
  const { error: projErr } = await supabase
    .schema("core_pm")
    .from("projects")
    .update({ starts_at: projectStart })
    .eq("id", projectId)
    .is("deleted_at", null);
  if (projErr) {
    const msg = (projErr.message ?? "").toLowerCase();
    // Backward-compatible: if migration for core_pm.projects.starts_at is not applied yet,
    // keep issue/ancestor sync working and skip project-level sync temporarily.
    if (
      msg.includes("starts_at") &&
      (msg.includes("schema cache") || msg.includes("column"))
    ) {
      return null;
    }
    return projErr.message;
  }

  return null;
}

async function markIssueDoneWithHierarchy(
  supabase: ServerSupabase,
  projectId: string,
  issueId: string
): Promise<string | null> {
  const { data: doneStatus, error: doneErr } = await supabase
    .schema("core_pm")
    .from("statuses")
    .select("id")
    .eq("project_id", projectId)
    .eq("category", "done")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (doneErr) return doneErr.message;
  if (!doneStatus?.id) return "Status Done belum tersedia di project ini";

  const { data: doneStatuses, error: doneListErr } = await supabase
    .schema("core_pm")
    .from("statuses")
    .select("id")
    .eq("project_id", projectId)
    .eq("category", "done");
  if (doneListErr) return doneListErr.message;
  const doneStatusIds = new Set((doneStatuses ?? []).map((s) => s.id));

  const { data: issueTreeRows, error: treeErr } = await supabase
    .schema("core_pm")
    .from("issues")
    .select("id, parent_id")
    .eq("project_id", projectId)
    .is("deleted_at", null);
  if (treeErr) return treeErr.message;

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

  const { error: markErr } = await supabase
    .schema("core_pm")
    .from("issues")
    .update({ status_id: doneStatus.id })
    .eq("project_id", projectId)
    .in("id", [...toUpdate])
    .is("deleted_at", null);
  if (markErr) return markErr.message;

  // Auto-close ancestors when all their direct children are done.
  const { data: afterRows, error: afterErr } = await supabase
    .schema("core_pm")
    .from("issues")
    .select("id, parent_id, status_id")
    .eq("project_id", projectId)
    .is("deleted_at", null);
  if (afterErr) return afterErr.message;

  const childrenByParent = new Map<string, string[]>();
  const parentById = new Map<string, string | null>();
  const statusById = new Map<string, string | null>();
  for (const row of afterRows ?? []) {
    parentById.set(row.id, row.parent_id ?? null);
    statusById.set(row.id, row.status_id ?? null);
    const pid = row.parent_id ?? "";
    const arr = childrenByParent.get(pid) ?? [];
    arr.push(row.id);
    childrenByParent.set(pid, arr);
  }

  const toPromote = new Set<string>();
  const seeds = [...toUpdate];
  for (const seed of seeds) {
    let parent = parentById.get(seed) ?? null;
    while (parent) {
      const children = childrenByParent.get(parent) ?? [];
      const allChildrenDone =
        children.length > 0 &&
        children.every((cid) => {
          const st = statusById.get(cid);
          return Boolean(st && doneStatusIds.has(st));
        });
      if (!allChildrenDone) break;
      if (!toPromote.has(parent)) {
        toPromote.add(parent);
        statusById.set(parent, doneStatus.id);
      }
      parent = parentById.get(parent) ?? null;
    }
  }

  if (toPromote.size > 0) {
    const { error: promoteErr } = await supabase
      .schema("core_pm")
      .from("issues")
      .update({ status_id: doneStatus.id })
      .eq("project_id", projectId)
      .in("id", [...toPromote])
      .is("deleted_at", null);
    if (promoteErr) return promoteErr.message;
  }

  return null;
}

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
  const progressTargetRaw = String(formData.get("progress_target") ?? "");
  const progressActualRaw = String(formData.get("progress_actual") ?? "");
  const issueWeightRaw = String(formData.get("issue_weight") ?? "");

  if (!projectId || !title) {
    return { error: "Project dan judul unit kerja wajib diisi" };
  }

  const startsAt = startsAtRaw ? startsAtRaw : null;
  const dueAt = dueAtRaw ? dueAtRaw : null;
  const statusId = statusIdRaw ? statusIdRaw : null;
  const parentId = parentIdRaw ? parentIdRaw : null;
  const progressTarget = parseOptionalNumber(progressTargetRaw);
  const progressActual = parseOptionalNumber(progressActualRaw);
  const issueWeightParsed = parseOptionalNumber(issueWeightRaw);
  if (Number.isNaN(progressTarget) || Number.isNaN(progressActual)) {
    return { error: "Target/Realisasi harus angka >= 0 atau kosong" };
  }
  if (Number.isNaN(issueWeightParsed) || (issueWeightParsed ?? 1) <= 0) {
    return { error: "Bobot harus angka > 0" };
  }
  const issueWeight = issueWeightParsed ?? 1;

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

  const { data: insertedIssue, error } = await supabase
    .schema("core_pm")
    .from("issues")
    .insert({
      project_id: projectId,
      status_id: statusId,
      parent_id: parentId,
      title,
      sort_order: sortOrder,
      starts_at: startsAt,
      due_at: dueAt,
      progress_target: progressTarget,
      progress_actual: progressActual,
      issue_weight: issueWeight,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  if (startsAt && insertedIssue?.id) {
    const syncErr = await syncIssueAndProjectStartsAt(
      supabase,
      projectId,
      insertedIssue.id
    );
    if (syncErr) {
      return { error: syncErr };
    }
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function updateTaskProgressAction(
  formData: FormData
): Promise<UpdateTaskProgressResult> {
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
  const progressTargetRaw = String(formData.get("progress_target") ?? "");
  const progressActualRaw = String(formData.get("progress_actual") ?? "");
  const issueWeightRaw = String(formData.get("issue_weight") ?? "");
  const progressTarget = parseOptionalNumber(progressTargetRaw);
  const progressActual = parseOptionalNumber(progressActualRaw);
  const issueWeightParsed = parseOptionalNumber(issueWeightRaw);
  if (Number.isNaN(progressTarget) || Number.isNaN(progressActual)) {
    return { error: "Target/Realisasi harus angka >= 0 atau kosong" };
  }
  if (Number.isNaN(issueWeightParsed) || (issueWeightParsed ?? 1) <= 0) {
    return { error: "Bobot harus angka > 0" };
  }
  const issueWeight = issueWeightParsed ?? 1;

  const { error } = await supabase
    .schema("core_pm")
    .from("issues")
    .update({
      progress_target: progressTarget,
      progress_actual: progressActual,
      issue_weight: issueWeight,
    })
    .eq("id", issueId)
    .eq("project_id", projectId)
    .is("deleted_at", null);
  if (error) {
    return { error: error.message };
  }

  if (
    progressTarget !== null &&
    progressActual !== null &&
    progressTarget === progressActual
  ) {
    const markErr = await markIssueDoneWithHierarchy(supabase, projectId, issueId);
    if (markErr) {
      return { error: markErr };
    }
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

  const markErr = await markIssueDoneWithHierarchy(supabase, projectId, issueId);
  if (markErr) return { error: markErr };

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

export async function deleteTaskAction(
  formData: FormData
): Promise<DeleteTaskResult> {
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

  const { data: deletedCount, error } = await supabase
    .schema("core_pm")
    .rpc("delete_issue_soft", {
      p_project_id: projectId,
      p_issue_id: issueId,
    });
  if (error) {
    return { error: error.message };
  }
  if (!deletedCount || Number(deletedCount) <= 0) {
    return {
      error: "Unit kerja tidak ditemukan atau sudah terhapus sebelumnya.",
    };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function deleteProjectAction(
  formData: FormData
): Promise<DeleteProjectResult> {
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
  if (!projectId) {
    return { error: "project_id kosong" };
  }

  const { data: myMembership, error: membershipErr } = await supabase
    .schema("core_pm")
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipErr) {
    return { error: membershipErr.message };
  }
  if (!myMembership || myMembership.role !== "owner") {
    return { error: "Hanya owner project yang bisa menghapus project." };
  }

  const { error } = await supabase
    .schema("core_pm")
    .rpc("delete_project_soft", { p_project_id: projectId });
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function updateTaskLastNoteAction(
  formData: FormData
): Promise<UpdateTaskLastNoteResult> {
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

  const rawNote = String(formData.get("last_note") ?? "");
  const lastNote = rawNote.trim();
  const maxLen = 500;
  if (lastNote.length > maxLen) {
    return { error: `Catatan maksimal ${maxLen} karakter` };
  }

  const payload = lastNote
    ? {
        last_note: lastNote,
        last_note_at: new Date().toISOString(),
        last_note_by: user.id,
      }
    : {
        last_note: null,
        last_note_at: null,
        last_note_by: null,
      };

  const { error } = await supabase
    .schema("core_pm")
    .from("issues")
    .update(payload)
    .eq("id", issueId)
    .eq("project_id", projectId)
    .is("deleted_at", null);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
