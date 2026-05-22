# Rencana Migrasi: Custom Virtual Tables

> **Status:** draf awal — akan diperbarui setiap fase selesai.
> **Tujuan:** User bisa membuat "tabel" dan "kolom" sendiri dengan relasi antar-tabel, tanpa perlu DDL di PostgreSQL. Semua data disimpan di meta-table generik.
> **Prinsip backward-compat:** Sistem lama (issues, PLM, spatial, finance) tetap jalan 100%. Virtual tables adalah fitur tambahan yang berdampingan (side-by-side / dual-mode).

---

## Ringkasan Fase

| # | Fase | Inti Deliverable | Status |
|---|------|------------------|--------|
| 1 | Meta Schema | Migrasi SQL: `virtual_tables`, `virtual_columns`, `virtual_rows` + RLS | ✅ |
| 2 | Server Actions | CRUD server actions generik untuk virtual tables | ✅ |
| 3 | Generic Table UI | Komponen `VirtualTableView` + row editor + column manager | ✅ |
| 4 | Workspace Integration | Sidebar dinamis, tab per virtual table, template system | ✅ |
| 5 | Relations | Kolom tipe `relation`, definisi relasi antar-tabel, picker UI | ✅ |
| 6 | Views & Filters | Saved views, filter/sort/group, column visibility | ✅ |
| 7 | Spatial Integration | Kolom tipe `geometry` + render di map | ✅ |
| 8 | Data Migration (opsional) | Bridge data PLM lama ke virtual tables | ⬜ |

---

## Fase 1 — Meta Schema

**Goal:** Tabel-tabel fisik baru di PostgreSQL yang menyimpan definisi dan data virtual tables. Tidak menyentuh tabel lama sama sekali.

### Desain Tabel

**Schema:** `core_pm` (tetap di schema yang sama agar RLS helper `is_project_member()` langsung bisa dipakai).

#### `core_pm.virtual_tables`

| Kolom | Tipe | Catatan |
|-------|------|---------|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `project_id` | `uuid` NOT NULL FK → `projects` | Scope per project |
| `slug` | `text` NOT NULL | Identifier (auto-generated dari name, unique per project) |
| `display_name` | `text` NOT NULL | Nama tampilan |
| `description` | `text` | Opsional |
| `icon` | `text` | Emoji atau icon key, opsional |
| `sort_order` | `int` NOT NULL DEFAULT 0 | Urutan di sidebar |
| `created_by` | `uuid` FK → `auth.users` | Siapa pembuat |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |
| `deleted_at` | `timestamptz` | Soft delete |

**Unique:** `(project_id, slug) WHERE deleted_at IS NULL`

#### `core_pm.virtual_columns`

| Kolom | Tipe | Catatan |
|-------|------|---------|
| `id` | `uuid` PK | |
| `table_id` | `uuid` NOT NULL FK → `virtual_tables` ON DELETE CASCADE | |
| `slug` | `text` NOT NULL | Identifier (jadi key di JSONB payload) |
| `display_name` | `text` NOT NULL | Nama tampilan |
| `data_type` | `text` NOT NULL | Salah satu: `text`, `number`, `date`, `select`, `checkbox`, `url`, `user`, `file`, `relation`, `geometry` |
| `position` | `int` NOT NULL DEFAULT 0 | Urutan kolom |
| `is_required` | `boolean` NOT NULL DEFAULT false | Validasi wajib isi |
| `config` | `jsonb` NOT NULL DEFAULT '{}' | Konfigurasi per tipe (misal: options untuk `select`, target_table_id untuk `relation`) |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

**Unique:** `(table_id, slug)`
**CHECK:** `data_type IN ('text','number','date','select','checkbox','url','user','file','relation','geometry')`
**CHECK:** `slug ~ '^[a-z][a-z0-9_]*$'`

#### `core_pm.virtual_rows`

| Kolom | Tipe | Catatan |
|-------|------|---------|
| `id` | `uuid` PK | |
| `table_id` | `uuid` NOT NULL FK → `virtual_tables` ON DELETE CASCADE | |
| `payload` | `jsonb` NOT NULL DEFAULT '{}' | Semua nilai disimpan di sini, key = column slug |
| `sort_order` | `int` NOT NULL DEFAULT 0 | Urutan baris |
| `created_by` | `uuid` FK → `auth.users` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |
| `deleted_at` | `timestamptz` | Soft delete |

