"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchOrgProjectForBerkasId,
  fetchOrgProjectForLegalisasiGuId,
  insertAuditLogRow,
} from "@/lib/audit-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  canAdvanceLegalisasi,
  nextLegalisasiStatus,
} from "./plm-legalisasi-wizard";
import type {
  LegalisasiGuFileRow,
  LegalisasiGuHistoryEventKind,
  LegalisasiGuRow,
} from "./plm-legalisasi-types";

export type ActionResult = { error: string | null };

function friendlyLegalisasiUniqueMessage(dbMessage: string): string | null {
  if (!dbMessage) return null;
  if (dbMessage.includes("uq_plm_leg_nomor_gu_kantor_tahun")) {
    return "Nomor GU ini sudah dipakai untuk Kantah dan tahun GU yang sama.";
  }
  if (dbMessage.includes("uq_plm_leg_nib_baru_kantor_tahun")) {
    return "NIB baru ini sudah dipakai untuk Kantah dan tahun NIB yang sama.";
  }
  return null;
}

function legalisasiWriteErrorMessage(err: {
  message: string;
  code?: string;
}): string {
  if (err.code === "23505") {
    const mapped = friendlyLegalisasiUniqueMessage(err.message);
    if (mapped) return mapped;
  }
  return err.message;
}

