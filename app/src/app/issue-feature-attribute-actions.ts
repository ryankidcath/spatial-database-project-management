"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type UpsertIssueFeatureAttributesBatchResult = {
  error: string | null;
  insertedOrUpdated: number;
  failed: number;
  failureSamples: string[];
};
export type UpsertIssueFeatureAttributePayloadResult = { error: string | null };
export type DeleteIssueFeatureAttributeResult = { error: string | null };

type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createServerSupabaseClient>>
>;

async function ensureIssueInProject(
  supabase: ServerSupabase,
  projectId: string,
  issueId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: issue, error: issueErr } = await supabase
    .schema("core_pm")
    .from("issues")
    .select("id")
    .eq("id", issueId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (issueErr) return { ok: false, error: issueErr.message };
  if (!issue?.id) return { ok: false, error: "Unit kerja tidak ditemukan pada project ini" };
  return { ok: true };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function parseSimpleCsv(raw: string): Array<Record<string, string>> {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const rec: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      if (!key) continue;
      rec[key] = vals[j] ?? "";
    }
    rows.push(rec);
  }
  return rows;
}

export async function upsertIssueFeatureAttributesCsvAction(
  formData: FormData
): Promise<UpsertIssueFeatureAttributesBatchResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      error: "Supabase tidak dikonfigurasi",
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "Belum masuk",
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }

  const projectId = String(formData.get("project_id") ?? "").trim();
  const issueId = String(formData.get("issue_id") ?? "").trim();
  const csvRaw = String(formData.get("attributes_csv") ?? "");
  const keyColumnRaw = String(formData.get("key_column") ?? "feature_key").trim();
  if (!projectId || !issueId || !csvRaw.trim()) {
    return {
      error: "project_id, issue_id, dan attributes_csv wajib diisi",
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }

  const issueCheck = await ensureIssueInProject(supabase, projectId, issueId);
  if (!issueCheck.ok) {
    return {
      error: issueCheck.error,
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }

  const rows = parseSimpleCsv(csvRaw);
  if (rows.length === 0) {
    return {
      error: "CSV kosong atau tidak valid. Pastikan ada header dan minimal 1 baris.",
      insertedOrUpdated: 0,
      failed: 0,
      failureSamples: [],
    };
  }

  let insertedOrUpdated = 0;
  let failed = 0;
  const failureSamples: string[] = [];
  const keyColumn = keyColumnRaw || "feature_key";

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const featureKey = String(row[keyColumn] ?? "").trim();
    if (!featureKey) {
      failed++;
      if (failureSamples.length < 10) {
        failureSamples.push(`#${i + 1}: key '${keyColumn}' kosong`);
      }
      continue;
    }

    const payload: Record<string, unknown> = { ...row };
    delete payload[keyColumn];

    const { error: upErr } = await supabase
      .schema("spatial")
      .from("issue_feature_attributes")
      .upsert(
        {
          issue_id: issueId,
          feature_key: featureKey,
          payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "issue_id,feature_key" }
      );
    if (upErr) {
      failed++;
      if (failureSamples.length < 10) {
        failureSamples.push(`#${i + 1}/${featureKey}: ${upErr.message}`);
      }
      continue;
    }
    insertedOrUpdated++;
  }

  revalidatePath("/", "layout");
  return { error: null, insertedOrUpdated, failed, failureSamples };
}

export async function upsertIssueFeatureAttributePayloadAction(
  formData: FormData
): Promise<UpsertIssueFeatureAttributePayloadResult> {
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
  const issueId = String(formData.get("issue_id") ?? "").trim();
  const featureKey = String(formData.get("feature_key") ?? "").trim();
  const propertiesRaw = String(formData.get("properties_json") ?? "").trim();
  if (!projectId || !issueId || !featureKey) {
    return { error: "project_id, issue_id, dan feature_key wajib diisi" };
  }

  let payload: Record<string, unknown> = {};
  if (propertiesRaw) {
    try {
      const parsed = JSON.parse(propertiesRaw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { error: "properties_json harus object JSON" };
      }
      payload = parsed as Record<string, unknown>;
    } catch {
      return { error: "properties_json tidak valid" };
    }
  }

  const issueCheck = await ensureIssueInProject(supabase, projectId, issueId);
  if (!issueCheck.ok) return { error: issueCheck.error };

  const { error: upErr } = await supabase
    .schema("spatial")
    .from("issue_feature_attributes")
    .upsert(
      {
        issue_id: issueId,
        feature_key: featureKey,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "issue_id,feature_key" }
    );
  if (upErr) return { error: upErr.message };

  revalidatePath("/", "layout");
  return { error: null };
}

export async function deleteIssueFeatureAttributeAction(
  formData: FormData
): Promise<DeleteIssueFeatureAttributeResult> {
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
  const issueId = String(formData.get("issue_id") ?? "").trim();
  const featureKey = String(formData.get("feature_key") ?? "").trim();
  if (!projectId || !issueId || !featureKey) {
    return { error: "project_id, issue_id, dan feature_key wajib diisi" };
  }

  const issueCheck = await ensureIssueInProject(supabase, projectId, issueId);
  if (!issueCheck.ok) return { error: issueCheck.error };

  const { error: delErr } = await supabase
    .schema("spatial")
    .from("issue_feature_attributes")
    .delete()
    .eq("issue_id", issueId)
    .eq("feature_key", featureKey);

  if (delErr) return { error: delErr.message };

  revalidatePath("/", "layout");
  return { error: null };
}