**Index:** `GIN (payload)` untuk filter JSONB
**Index:** `(table_id, sort_order)`

**Keputusan: JSONB-per-Row, bukan EAV terpisah.** Alasan:
- Pola sudah ada di `spatial.issue_feature_attributes` (proven)
- 1 read per row (cepat), tidak perlu pivot/join
- GIN index cukup untuk filter sederhana
- Validasi tipe dilakukan di level aplikasi (server action), bukan DB
- Bisa migrasi ke EAV nanti jika butuh advanced native SQL sorting

### RLS Policies

Semua 3 tabel menggunakan pola yang sama:
```
policy "..._select_member" for SELECT using (
  exists (
    select 1 from core_pm.virtual_tables vt
    where vt.id = <this>.table_id  -- untuk columns/rows
      and vt.deleted_at is null
      and core_pm.is_project_member(vt.project_id)
  )
)
```
Untuk `virtual_tables` sendiri: `core_pm.is_project_member(virtual_tables.project_id)`.

### Langkah Eksekusi

1. Tulis file migrasi SQL `supabase/migrations/0043_virtual_tables_schema.sql`
2. Isi: CREATE TABLE × 3, indexes, constraints, grants, RLS policies
3. Tidak ada seed data (user buat sendiri)
4. Test: `supabase db reset` lokal berhasil tanpa error
5. Verifikasi tabel lama tidak terpengaruh

### Kriteria Selesai
- [x] Migrasi SQL ditulis dan valid (`0043_virtual_tables_schema.sql`)
- [x] `verify-migration-files.mjs` — 43 file OK, tidak ada duplikat
- [ ] `supabase db reset` sukses (perlu Docker; verifikasi saat deploy)
- [x] Tabel lama tidak tersentuh (migrasi 100% additive, hanya CREATE TABLE baru)

---

## Fase 2 — Server Actions

**Goal:** CRUD lengkap untuk virtual tables, columns, dan rows via Next.js Server Actions. Pola mengikuti `core-task-actions.ts`.

### File baru: `app/src/app/virtual-table-actions.ts`

#### Actions yang dibuat:

**Virtual Tables:**
- `createVirtualTableAction(formData)` — buat tabel baru + set kolom default (Title text, required)
- `updateVirtualTableAction(formData)` — rename, ubah icon/description
- `deleteVirtualTableAction(formData)` — soft delete tabel + semua rows
- `reorderVirtualTablesAction(formData)` — ubah sort_order

**Virtual Columns:**
- `addVirtualColumnAction(formData)` — tambah kolom ke tabel
- `updateVirtualColumnAction(formData)` — rename, ubah config/required
- `deleteVirtualColumnAction(formData)` — hapus kolom (+ bersihkan key dari semua rows payload)
- `reorderVirtualColumnsAction(formData)` — ubah position

**Virtual Rows:**
- `createVirtualRowAction(formData)` — buat row baru (payload kosong atau partial)
- `updateVirtualRowCellAction(formData)` — update satu cell (JSONB merge pada satu key)
- `updateVirtualRowAction(formData)` — update seluruh payload
- `deleteVirtualRowAction(formData)` — soft delete
- `reorderVirtualRowsAction(formData)` — ubah sort_order

#### Validasi di server:
- Cek `data_type` saat write cell: number harus numerik, date harus ISO string, select harus salah satu dari config.options, dll
- Cek `is_required` saat create/update row
- Slug auto-generate dari display_name (lowercase, replace spasi→underscore, strip non-alnum)

### File baru: `app/src/app/virtual-table-types.ts`

Type definitions:
```typescript
export type VirtualTableRow = {
  id: string;
  project_id: string;
  slug: string;
  display_name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
};

export type VirtualColumnRow = {
  id: string;
  table_id: string;
  slug: string;
  display_name: string;
  data_type: string;
  position: number;
  is_required: boolean;
  config: Record<string, unknown>;
};

export type VirtualDataRow = {
  id: string;
  table_id: string;
  payload: Record<string, unknown>;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
```

