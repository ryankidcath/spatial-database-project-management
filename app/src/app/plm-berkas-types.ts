export type PemilikTanahSnippet = {
  id: string;
  nama_lengkap: string;
};

export type BerkasPemilikNested = {
  urutan: number;
  pemilik_tanah: PemilikTanahSnippet | PemilikTanahSnippet[] | null;
};

export type BerkasPermohonanRow = {
  id: string;
  project_id: string;
  nomor_berkas: string;
  tanggal_berkas: string;
  status: string;
  catatan: string | null;
  berkas_pemilik?: BerkasPemilikNested[] | null;
};

function namaPemilikNested(
  p: BerkasPemilikNested["pemilik_tanah"]
): string {
  if (!p) return "—";
  const row = Array.isArray(p) ? p[0] : p;
  return row?.nama_lengkap ?? "—";
}

/** Daftar nama pemilik terurut (satu baris per pemilik) untuk panel detail. */
export function pemilikLinesForBerkas(b: BerkasPermohonanRow): string[] {
  const links = b.berkas_pemilik;
  if (!links?.length) return [];
  return [...links]
    .sort((a, b) => a.urutan - b.urutan)
    .map((l) => namaPemilikNested(l.pemilik_tanah));
}

export function pemilikLabelsForBerkas(b: BerkasPermohonanRow): string {
  const lines = pemilikLinesForBerkas(b);
  return lines.length ? lines.join(", ") : "—";
}
