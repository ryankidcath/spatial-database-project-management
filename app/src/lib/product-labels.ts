/**
 * Label user-facing — docs/product-terminology.md (T1).
 * Kode/URL/DB tetap `project`, `workspace`, dll.
 */

export const PORTAL_LABEL = "Portal";

export const RUANG_KERJA_LABEL = "Ruang Kerja";

/** Di tengah kalimat: "ruang kerja" */
export const ruangKerjaLc = "ruang kerja";

export const ruangKerjaIni = "ruang kerja ini";

export const CHAT_RUANG_KERJA_LABEL = "Chat ruang kerja";

export const SCOPE_PORTAL_LABEL = "Scope Portal";

export function pilihRuangKerja(): string {
  return `Pilih ${ruangKerjaLc}`;
}

export function pilihRuangKerjaUntuk(melanjutkan: string): string {
  return `${pilihRuangKerja()} ${melanjutkan}`;
}