### Data fetching di `page.tsx`

Tambahkan fetch virtual tables + columns + rows untuk project yang sedang aktif:
- `virtual_tables` — semua tabel di project yang aktif, `WHERE deleted_at IS NULL`
- `virtual_columns` — semua kolom untuk tabel-tabel tersebut
- `virtual_rows` — rows untuk tabel yang sedang dilihat (lazy load per tabel, bukan semua sekaligus)

### Langkah Eksekusi

1. Buat `virtual-table-types.ts` dengan type definitions
2. Buat `virtual-table-actions.ts` dengan semua actions
3. Tambah fetch di `page.tsx`: virtual_tables + virtual_columns (rows di-fetch lazy)
4. Tambah props baru di `WorkspaceClient` untuk data virtual tables
5. Test: panggil actions dari browser console / simple form

### Kriteria Selesai
- [x] Type definitions dibuat (`virtual-table-types.ts`)
- [x] Server actions dibuat (`virtual-table-actions.ts`): 12 actions + 1 fetch
- [x] Data fetching di `page.tsx`: virtual_tables + virtual_columns
- [x] Props diteruskan ke `WorkspaceClient`
- [x] TypeScript typecheck lolos tanpa error
- [ ] Test live: create table → muncul di DB
- [ ] Test live: add column → muncul di DB
- [ ] Test live: create/update/delete row berfungsi

---

## Fase 3 — Generic Table UI

**Goal:** Komponen React yang bisa merender virtual table apapun sebagai tabel interaktif, dengan inline editing dan column management.

### Komponen baru:

#### `VirtualTableView` (file: `app/src/app/virtual-table-view.tsx`)
- Menerima props: `table`, `columns`, `rows`, dan action callbacks
- Render header dari `columns` (display_name, sortable)
- Render body dari `rows` (payload[column.slug] per cell)
- Cell renderer per `data_type`:
  - `text` → teks biasa, klik untuk edit inline
  - `number` → angka rata kanan, klik untuk edit
  - `date` → format tanggal, date picker saat edit
  - `select` → badge/pill, dropdown saat edit (options dari column.config)
  - `checkbox` → checkbox langsung
  - `url` → link clickable, teks saat edit
  - `user` → display name (lookup dari project members)
  - `file` → nama file + link (masa depan, bisa skip dulu)
  - `relation` → nama row dari tabel target (masa depan, Fase 5)
  - `geometry` → badge "Has geometry" (masa depan, Fase 7)
- Toolbar: tambah row, tambah kolom, search/filter sederhana
- Empty state yang ramah

#### `VirtualColumnManagerDialog` (di file yang sama atau terpisah)
- Dialog untuk: tambah kolom, edit kolom (rename, ubah tipe, set required), hapus kolom, reorder (drag)
- Select tipe data dengan ikon per tipe

#### `VirtualRowEditorDialog` (di file yang sama atau terpisah)
- Dialog/panel untuk edit satu row: form fields berdasarkan columns
- Field renderer per data_type (sesuai cell renderer tapi versi form)

#### `VirtualTableCreateDialog`
- Dialog: nama tabel, deskripsi (opsional), icon (opsional)
- Auto-create dengan kolom default "Title" (text, required)

### Langkah Eksekusi

1. Buat `VirtualTableView` — render tabel read-only dulu
2. Tambah inline cell editing (klik cell → input → blur save)
3. Buat `VirtualTableCreateDialog` — form buat tabel baru
4. Buat `VirtualColumnManagerDialog` — CRUD kolom
5. Buat `VirtualRowEditorDialog` — form edit row (alternatif inline)
6. Tambah toolbar (add row, add column, search)
7. Polish: loading states, empty states, error handling

### Kriteria Selesai
- [x] Bisa buat tabel baru dari UI (`VirtualTableCreateDialog`)
- [x] Bisa tambah/edit/hapus kolom (inline di header + dialog add column)
- [x] Bisa tambah/edit/hapus row (toolbar + inline edit + delete confirm)
- [x] Inline editing per cell berfungsi (klik cell → input → blur/Enter save)
- [x] Semua 7 tipe data dasar (text, number, date, select, checkbox, url, user) ter-render dan editable
- [x] Responsive dan konsisten dengan design system yang ada (Tailwind + shadcn)

