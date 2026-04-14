/** Baris `plm.permohonan_informasi_spasial` (ringkas untuk gate pengukuran). */
export type PermohonanInfoSpasialRow = {
  id: string;
  berkas_id: string;
  tanggal_permohonan: string;
  status_hasil: string;
  tanggal_download_hasil: string | null;
  catatan: string | null;
};

export type AlatUkurRow = {
  id: string;
  organization_id: string;
  kode_aset: string;
  jenis: string;
  merek_model: string | null;
  serial_number: string | null;
  is_active: boolean;
};

export type PengukuranLapanganRow = {
  id: string;
  berkas_id: string;
  permohonan_informasi_spasial_id: string | null;
  nomor_surat_tugas: string | null;
  tanggal_surat_tugas: string | null;
  nomor_surat_pemberitahuan: string | null;
  tanggal_surat_pemberitahuan: string | null;
  tanggal_janji_ukur: string | null;
  tanggal_realisasi_ukur: string | null;
  status: string;
  catatan: string | null;
  created_at: string;
};

export type PengukuranSurveyorRow = {
  id: string;
  pengukuran_id: string;
  surveyor_user_id: string | null;
  peran: string;
  created_at: string;
};

export type PengukuranAlatRow = {
  id: string;
  pengukuran_id: string;
  alat_id: string;
  peran_alat: string;
  created_at: string;
};

export type PengukuranDokumenRow = {
  id: string;
  pengukuran_id: string;
  tipe_dokumen: string;
  file_name: string;
  mime_type: string | null;
  storage_key: string | null;
  uploaded_at: string | null;
  created_at: string;
};
