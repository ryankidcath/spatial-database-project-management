import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MAX_SHAPEFILE_ZIP_BYTES,
  MAX_SPATIAL_GEOMETRY_TEXT_MB,
} from "@/lib/spatial-import-limits";

export const metadata: Metadata = {
  title: "Bantuan impor geometri & atribut",
  description:
    "CRS, feature_key, GeoJSON, ZIP shapefile, DXF, dan import CSV atribut di workspace.",
};

export default function SpatialImportHelpPage() {
  const zipMb = Math.round(MAX_SHAPEFILE_ZIP_BYTES / (1024 * 1024));

  return (
    <div className="min-h-screen bg-muted/35 px-4 py-10 text-foreground">
      <article className="mx-auto max-w-3xl rounded-xl border border-border bg-card px-6 py-8 shadow-sm">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            ← Kembali ke workspace
          </Link>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          Panduan impor geometri & atribut spasial
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ringkasan untuk tim lapangan dan admin. Status fitur teknis ada di repositori:{" "}
          <span className="font-mono text-xs text-foreground">
            docs/spatial-import-roadmap.md
          </span>
          .
        </p>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">
            1. <span className="font-mono">feature_key</span>
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              String pengenal fitur di <strong className="text-foreground">satu unit kerja</strong>
              .
            </li>
            <li>
              Menghubungkan geometri (tab <strong className="text-foreground">Map</strong>) dan
              atribut (tab <strong className="text-foreground">Tabel</strong>) — harus sama
              persis (huruf besar/kecil dan spasi ikut).
            </li>
            <li>Atribut boleh diisi dulu lewat CSV, geometri menyusul, atau sebaliknya.</li>
          </ul>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">2. CRS / SRID (EPSG)</h2>
          <p className="text-muted-foreground">
            Di dialog simpan geometri, pilih SRID yang cocok dengan angka di file Anda.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              <strong className="text-foreground">EPSG:4326</strong> — GeoJSON lon/lat; atau
              shapefile dengan <span className="font-mono">.prj</span> yang setelah dibaca parser
              menghasilkan derajat (biasanya ini).
            </li>
            <li>
              <strong className="text-foreground">EPSG:32748 / 32749</strong> — UTM 48S / 49S
              (meter), bila koordinat tidak sudah lon/lat.
            </li>
            <li>
              <strong className="text-foreground">EPSG:23833–23836</strong> — grid TM-3 yang
              tersedia di form.
            </li>
          </ul>
          <p className="text-muted-foreground">
            SRID salah → geometri salah posisi atau gagal simpan. Ragukan CRS? Tanyakan sumber
            data atau uji satu fitur kecil.
          </p>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">3. Tab Map — GeoJSON</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              Satu poligon / Feature: isi <strong className="text-foreground">Feature key</strong>{" "}
              (wajib) dan label opsional.
            </li>
            <li>
              <strong className="text-foreground">FeatureCollection</strong>: prefix key
              opsional; tabel <strong className="text-foreground">Feature key & label</strong> per
              poligon (bisa diedit; mengubah prefix mengisi ulang dari properti file).
            </li>
            <li>
              Batas teks ke server sekitar{" "}
              <strong className="text-foreground">~{MAX_SPATIAL_GEOMETRY_TEXT_MB} MB</strong>{" "}
              (termasuk batch).
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">4. Tab Map — ZIP shapefile</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              ZIP berisi <span className="font-mono">.shp</span> +{" "}
              <span className="font-mono">.dbf</span>; disarankan{" "}
              <span className="font-mono">.shx</span> + <span className="font-mono">.prj</span>.
            </li>
            <li>Hanya Polygon / MultiPolygon; titik dan garis diabaikan.</li>
            <li>Beberapa layer <span className="font-mono">.shp</span> → pilih di dropdown.</li>
            <li>
              Batas ZIP di browser ~<strong className="text-foreground">{zipMb} MB</strong>; hasil
              teks batch tetap ~{MAX_SPATIAL_GEOMETRY_TEXT_MB} MB ke server.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">5. Tab Map — DXF</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Pilih layer, prefix atau tabel mapping key/label per poligon.</li>
            <li>Pratinjau peta: klik poligon ↔ sorot baris tabel.</li>
            <li>Unduh template CSV <span className="font-mono">feature_key</span> + label bila perlu.</li>
          </ul>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="text-base font-semibold text-foreground">6. Tab Tabel — CSV atribut</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              Kolom kunci default <span className="font-mono">feature_key</span>; unduh template
              dari dialog impor.
            </li>
            <li>Impor melakukan upsert per kunci pada unit kerja yang dipilih.</li>
          </ul>
        </section>

        <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          Versi panjang untuk dokumentasi internal:{" "}
          <span className="font-mono text-foreground">docs/spatial-import-user-guide.md</span> di
          repositori.
        </p>
      </article>
    </div>
  );
}