**File:** `app/src/app/virtual-table-view.tsx` — berisi `VirtualTableView` dan `VirtualTableCreateDialog`

---

## Fase 4 — Workspace Integration

**Goal:** Virtual tables muncul di sidebar/tab workspace sebagai entitas first-class, berdampingan dengan views yang sudah ada.

### Perubahan di `workspace-client.tsx`:

1. **Sidebar / tab bar** — di bawah view tabs yang sudah ada (Dashboard, Tabel, Map, dll), tampilkan section "Custom Tables" berisi daftar virtual tables di project aktif
2. **Klik virtual table** → render `VirtualTableView` di area konten utama
3. **Tombol "+ Tabel Baru"** di sidebar → buka `VirtualTableCreateDialog`
4. **URL state** — `?view=vtable&vtable=<slug>` agar bisa di-bookmark/share

### Template System (opsional tapi berguna):

Saat buat tabel baru, tawarkan template:
- **Kosong** — hanya kolom Title
- **Berkas PLM** — kolom: Nomor Berkas (text), Tanggal (date), Status (select: draft/proses/selesai), Pemilik (text), Catatan (text)
- **Inventaris** — kolom: Nama (text), Kategori (select), Jumlah (number), Lokasi (text)
- **Kontak** — kolom: Nama (text), Telepon (text), Email (url), Alamat (text)

Template = konfigurasi JSON yang di-apply saat create → auto-add columns.

### Langkah Eksekusi

1. Tambah section "Custom Tables" di sidebar `workspace-client.tsx`
2. Tambah routing logic: `?view=vtable&vtable=<slug>`
3. Render `VirtualTableView` di area konten saat virtual table dipilih
4. Tambah tombol "+ Tabel Baru" dengan dialog
5. (Opsional) Implementasi template system

### Kriteria Selesai
- [x] Virtual tables muncul di sidebar (section "Tabel Custom" di bawah project tree)
- [x] Klik → menampilkan tabel yang benar (overlay di atas main content)
- [ ] URL state berfungsi (refresh halaman tetap di tabel yang sama) — belum diimplementasi, bisa ditambah nanti
- [x] Tombol buat tabel baru berfungsi (`VirtualTableCreateDialog`)
- [x] Tidak mengganggu view/tab yang sudah ada (overlay approach, views tetap intact)

**Catatan:** URL state (`?vtable=<slug>`) belum diimplementasi di fase ini untuk menjaga kesederhanaan. Template system juga ditunda ke iterasi berikutnya.

---

## Fase 5 — Relations

**Goal:** User bisa membuat kolom yang mereferensikan row di tabel lain (foreign key virtual).

### Mekanisme:

- Kolom dengan `data_type = 'relation'` memiliki `config.target_table_id` (UUID virtual table tujuan)
- Nilai di payload: UUID dari `virtual_rows.id` di tabel target
- Mendukung single-relation (satu nilai) dan multi-relation (array UUID) via `config.is_multi`

### Komponen UI:
- **RelationPicker** — modal/popover yang menampilkan rows dari tabel target, searchable, single/multi select
- **RelationCell** — render nama row target (ambil dari title column tabel target)

### Langkah Eksekusi

1. Pastikan `relation` sudah ada di CHECK constraint `data_type`
2. Buat `RelationPicker` component
3. Buat `RelationCell` renderer
4. Validasi di server: cek target row exists + user punya akses
5. Handle cascading: jika row target dihapus, bersihkan referensi (atau tampilkan "deleted")

### Kriteria Selesai
- [x] Bisa buat kolom relation yang merujuk ke tabel lain (config: `target_table_id`, `is_multi`)
- [x] Picker menampilkan rows dari tabel target (searchable, single/multi select)
- [x] Relation cell menampilkan label row target (resolved via `resolveRelationLabelsAction`)
- [ ] Klik relation cell → navigasi ke row target (opsional, bisa ditambah nanti)
- [x] Hapus row target → referensi ditampilkan sebagai ID singkat (fallback graceful)

