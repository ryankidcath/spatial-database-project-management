import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MAX_SHAPEFILE_ZIP_BYTES,
  MAX_SPATIAL_GEOMETRY_TEXT_MB,
} from "@/lib/spatial-import-limits";
import { sanitizeInternalReturnPath } from "@/lib/safe-return-url";

export const metadata: Metadata = {
  title: "Bantuan impor geometri & workbench surveyor",
  description:
    "Alur resmi produksi bidang di Portal: titik CSV, digitasi, arsip titik, DXF polygonize, GeoJSON.",
};

type PageProps = {
  searchParams: Promise<{ return?: string }>;
};

export default async function SpatialImportHelpPage({ searchParams }: PageProps) {
  const q = await searchParams;
  const backHref = sanitizeInternalReturnPath(q.return) ?? "/";
  const backLabel =
    backHref === "/" ? "← Kembali ke Portal" : "← Kembali ke workspace";
  const zipMb = Math.round(MAX_SHAPEFILE_ZIP_BYTES / (1024 * 1024));

  return (
    <div className="min-h-screen bg-muted/35 px-4 py-10 text-foreground">
      <article className="mx-auto max-w-3xl rounded-xl border border-border bg-card px-6 py-8 shadow-sm">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={backHref}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {backLabel}
          </Link>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          Panduan impor geometri & workbench surveyor
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <strong className="text-foreground">Alur resmi:</strong> produksi dan
          penyimpanan bidang di Portal (tabel virtual + tab Spasial), bukan
          hanya mengunggah file CAD yang sudah jadi.
        </p>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">
            Alur utama — pilih sesuai sumber data
          </h2>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[28rem] text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Situasi</th>
                  <th className="px-3 py-2 font-medium">Di Portal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-muted-foreground">
                <tr>
                  <td className="px-3 py-2">
                    Satu file titik TS/GPS (tanpa kode jenis)
                  </td>
                  <td className="px-3 py-2">
                    <strong className="text-foreground">
                      Titik lapangan → tabel baru
                    </strong>{" "}
                    (CSV <span className="font-mono">x</span>,{" "}
                    <span className="font-mono">y</span> → label T1, T2…)
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Siapkan tabel digitasi</td>
                  <td className="px-3 py-2">
                    Impor Spasial →{" "}
                    <strong className="text-foreground">
                      Buat tabel layer kosong
                    </strong>{" "}
                    (Bidang / Jalan / Saluran)
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Titik TS/GPS per bidang</td>
                  <td className="px-3 py-2">
                    <strong className="text-foreground">Bidang dari titik</strong>{" "}
                    (CSV → poligon)
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Arsip titik lapangan</td>
                  <td className="px-3 py-2">
                    <strong className="text-foreground">Arsip titik ukur</strong>{" "}
                    → opsional <strong className="text-foreground">Buat ulang poligon</strong>
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Sketsa di peta (garis)</td>
                  <td className="px-3 py-2">
                    Tab Spasial → Alat →{" "}
                    <strong className="text-foreground">Gambar garis</strong>{" "}
                    (jalan, saluran)
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Sketsa di peta (bidang)</td>
                  <td className="px-3 py-2">
                    Tab Spasial → Alat →{" "}
                    <strong className="text-foreground">Gambar bidang</strong>
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2">CAD garis belum tertutup</td>
                  <td className="px-3 py-2">
                    Impor DXF →{" "}
                    <strong className="text-foreground">Bangun dari garis</strong>
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Poligon CAD/GeoJSON sudah jadi</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    GeoJSON / DXF poligon tertutup (jalur legacy)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground">
            Kunci upsert biasanya <span className="font-mono">no_bidang</span>.
            Deliverable resmi = baris di tabel virtual (terlihat di peta), bukan
            file <span className="font-mono">.dwg</span> di folder pribadi.
          </p>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">
            Alur lengkap workbench (training singkat)
          </h2>
          <p className="text-muted-foreground">
            Pola lapangan paling umum — meniru AutoCAD (titik → layer → snap):
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
            <li>
              <strong className="text-foreground">Impor titik lapangan</strong> —
              CSV koordinat saja; label T1, T2… di peta.
            </li>
            <li>
              <strong className="text-foreground">Sketsa kertas</strong> — di
              luar app; catat titik mana untuk bidang, jalan, saluran.
            </li>
            <li>
              <strong className="text-foreground">Buat tabel layer kosong</strong>{" "}
              — Bidang, Jalan, dan/atau Saluran.
            </li>
            <li>
              Aktifkan lapisan titik + layer target di tab Spasial.
            </li>
            <li>
              <strong className="text-foreground">Digitasi</strong> — Gambar
              bidang (<span className="font-mono">no_bidang</span>) atau Gambar
              garis (<span className="font-mono">no_garis</span>); snap ke T1,
              T2…
            </li>
            <li>Cek tab Spasial dan Data sebelum serah ke admin.</li>
          </ol>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">
            CRS / SRID (EPSG)
          </h2>
          <p className="text-muted-foreground">
            Pilih SRID yang cocok dengan angka di file. Salah SRID → geometri
            salah posisi. Cek pratinjau peta sebelum simpan.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              <strong className="text-foreground">EPSG:4326</strong> — lon/lat
              (WGS84)
            </li>
            <li>
              <strong className="text-foreground">EPSG:32748 / 32749</strong> —
              UTM 48S / 49S (meter)
            </li>
            <li>
              <strong className="text-foreground">EPSG:23833–23836</strong> —
              TM-3 Indonesia
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">
            Bidang dari titik & arsip titik
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              CSV minimal: <span className="font-mono">no_bidang</span>,{" "}
              <span className="font-mono">x</span>, <span className="font-mono">y</span>
              ; opsional <span className="font-mono">urutan</span>,{" "}
              <span className="font-mono">nama_titik</span>.
            </li>
            <li>
              <strong className="text-foreground">Bidang dari titik</strong> —
              langsung membentuk poligon per bidang.
            </li>
            <li>
              <strong className="text-foreground">Arsip titik ukur</strong> —
              simpan titik mentah (Point); di peta tampil sebagai marker biru
              kecil.
            </li>
            <li>
              <strong className="text-foreground">Buat ulang poligon</strong> —
              gabungkan titik arsip menjadi poligon bidang setelah koreksi.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">
            Gambar bidang, garis & DXF
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              <strong className="text-foreground">Gambar bidang</strong> — snap
              ke titik T1…; tutup poligon; isi{" "}
              <span className="font-mono">no_bidang</span>.
            </li>
            <li>
              <strong className="text-foreground">Gambar garis</strong> — snap
              berurutan; simpan LineString ke tabel Jalan/Saluran; kunci{" "}
              <span className="font-mono">no_garis</span>.
            </li>
            <li>
              DXF <strong className="text-foreground">Bangun dari garis</strong>{" "}
              — untuk LINE / polyline terbuka (disarankan untuk gambar CAD
              lama).
            </li>
            <li>
              DXF <strong className="text-foreground">Poligon tertutup</strong>{" "}
              — LW/PL tertutup, INSERT, HATCH (legacy).
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">
            GeoJSON & shapefile
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Batch poligon ke tabel virtual; mapping kunci per fitur.</li>
            <li>
              ZIP shapefile: hanya Polygon; batas ZIP ~{zipMb} MB; teks batch ~{" "}
              {MAX_SPATIAL_GEOMETRY_TEXT_MB} MB ke server.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">
            Legacy — unit kerja & <span className="font-mono">feature_key</span>
          </h2>
          <p className="text-muted-foreground">
            Alur lama (geometri per unit kerja) memakai{" "}
            <span className="font-mono">feature_key</span> + tab Map/Tabel issue.
            Proyek baru memakai tabel virtual dan{" "}
            <span className="font-mono">no_bidang</span> (lihat bagian atas).
          </p>
        </section>

        <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          Dokumentasi internal lengkap:{" "}
          <span className="font-mono text-foreground">
            docs/spatial-import-user-guide.md
          </span>
          ,{" "}
          <span className="font-mono text-foreground">
            docs/surveyor-workbench-strategy.md
          </span>
        </p>
      </article>
    </div>
  );
}
