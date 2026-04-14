/** Tahapan ringkas alur berkas (F3-4); nilai disimpan di kolom `status`. */
export const BERKAS_STATUS_STEPS = [
  { key: "draft", label: "Draf" },
  { key: "diajukan", label: "Diajukan" },
  { key: "diproses", label: "Diproses" },
  { key: "selesai", label: "Selesai" },
] as const;

export type BerkasStatusKey = (typeof BERKAS_STATUS_STEPS)[number]["key"];

const STEP_KEYS = new Set<string>(
  BERKAS_STATUS_STEPS.map((s) => s.key)
);

export function isAllowedBerkasStatus(status: string): status is BerkasStatusKey {
  return STEP_KEYS.has(status.toLowerCase().trim());
}

/** Indeks langkah untuk UI stepper; status tidak dikenal → 0 (Draf). */
export function berkasStatusStepIndex(status: string): number {
  const s = status.toLowerCase().trim();
  const i = BERKAS_STATUS_STEPS.findIndex((x) => x.key === s);
  return i >= 0 ? i : 0;
}