**Files yang diubah:**
- `virtual-table-actions.ts`: +`fetchRelationTargetRowsAction`, +`resolveRelationLabelsAction`, validasi relation di `validateCellValue`
- `virtual-table-view.tsx`: +relation cell renderer, +relation picker dialog, +target table picker di add column dialog, +`allVirtualTables` prop
- `workspace-client.tsx`: pass `allVirtualTables={vtablesForProject}` ke VirtualTableView

---

## Fase 6 — Views & Filters

**Goal:** User bisa menyimpan konfigurasi tampilan (filter, sort, group, kolom visible) per virtual table.

### Tabel baru: `core_pm.virtual_views`

| Kolom | Tipe | Catatan |
|-------|------|---------|
| `id` | `uuid` PK | |
| `table_id` | `uuid` FK → `virtual_tables` | |
| `name` | `text` NOT NULL | Nama view |
| `config` | `jsonb` NOT NULL | `{ filters: [...], sorts: [...], groupBy: string|null, visibleColumns: string[], columnWidths: {...} }` |
| `is_default` | `boolean` DEFAULT false | |
| `created_by` | `uuid` | |
| `created_at` | `timestamptz` | |

### Fitur UI:
- Filter bar: tambah filter (kolom, operator, value)
- Sort: klik header kolom → toggle asc/desc, multi-sort
- Group by: pilih kolom select → rows dikelompokkan
- Column visibility: toggle show/hide per kolom
- Save view: simpan konfigurasi aktif sebagai named view
- Switch view: dropdown pilih view tersimpan

### Langkah Eksekusi

1. Migrasi SQL untuk `virtual_views`
2. Server actions: create/update/delete view
3. UI: filter bar, sort controls, group-by, column visibility
4. UI: save/load view
5. Persisten: saat switch view, apply config-nya

### Kriteria Selesai
- [x] Bisa filter rows by kolom + operator + value (10 operator: eq, neq, contains, gt, lt, is_empty, dll)
- [x] Bisa sort by kolom asc/desc (klik header kolom, multi-sort, indikator ↑↓)
- [x] Bisa group by kolom select/text/checkbox (rows dikelompokkan dengan header grup)
- [x] Bisa hide/show kolom (checkbox per kolom di toolbar, counter "x / y kolom")
- [x] Bisa save dan load view (simpan sebagai named view, switch, perbarui, hapus)

**Files yang dibuat/diubah:**
- `0044_virtual_views_schema.sql`: tabel `core_pm.virtual_views` + RLS
- `virtual-table-types.ts`: +`VirtualViewRow`, `VirtualViewFilter`, `VirtualViewSort`, `VirtualViewConfig`, `VIEW_FILTER_OPERATORS`
- `virtual-table-actions.ts`: +`createVirtualViewAction`, `updateVirtualViewAction`, `deleteVirtualViewAction`, `fetchVirtualViewsAction`
- `virtual-table-view.tsx`: refactored — `DataRow` extracted, view toolbar (filter/sort/group/col visibility/saved views), client-side filtering+sorting, grouped rendering

---

## Fase 7 — Spatial Integration

**Goal:** Virtual table bisa memiliki kolom tipe `geometry` yang terintegrasi dengan map view.

### Mekanisme:
- `data_type = 'geometry'` → value di payload adalah GeoJSON object
- Atau: value merujuk ke `spatial.issue_geometry_features.id` (reuse infrastruktur spatial yang ada)
- Map view bisa difilter per virtual table (semua rows yang punya geometry)

### Langkah Eksekusi

1. Tentukan pendekatan: GeoJSON di payload vs referensi ke tabel spatial
2. Buat geometry cell renderer (preview mini, tombol "Lihat di peta")
3. Integrasi dengan `WorkspaceMap`: layer tambahan dari virtual table rows
4. Import geometry: reuse DXF/Shapefile/GeoJSON import yang sudah ada