async function appendLegalisasiHistory(
  supabase: SupabaseClient,
  params: {
    legalisasiGuId: string;
    userId: string;
    eventKind: LegalisasiGuHistoryEventKind;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.schema("plm").from("legalisasi_gu_history").insert({
    legalisasi_gu_id: params.legalisasiGuId,
    actor_user_id: params.userId,
    event_kind: params.eventKind,
    payload: params.payload,
  });
  if (error) {
    console.error("legalisasi_gu_history:", error.message);
  }
}

const PATCHABLE = new Set([
  "kantor_pertanahan",
  "nomor_berkas_legalisasi",
  "tanggal_berkas_legalisasi",
  "penggunaan_tanah",
  "luas_hasil_ukur",
  "tanggal_submit",
  "tanggal_sps",
  "nominal_sps",
  "tanggal_bayar_sps",
  "nomor_gu",
  "tanggal_gu",
  "nib_baru",
  "tanggal_nib",
  "nomor_pbt",
  "tanggal_pbt",
  "tanggal_tte_gu",
  "tanggal_tte_pbt",
  "tanggal_upload_gu",
  "tanggal_upload_pbt",
  "tanggal_persetujuan",
  "tanggal_penyelesaian",
  "catatan",
]);

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Simpan field wizard (whitelist); tanggal kosong diabaikan. */
export async function patchLegalisasiGuAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const id = trimOrNull(formData.get("legalisasi_gu_id"));
  if (!id) return { error: "legalisasi_gu_id kosong" };

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  for (const key of PATCHABLE) {
    const raw = formData.get(key);
    if (raw === null) continue;
    const s = String(raw).trim();
    if (s === "") continue;

    if (key === "luas_hasil_ukur") {
      const n = parseInt(s, 10);
      if (Number.isNaN(n) || n < 0) return { error: "Luas hasil ukur tidak valid" };
      patch[key] = n;
      continue;
    }
    if (key === "nominal_sps") {
      const n = parseFloat(s);
      if (Number.isNaN(n) || n < 0) return { error: "Nominal SPS tidak valid" };
      patch[key] = n;
      continue;
    }
    if (key.startsWith("tanggal_")) {
      if (key === "tanggal_submit") {
        patch[key] = new Date(s).toISOString();
      } else {
        patch[key] = s.length > 10 ? s.slice(0, 10) : s;
      }
      continue;
    }
    patch[key] = s;
  }

  const userKeys = Object.keys(patch).filter((k) => k !== "updated_at");
  if (userKeys.length === 0) {
    return { error: "Tidak ada field yang diisi" };
  }

  const { error } = await supabase
    .schema("plm")
    .from("legalisasi_gu")
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { error: legalisasiWriteErrorMessage(error) };

  const historyPayload: Record<string, unknown> = {};
  for (const k of userKeys) {
    historyPayload[k] = patch[k] ?? null;
  }
  await appendLegalisasiHistory(supabase, {
    legalisasiGuId: id,
    userId: user.id,
    eventKind: "patch",
    payload: { fields: userKeys, values: historyPayload },
  });

  const actx = await fetchOrgProjectForLegalisasiGuId(supabase, id);
  if (actx) {
    await insertAuditLogRow(supabase, {
      organizationId: actx.organizationId,
      projectId: actx.projectId,
      actorUserId: user.id,
      action: "plm.legalisasi_gu.patch",
      entity: "plm.legalisasi_gu",
      entityId: id,
      payload: { fields: userKeys },
    });
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function advanceLegalisasiGuAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const id = trimOrNull(formData.get("legalisasi_gu_id"));
  if (!id) return { error: "legalisasi_gu_id kosong" };

  const { data: row, error: rowErr } = await supabase
    .schema("plm")
    .from("legalisasi_gu")
    .select(
      `id, berkas_id, status_tahap, kantor_pertanahan, nomor_berkas_legalisasi, tanggal_berkas_legalisasi,
       penggunaan_tanah, luas_hasil_ukur, tanggal_submit, tanggal_sps, nominal_sps, tanggal_bayar_sps,
       nomor_gu, tanggal_gu, nib_baru, tanggal_nib, nomor_pbt, tanggal_pbt,
       tanggal_tte_gu, tanggal_tte_pbt, tanggal_upload_gu, tanggal_upload_pbt,
       tanggal_persetujuan, tanggal_penyelesaian, catatan, created_at`
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (rowErr) return { error: rowErr.message };
  if (!row) return { error: "Legalisasi tidak ditemukan" };

  const { data: fileRows, error: fErr } = await supabase
    .schema("plm")
    .from("legalisasi_gu_file")
    .select("id, legalisasi_gu_id, tipe_file, file_name, mime_type, storage_key, uploaded_at, created_at")
    .eq("legalisasi_gu_id", id);

  if (fErr) return { error: fErr.message };

  const check = canAdvanceLegalisasi(row as LegalisasiGuRow, (fileRows ?? []) as LegalisasiGuFileRow[]);
  if (!check.ok) return { error: check.message };

  const next = nextLegalisasiStatus(row.status_tahap);
  if (!next) return { error: "Tidak ada tahap berikutnya" };

  const { error } = await supabase
    .schema("plm")
    .from("legalisasi_gu")
    .update({
      status_tahap: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { error: legalisasiWriteErrorMessage(error) };

  await appendLegalisasiHistory(supabase, {
    legalisasiGuId: id,
    userId: user.id,
    eventKind: "advance",
    payload: { from: row.status_tahap, to: next },
  });

  const actx = await fetchOrgProjectForLegalisasiGuId(supabase, id);
  if (actx) {
    await insertAuditLogRow(supabase, {
      organizationId: actx.organizationId,
      projectId: actx.projectId,
      actorUserId: user.id,
      action: "plm.legalisasi_gu.advance",
      entity: "plm.legalisasi_gu",
      entityId: id,
      payload: { from: row.status_tahap, to: next },
    });
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function createLegalisasiGuDraftAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const berkasId = trimOrNull(formData.get("berkas_id"));
  if (!berkasId) return { error: "berkas_id kosong" };

  const { data: created, error } = await supabase
    .schema("plm")
    .from("legalisasi_gu")
    .insert({
      berkas_id: berkasId,
      status_tahap: "draft",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  if (created?.id) {
    await appendLegalisasiHistory(supabase, {
      legalisasiGuId: created.id,
      userId: user.id,
      eventKind: "draft_created",
      payload: { berkas_id: berkasId },
    });
    const bctx = await fetchOrgProjectForBerkasId(supabase, berkasId);
    if (bctx) {
      await insertAuditLogRow(supabase, {
        organizationId: bctx.organizationId,
        projectId: bctx.projectId,
        actorUserId: user.id,
        action: "plm.legalisasi_gu.draft_created",
        entity: "plm.legalisasi_gu",
        entityId: created.id,
        payload: { berkas_id: berkasId },
      });
    }
  }
  revalidatePath("/", "layout");
  return { error: null };
}

const FILE_TIPES = new Set([
  "hasil_ukur",
  "scan_berkas",
  "scan_sketsa_gu",
  "sps_download",
  "gu_signed",
  "pbt_signed",
  "dokumen_lain",
]);

/** Catat metadata lampiran (Storage upload = F5-4). */
export async function addLegalisasiGuFileAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const legalId = trimOrNull(formData.get("legalisasi_gu_id"));
  const tipe = trimOrNull(formData.get("tipe_file"));
  const fileName = trimOrNull(formData.get("file_name"));

  if (!legalId) return { error: "legalisasi_gu_id kosong" };
  if (!tipe || !FILE_TIPES.has(tipe)) return { error: "tipe_file tidak valid" };
  if (!fileName) return { error: "Nama file wajib diisi" };

  let storageKey = trimOrNull(formData.get("storage_key"));
  if (!storageKey) {
    storageKey = `pending:${crypto.randomUUID()}`;
  } else if (!storageKey.startsWith("pending:") && !storageKey.startsWith(`${legalId}/`)) {
    return { error: "Path Storage harus diawali ID proses legalisasi ini." };
  }

  const { data: fileRow, error } = await supabase
    .schema("plm")
    .from("legalisasi_gu_file")
    .insert({
      legalisasi_gu_id: legalId,
      tipe_file: tipe,
      file_name: fileName,
      mime_type: trimOrNull(formData.get("mime_type")),
      storage_key: storageKey,
      uploaded_by: user.id,
      uploaded_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await appendLegalisasiHistory(supabase, {
    legalisasiGuId: legalId,
    userId: user.id,
    eventKind: "file_added",
    payload: { tipe_file: tipe, file_name: fileName, storage_key: storageKey },
  });

  const fctx = await fetchOrgProjectForLegalisasiGuId(supabase, legalId);
  if (fctx && fileRow?.id) {
    await insertAuditLogRow(supabase, {
      organizationId: fctx.organizationId,
      projectId: fctx.projectId,
      actorUserId: user.id,
      action: "plm.legalisasi_gu_file.insert",
      entity: "plm.legalisasi_gu_file",
      entityId: fileRow.id,
      payload: {
        legalisasi_gu_id: legalId,
        tipe_file: tipe,
        file_name: fileName,
        pending_storage: storageKey.startsWith("pending:"),
      },
    });
  }

  revalidatePath("/", "layout");
  return { error: null };
}
