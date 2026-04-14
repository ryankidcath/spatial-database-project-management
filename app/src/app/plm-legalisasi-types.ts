/** Baris `plm.legalisasi_gu` (subset kolom untuk wizard F5-2). */
export type LegalisasiGuRow = {
  id: string;
  berkas_id: string;
  status_tahap: string;
  kantor_pertanahan: string | null;
  nomor_berkas_legalisasi: string | null;
  tanggal_berkas_legalisasi: string | null;
  penggunaan_tanah: string | null;
  luas_hasil_ukur: number | null;
  tanggal_submit: string | null;
  tanggal_sps: string | null;
  nominal_sps: number | null;
  tanggal_bayar_sps: string | null;
  nomor_gu: string | null;
  tanggal_gu: string | null;
  nib_baru: string | null;
  tanggal_nib: string | null;
  nomor_pbt: string | null;
  tanggal_pbt: string | null;
  tanggal_tte_gu: string | null;
  tanggal_tte_pbt: string | null;
  tanggal_upload_gu: string | null;
  tanggal_upload_pbt: string | null;
  tanggal_persetujuan: string | null;
  tanggal_penyelesaian: string | null;
  catatan: string | null;
  created_at: string;
};

export type LegalisasiGuFileTipe =
  | "hasil_ukur"
  | "scan_berkas"
  | "scan_sketsa_gu"
  | "sps_download"
  | "gu_signed"
  | "pbt_signed"
  | "dokumen_lain";

/** Baris `plm.legalisasi_gu_file` (metadata upload; Storage F5-4). */
export type LegalisasiGuFileRow = {
  id: string;
  legalisasi_gu_id: string;
  tipe_file: string;
  file_name: string;
  mime_type: string | null;
  storage_key: string | null;
  uploaded_at: string | null;
  created_at: string;
};

export type LegalisasiGuHistoryEventKind =
  | "patch"
  | "advance"
  | "file_added"
  | "draft_created";

/** Baris `plm.legalisasi_gu_history` (F5-4). */
export type LegalisasiGuHistoryRow = {
  id: string;
  legalisasi_gu_id: string;
  actor_user_id: string | null;
  event_kind: LegalisasiGuHistoryEventKind;
  payload: unknown;
  created_at: string;
};