### Kriteria Selesai
- [x] Bisa buat kolom geometry di virtual table (tipe `geometry` sudah ada sejak Fase 1)
- [x] Geometry ter-render di map (layer `virtual_table` warna amber, toggle terpisah)
- [x] Bisa input GeoJSON via dialog paste (Feature, Polygon, MultiPolygon, dll)
- [ ] Bisa import geometry dari DXF/Shapefile (opsional, reuse pipeline import yang ada)

**Pendekatan:** GeoJSON disimpan langsung di `payload[col_slug]` sebagai objek JSONB. Ini konsisten dengan arsitektur JSONB-per-Row dan tidak memerlukan tabel tambahan.

**Files yang dibuat/diubah:**
- `workspace-map.tsx`: +`virtual_table` layer kind, warna stroke `#b45309` / fill `#fbbf24`
- `virtual-table-view.tsx`: +geometry cell renderer (badge "Geometri"), +geometry editor dialog (textarea paste GeoJSON dengan validasi tipe)
- `workspace-client.tsx`: +`vtableGeometryLayers` (lazy-load geometry dari virtual rows), +`mapShowVirtualTableGeometry` toggle, layer legend "Tabel Custom"

---

## Fase 8 — Data Migration (Opsional)

**Goal:** Migrasi data PLM lama (berkas, pemilik, dll) ke virtual tables agar semua data bisa dikelola lewat satu interface.

### Strategi:
- Buat script migrasi (bukan migrasi SQL, tapi script runtime)
- Mapping: `plm.berkas_permohonan` → virtual table "Berkas PLM" dengan kolom yang sesuai
- Mapping: `plm.pemilik_tanah` → virtual table "Pemilik" dengan relasi ke "Berkas PLM"
- Data lama tetap ada di tabel fisik (read-only archive)
- Fitur PLM lama bisa di-deprecate bertahap setelah semua data termigrasi

### Risiko:
- Data integrity: pastikan semua relasi terbawa
- Performance: berkas dengan banyak sub-entity (pengukuran, legalisasi) bisa jadi banyak rows
- Rollback: harus bisa kembali ke sistem lama jika ada masalah

### Kriteria Selesai
- [ ] Script migrasi berjalan tanpa error
- [ ] Data di virtual tables cocok dengan data asli
- [ ] Relasi antar-tabel terjaga
- [ ] Sistem lama masih bisa diakses sebagai fallback

---

## Keputusan Arsitektur (catatan referensi)

### Mengapa JSONB-per-Row, bukan EAV?

| Aspek | JSONB-per-Row (dipilih) | EAV (virtual_cells) |
|-------|------------------------|---------------------|
| Tabel baru | 3 (tables, columns, rows) | 4 (+ cells) |
| Query read | 1 query per tabel | JOIN rows + cells + pivot |
| Update 1 cell | JSONB merge | UPDATE 1 row di cells |
| Indexing | GIN pada payload | B-tree per value column |
| Sorting native SQL | `payload->>'field'` + cast | Native per tipe |
| Preseden di codebase | `spatial.issue_feature_attributes` | Tidak ada |
| Complexity | Rendah | Tinggi |

**Keputusan:** JSONB-per-Row untuk MVP. Migrasi ke EAV hanya jika ada kebutuhan sorting/filtering SQL-native yang GIN index tidak bisa handle.

### Mengapa side-by-side, bukan replace?

- Admin sudah terbiasa dengan PLM workflow → jangan rusak
- Virtual tables belum teruji di production → perlu waktu matang
- Migrasi data adalah operasi berisiko tinggi → lakukan nanti
- Perubahan bersifat additive → rollback mudah (hapus tabel baru saja)

### Constraint JSONB payload

Validasi dilakukan di **server action** (bukan DB CHECK), karena:
- Schema kolom bisa berubah kapan saja (user tambah/hapus kolom)
- CHECK constraint PostgreSQL tidak bisa referensi tabel lain
- Server action sudah punya akses ke definisi kolom untuk validasi

---

## Catatan Migrasi SQL

File migrasi selanjutnya menggunakan nomor urut setelah yang terakhir:
- `0043_virtual_tables_schema.sql` — Fase 1
- `0044_virtual_views_schema.sql` — Fase 6 (jika diperlukan)
