import type { LegalisasiGuFileRow, LegalisasiGuRow } from "./plm-legalisasi-types";

export const LEGALISASI_STATUS_ORDER = [
  "draft",
  "submit_bpn",
  "verifikasi_sps",
  "terbit_gu",
  "integrasi_bidang",
  "tte_upload",
  "selesai",
] as const;

export type LegalisasiStatusTahap = (typeof LEGALISASI_STATUS_ORDER)[number];

export function isLegalisasiStatus(s: string): s is LegalisasiStatusTahap {
  return (LEGALISASI_STATUS_ORDER as readonly string[]).includes(s);
}

export function statusTahapLabel(s: string): string {
  const map: Record<string, string> = {
    draft: "1 — Input & lampiran awal",
    submit_bpn: "2 — SPS & pembayaran",
    verifikasi_sps: "3 — Terbit GU",
    terbit_gu: "4 — Integrasi bidang (NIB/PBT)",
    integrasi_bidang: "5 — TTE & upload",
    tte_upload: "6 — Penyelesaian BPN",
    selesai: "Selesai",
  };
  return map[s] ?? s;
}

function hasFileType(
  files: LegalisasiGuFileRow[],
  legalisasiId: string,
  tipe: string
): boolean {
  return files.some(
    (f) => f.legalisasi_gu_id === legalisasiId && f.tipe_file === tipe
  );
}

/** Indeks status saat ini (0..6), atau -1 jika tidak dikenal. */
export function legalisasiStatusIndex(status: string): number {
  return LEGALISASI_STATUS_ORDER.indexOf(status as LegalisasiStatusTahap);
}

/** Status berikutnya atau null jika sudah selesai. */
export function nextLegalisasiStatus(
  current: string
): LegalisasiStatusTahap | null {
  const i = legalisasiStatusIndex(current);
  if (i < 0 || i >= LEGALISASI_STATUS_ORDER.length - 1) return null;
  return LEGALISASI_STATUS_ORDER[i + 1];
}

export type AdvanceCheckResult = { ok: true } | { ok: false; message: string };

/**
 * Validasi sebelum naik ke status berikutnya (§3.11 gating + file wajib).
 */
export function canAdvanceLegalisasi(
  row: LegalisasiGuRow,
  files: LegalisasiGuFileRow[]
): AdvanceCheckResult {
  const st = row.status_tahap;
  const id = row.id;

  if (st === "draft") {
    if (!row.nomor_berkas_legalisasi?.trim())
      return { ok: false, message: "Isi nomor berkas legalisasi." };
    if (!row.tanggal_berkas_legalisasi)
      return { ok: false, message: "Isi tanggal berkas legalisasi." };
    if (!row.penggunaan_tanah?.trim())
      return { ok: false, message: "Isi penggunaan tanah." };
    if (row.luas_hasil_ukur == null || row.luas_hasil_ukur < 0)
      return { ok: false, message: "Isi luas hasil ukur (bilangan bulat ≥ 0)." };
    if (!row.tanggal_submit)
      return { ok: false, message: "Isi tanggal submit (tahap 1)." };
    for (const t of ["scan_sketsa_gu", "scan_berkas", "hasil_ukur"] as const) {
      if (!hasFileType(files, id, t)) {
        return {
          ok: false,
          message: `Lampiran wajib tahap 1 belum lengkap: perlu tipe «${t}».`,
        };
      }
    }
    return { ok: true };
  }

  if (st === "submit_bpn") {
    if (!row.tanggal_sps)
      return { ok: false, message: "Isi tanggal SPS." };
    if (row.nominal_sps == null || row.nominal_sps < 0)
      return { ok: false, message: "Isi nominal SPS." };
    if (!row.tanggal_bayar_sps)
      return { ok: false, message: "Isi tanggal bayar SPS." };
    if (!hasFileType(files, id, "sps_download")) {
      return { ok: false, message: "Unggah lampiran wajib: sps_download." };
    }
    return { ok: true };
  }

  if (st === "verifikasi_sps") {
    if (!row.nomor_gu?.trim())
      return { ok: false, message: "Isi nomor GU." };
    if (!row.tanggal_gu)
      return { ok: false, message: "Isi tanggal GU." };
    return { ok: true };
  }

  if (st === "terbit_gu") {
    if (!row.nib_baru?.trim())
      return { ok: false, message: "Isi NIB baru." };
    if (!row.tanggal_nib)
      return { ok: false, message: "Isi tanggal NIB." };
    if (!row.nomor_pbt?.trim())
      return { ok: false, message: "Isi nomor PBT." };
    if (!row.tanggal_pbt)
      return { ok: false, message: "Isi tanggal PBT." };
    return { ok: true };
  }

  if (st === "integrasi_bidang") {
    if (!row.tanggal_tte_gu)
      return { ok: false, message: "Isi tanggal TTE GU." };
    if (!row.tanggal_tte_pbt)
      return { ok: false, message: "Isi tanggal TTE PBT." };
    if (!row.tanggal_upload_gu)
      return { ok: false, message: "Isi tanggal upload GU." };
    if (!row.tanggal_upload_pbt)
      return { ok: false, message: "Isi tanggal upload PBT." };
    if (!hasFileType(files, id, "gu_signed")) {
      return { ok: false, message: "Lampiran wajib: gu_signed." };
    }
    if (!hasFileType(files, id, "pbt_signed")) {
      return { ok: false, message: "Lampiran wajib: pbt_signed." };
    }
    return { ok: true };
  }

  if (st === "tte_upload") {
    if (!row.tanggal_persetujuan)
      return { ok: false, message: "Isi tanggal persetujuan (tahap 6)." };
    if (!row.tanggal_penyelesaian)
      return { ok: false, message: "Isi tanggal penyelesaian." };
    return { ok: true };
  }

  if (st === "selesai") {
    return { ok: false, message: "Sudah pada status selesai." };
  }

  return { ok: false, message: `Status tidak dikenal: ${st}` };
}
