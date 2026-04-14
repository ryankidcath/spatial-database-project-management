"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ActionResult = { error: string | null };

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

const PENGUKURAN_PATCHABLE = new Set([
  "nomor_surat_tugas",
  "tanggal_surat_tugas",
  "nomor_surat_pemberitahuan",
  "tanggal_surat_pemberitahuan",
  "tanggal_janji_ukur",
  "tanggal_realisasi_ukur",
  "status",
  "catatan",
]);

const STATUS_OK = new Set(["dijadwalkan", "diukur", "olah_cad", "selesai"]);

export async function patchPengukuranLapanganAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const id = trimOrNull(formData.get("pengukuran_id"));
  if (!id) return { error: "pengukuran_id kosong" };

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  for (const key of PENGUKURAN_PATCHABLE) {
    const raw = formData.get(key);
    if (raw === null) continue;
    const s = String(raw).trim();
    if (s === "") continue;
    if (key === "status") {
      if (!STATUS_OK.has(s)) return { error: "Status pengukuran tidak valid" };
      patch[key] = s;
      continue;
    }
    if (key.startsWith("tanggal_")) {
      patch[key] = s.length > 10 ? s.slice(0, 10) : s;
      continue;
    }
    patch[key] = s;
  }

  const nextStatus = patch.status as string | undefined;
  if (nextStatus === "diukur" || nextStatus === "olah_cad" || nextStatus === "selesai") {
    const { count, error: cErr } = await supabase
      .schema("plm")
      .from("pengukuran_surveyor")
      .select("id", { count: "exact", head: true })
      .eq("pengukuran_id", id);
    if (cErr) return { error: cErr.message };
    if ((count ?? 0) < 1) {
      return {
        error:
          "Minimal satu surveyor sebelum status diukur / olah_cad / selesai (§3.10).",
      };
    }
  }

  if (nextStatus === "selesai") {
    const { count, error: dErr } = await supabase
      .schema("plm")
      .from("pengukuran_dokumen")
      .select("id", { count: "exact", head: true })
      .eq("pengukuran_id", id)
      .eq("tipe_dokumen", "hasil_cad");
    if (dErr) return { error: dErr.message };
    if ((count ?? 0) < 1) {
      return {
        error:
          "Dokumen tipe hasil_cad wajib ada sebelum status selesai (§3.10).",
      };
    }
  }

  const userKeys = Object.keys(patch).filter((k) => k !== "updated_at");
  if (userKeys.length === 0) return { error: "Tidak ada field yang diisi" };

  const { error } = await supabase
    .schema("plm")
    .from("pengukuran_lapangan")
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: null };
}

export async function createPengukuranLapanganAction(
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

  const { data: pis, error: pErr } = await supabase
    .schema("plm")
    .from("permohonan_informasi_spasial")
    .select("id, status_hasil")
    .eq("berkas_id", berkasId)
    .is("deleted_at", null)
    .maybeSingle();

  if (pErr) return { error: pErr.message };
  if (!pis) {
    return {
      error:
        "Belum ada permohonan informasi spasial untuk berkas ini. Tambahkan data di DB atau seed.",
    };
  }
  if (pis.status_hasil !== "layak_lanjut") {
    return {
      error:
        "Pengukuran hanya boleh dibuat jika status informasi spasial = layak_lanjut (§3.10).",
    };
  }

  const { error } = await supabase.schema("plm").from("pengukuran_lapangan").insert({
    berkas_id: berkasId,
    permohonan_informasi_spasial_id: pis.id,
    status: "dijadwalkan",
  });

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: null };
}

export async function addPengukuranSurveyorAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const pengId = trimOrNull(formData.get("pengukuran_id"));
  const peran = trimOrNull(formData.get("peran")) ?? "anggota";
  if (!pengId) return { error: "pengukuran_id kosong" };
  if (peran !== "ketua" && peran !== "anggota")
    return { error: "Peran surveyor tidak valid" };

  const { error } = await supabase.schema("plm").from("pengukuran_surveyor").insert({
    pengukuran_id: pengId,
    peran,
    surveyor_user_id: null,
  });

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: null };
}

export async function deletePengukuranSurveyorAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const sid = trimOrNull(formData.get("surveyor_id"));
  if (!sid) return { error: "surveyor_id kosong" };

  const { error } = await supabase
    .schema("plm")
    .from("pengukuran_surveyor")
    .delete()
    .eq("id", sid);

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: null };
}

export async function addPengukuranAlatAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const pengId = trimOrNull(formData.get("pengukuran_id"));
  const alatId = trimOrNull(formData.get("alat_id"));
  const peranAlat = trimOrNull(formData.get("peran_alat")) ?? "base";
  if (!pengId) return { error: "pengukuran_id kosong" };
  if (!alatId) return { error: "alat_id kosong" };
  if (!["base", "rover", "unit_1", "unit_2"].includes(peranAlat))
    return { error: "peran_alat tidak valid" };

  const { count, error: cErr } = await supabase
    .schema("plm")
    .from("pengukuran_alat")
    .select("id", { count: "exact", head: true })
    .eq("pengukuran_id", pengId);
  if (cErr) return { error: cErr.message };
  if ((count ?? 0) >= 2) {
    return { error: "Maksimal 2 unit GNSS per pengukuran (§3.10)." };
  }

  const { error } = await supabase.schema("plm").from("pengukuran_alat").insert({
    pengukuran_id: pengId,
    alat_id: alatId,
    peran_alat: peranAlat,
  });

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: null };
}

export async function deletePengukuranAlatAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const id = trimOrNull(formData.get("pengukuran_alat_id"));
  if (!id) return { error: "pengukuran_alat_id kosong" };

  const { error } = await supabase
    .schema("plm")
    .from("pengukuran_alat")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: null };
}

export async function addPengukuranDokumenAction(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const pengId = trimOrNull(formData.get("pengukuran_id"));
  const tipe = trimOrNull(formData.get("tipe_dokumen"));
  const fileName = trimOrNull(formData.get("file_name"));
  if (!pengId) return { error: "pengukuran_id kosong" };
  if (tipe !== "gu_referensi" && tipe !== "hasil_cad")
    return { error: "tipe_dokumen tidak valid" };
  if (!fileName) return { error: "Nama file wajib" };

  let storageKey = trimOrNull(formData.get("storage_key"));
  if (!storageKey) {
    storageKey = `pending:${crypto.randomUUID()}`;
  } else if (!storageKey.startsWith("pending:") && !storageKey.startsWith(`${pengId}/`)) {
    return { error: "Path Storage harus diawali ID pengukuran ini." };
  }

  const { error } = await supabase.schema("plm").from("pengukuran_dokumen").insert({
    pengukuran_id: pengId,
    tipe_dokumen: tipe,
    file_name: fileName,
    mime_type: trimOrNull(formData.get("mime_type")),
    storage_key: storageKey,
    uploaded_by: user.id,
    uploaded_at: new Date().toISOString(),
  });

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: null };
}
