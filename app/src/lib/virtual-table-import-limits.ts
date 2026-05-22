/** Maks teks CSV yang dikirim ke server action impor virtual table. */
export const MAX_VIRTUAL_TABLE_CSV_CHARS = 2 * 1024 * 1024;

export const MAX_VIRTUAL_TABLE_CSV_ROWS = 5000;

/** Maks baris yang bisa dihapus sekaligus (hapus menurut filter). */
export const MAX_VIRTUAL_TABLE_BULK_DELETE_ROWS = 2000;

export const VIRTUAL_TABLE_CSV_IMPORTABLE_TYPES = new Set([
  "text",
  "number",
  "date",
  "checkbox",
  "url",
  "select",
  "relation",
]);

export type VirtualTableImportColumnHint = {
  slug: string;
  data_type: string;
  /** Contoh nilai di baris kedua template */
  example?: string;
  /** Petunjuk relasi untuk dialog */
  relationHint?: string;
};

export function virtualTableCsvTooLargeMessage(): string {
  const mb = Math.round(MAX_VIRTUAL_TABLE_CSV_CHARS / (1024 * 1024));
  return `CSV melebihi batas ~${mb} MB. Perkecil file atau bagi menjadi beberapa impor.`;
}

export function virtualTableImportTemplateCsv(
  columns: VirtualTableImportColumnHint[]
): string {
  const headers = columns.map((c) => c.slug);
  const examples = columns.map((c) => c.example ?? "");
  const hasExamples = examples.some((e) => e.length > 0);
  const lines = [headers.join(",")];
  if (hasExamples) {
    lines.push(examples.join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
