# Data dummy untuk increment 6–8

Ringkasan apa yang sudah disiapkan di migration (selain `0002` seed Core PM).

## Increment 5 (Kalender & Gantt)

- Migration **`0003_issues_schedule.sql`**
  - Kolom `core_pm.issues.starts_at`, `due_at` (timestamptz, nullable).
  - Update tanggal pada issue seed yang ada + **tiga issue baru**: `PLM-5`, `PLM-6`, `INT-3`.

## Increment 6 (Kanban drag)

- Tidak ada tabel baru. Pakai `core_pm.issues.status_id` + `sort_order` (+ `updated_at` saat drag).
- UI: `@dnd-kit/core` di `app/src/app/kanban-board.tsx`; update via client Supabase (`NEXT_PUBLIC_SUPABASE_*`).

## Increment 7 (RLS + auth)

- Tidak ada user dummy di migration (bergantung Supabase Auth + alamat email nyata).
- `core_pm.profiles` / `project_members` siap diisi setelah login pertama.

## Increment 8 (Map)

- Migration **`0004_spatial_demo_footprints.sql`**
  - Tabel `spatial.project_demo_footprints` (`project_id`, `label`, `geojson` Feature Polygon 4326).
  - **Expose schema `spatial`** di Supabase **Exposed schemas** (sama seperti `core_pm`), lihat `docs/supabase-expose-schemas.md`.

GeoJSON ini hanya untuk demo UI; model spasial penuh mengikuti catatan domain (`bidang_*`, dll.).

## G-H demo — project dummy pola B

Migration **`0074_gh_demo_virtual_tables_seed.sql`** (org **KJSB Demo**, project key **`GHDEMO`**).

| Tabel | Isi | Peran |
|-------|-----|--------|
| **Daftar Bidang** | `no_bidang`, `pemilik`, `gambar` (relasi) | Hub nominatif — **tanpa** kolom geometry |
| **Gambar** | `no_gambar`, `label`, `geometry`, `gambar_terkait` (relasi) | Poligon di tab Spasial; rantai trace G001→G002→G003 |

**Baris uji**

| No. bidang | Pemilik | Gambar | Bidang sebelah | Untuk uji |
|------------|---------|--------|----------------|-----------|
| B001 | Ahmad | G001 (poligon barat) | B002 | Trace hub → geom sebelah |
| B002 | Budi | G002 (poligon timur) | B001 | Sama |
| B003 | Citra | *(kosong)* | — | Find-on-map / state «belum ada poligon» |

| No. gambar | Label | Gambar terkait | Untuk uji |
|------------|-------|----------------|-----------|
| G001 | Poligon Ahmad | G002 | **G-D5** trace ke timur |
| G002 | Poligon Budi | G003 | Trace ke selatan |
| G003 | Poligon Citra (trace) | — | Target rantai trace |

**Cara pakai**

1. Jalankan migration (`supabase db push` atau `supabase migration up` pada DB lokal).
2. Login sebagai anggota org **KJSB Demo** (mis. setelah migration grant owner).
3. Buka workspace → pilih project **G-H Demo (pola B)**.
4. Tab **Data**: lihat relasi `gambar` di Daftar Bidang; tab **Spasial**: lapisan **Gambar** (**3** poligon).
5. Klik poligon **G001** → panel 360° → garis oranye ke **G002** (**G-D5**; pastikan toggle **Trace relasi di peta** aktif di menu ⋯).
6. Klik **G002** → garis ke **G001** dan **G003**.
7. Dari baris **B001** di Daftar Bidang → buka panel 360° / **Tunjukkan di peta** → trace ke poligon **B002** (G002).
8. **G-H5:** impor GeoJSON ke **Gambar** dengan property `no_bidang: B003` → kolom `gambar` di B003 terisi otomatis.

Pola ini memenuhi pemicu **GQ12** (≥2 tabel bisnis + `relation`) tanpa menunggu data pilot nyata.

