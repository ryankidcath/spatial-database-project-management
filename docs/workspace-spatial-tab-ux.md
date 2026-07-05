# Tab Spasial — keputusan UX & arsitektur

**Status:** keputusan produk (2026-07); UI refactor **belum** diimplementasi.  
**Tujuan:** tab **Spasial** terasa satu «vibe» dengan tab **Data** dan **Chat** (master–detail, toolbar satu baris, peta dominan), dengan scope **tabel virtual + kolom geometry** — bukan alur legacy unit kerja.

**Referensi terkait:**

| Dokumen | Isi |
|---------|-----|
| `docs/workspace-navigation-and-views.md` | Tab workspace vs view switcher per tabel |
| `docs/spatial-import-roadmap.md` | Impor GeoJSON/DXF, CRS, batas ukuran (legacy + vtable) |
| `docs/virtual-tables-migration-plan.md` | Model tabel virtual menggantikan issue geometry |
| `docs/workspace-spatial-gis-roadmap.md` | Backlog fitur GIS tab Spasial, biaya basemap/API |

**Kode terkait (anchor):**

| Area | File |
|------|------|
| Tab Spasial (UI saat ini) | `app/src/app/workspace-spatial-view.tsx`, `workspace-spatial-geometry-dialog.tsx` (legacy geom) |
| Peta workspace | `app/src/app/workspace-map.tsx` |
| Impor GeoJSON/DXF ke vtable | `virtual-table-geojson-import-dialog.tsx`, `virtual-table-dxf-import-dialog.tsx` |
| View **Peta** per tabel (tab Data) | `virtual-table-map-view.tsx` + `table-view-switcher.tsx` |
| Panel kanan global | `app/src/app/workspace-right-panel.tsx`, `workspace-right-panel-context.tsx` (`openRowDetail`, kind `row-detail`) |
| Popup klik geometri (saat ini) | `app/src/app/workspace-map.tsx` — Leaflet `bindPopup` |
| Metadata fitur vtable di peta | `app/src/lib/virtual-table-map-popup.ts`, `virtual-table-map-footprints.ts` |

---

## 1. Dua lapisan peta — bedanya apa?

Ini yang paling sering membingungkan. Ada **dua tempat** menampilkan geometri, dengan **scope berbeda**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TAB SPASIAL (workspace)                                                │
│  · Satu peta untuk SELURUH ruang kerja                                  │
│  · Banyak sumber sekaligus: semua tabel virtual yang punya kolom geom   │
│  · Impor batch, layer on/off, pratinjau impor                          │
│  · Analog: «GIS desktop» / peta proyek                                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  VIEW PETA (di dalam tab Data, per satu tabel)                          │
│  · Hanya baris SATU tabel + filter/saved view aktif                     │
│  · Kolom geometry dipilih di toolbar (picker «Kolom peta»)              │
│  · Tidak ada impor multi-tabel; fokus analisis / klik baris             │
│  · Analog: «mini-map» seperti view Kanban/Kalender                      │
└─────────────────────────────────────────────────────────────────────────┘
```

| Aspek | Tab **Spasial** | View **Peta** (switcher di Data) |
|--------|------------------|-----------------------------------|
| **Lokasi** | Tab utama workspace | Detail satu tabel di tab Data |
| **Scope data** | Multi-tabel + (sementara) legacy issue geom | Satu `virtual_table` |
| **Filter** | Layer on/off per tabel | Filter/sort/group saved view tabel |
| **Impor** | GeoJSON/DXF ke tabel; buat tabel dari file | Tidak (impor dari tab Spasial atau dialog tabel) |
| **Label UI** | Tab: **Spasial** | Switcher: **Peta** (bukan «Spasial») |
| **`ViewId` internal** | `Map` | `layoutType: "map"` di `VirtualViewConfig` |

**Kesimpulan praktis:** pengguna yang hanya mengurus **satu tabel** bisa kerja di tab Data (view Peta). Tab **Spasial** untuk **gambaran geografis seluruh ruang kerja** dan **workflow impor/lapisan**.

### 1.1 Dua kotak impor di UI lama (bukan dua jenis peta)

Di toolbar Spasial saat ini ada dua area yang terlihat mirip — ini **bukan** tab Spasial vs view Peta, melainkan **dua target impor ke tabel virtual**:

| UI lama | Fungsi |
|---------|--------|
| **+ Layer baru dari file** | Buat **tabel virtual baru** (`no_bidang` + kolom geometry) dari GeoJSON/DXF |
| **Tabel impor** + GeoJSON/DXF | Impor ke **tabel yang sudah ada** (dropdown pilih tabel) |

Keduanya tetap relevan untuk model **tabel virtual**; yang akan dirapikan adalah **satu entry point** (dialog/wizard), buang kotak ganda di header.

---

## 2. Legacy geometri unit kerja — status & keputusan

### 2.1 Apa itu «legacy geometri unit kerja»?

Alur lama (pre–virtual table penuh):

- Geometri disimpan di `issue_geometry_features`, terikat **`issue_id`** (unit kerja / task).
- Atribut tabular terpisah di `issue_feature_attributes`, disambung dengan string **`feature_key`** (bukan FK ketat).
- Dialog «Simpan geometri unit kerja» di tab Spasial + checkbox lapisan **«Geometri»**.

### 2.2 Keputusan (2026-07)

| Keputusan | Detail |
|-----------|--------|
| **Arah produk** | Hanya **tabel virtual** (kolom `geometry` + baris di `virtual_rows`). |
| **Legacy** | Tetap di **branch `main`** untuk **1 proyek** yang sudah terlanjur pakai; **jangan** dikembangkan fitur baru di atasnya. |
| **Refactor UX Spasial (dev)** | Fokus **vtable saja** — rail lapisan per tabel, impor ke vtable, tanpa promosi UI unit kerja. |
| **Penghapusan kode** | Setelah migrasi proyek di `main` selesai: hapus checkbox «Geometri», dialog geom issue, `SpatialAttributesPanel`, dll. |

**Catatan implementasi:** sampai legacy dihapus, kode lama boleh tetap ada di `workspace-client.tsx` tetapi **disembunyikan** dari UI refactor dev (bukan jalur utama; tidak di menu «⋯» kecuali untuk kebutuhan `main` sementara).

---

## 3. Default lapisan saat buka tab Spasial

| Keputusan | Nilai |
|-----------|--------|
| **Lapisan aktif saat pertama buka / ganti ruang kerja** | **Semua lapisan aktif** (semua tabel virtual ber-geometry yang terlihat di scope + pratinjau impor jika ada). |
| **Persistensi on/off per tabel (SQ2)** | ✅ **Ya** — `localStorage`, key per `project_id` + `table_id`; bila belum ada entri → default **on**. |
| **Key usulan** | `spatial-pm-map-layers-v1:{projectId}` → `{ [tableId]: boolean }` |

Pertama kali buka Spasial: semua layer on. Setelah user mematikan layer, pilihan **diingat** untuk kunjungan berikutnya pada ruang kerja yang sama.

---

## 4. `SpatialAttributesPanel` — apa itu & apa yang dilakukan?

### 4.1 Definisi

`SpatialAttributesPanel` (`spatial-attributes-panel.tsx`) adalah **grid atribut legacy** untuk pasangan **unit kerja + `feature_key`**:

- Menampilkan gabungan baris dari **geometri issue** dan **atribut tanpa geometri** (`issue_feature_attributes`).
- Fitur: pencarian, pagination, tambah baris manual, edit properti, import CSV (`feature_key` + kolom bebas), hapus geometri/atribut.
- Data tidak di tabel virtual — terpisah di tabel issue PM lama.

### 4.2 Di mana dipakai sekarang?

**Tidak dirender** di UI workspace saat ini. Komponen ada di repo; `workspace-client.tsx` masih menghitung `issueGeometryRowsForTableView` tetapi **tidak** meneruskannya ke panel mana pun. Dokumen `spatial-import-roadmap.md` §2.3 masih menyebut «view Tabel» — itu **rencana/riwayat**, bukan perilaku aktif.

### 4.3 Pengganti di model baru

| Legacy | Pengganti |
|--------|-----------|
| Baris atribut per `feature_key` | **Baris `virtual_rows`** di tabel (mis. `no_bidang`, status, dll.) |
| Geometri issue | **Kolom `geometry`** di tabel virtual yang sama |
| Import CSV atribut | Import kolom via grid / impor GeoJSON-DXF yang mengisi baris + geom |
| Panel «Atribut Spasial» | Tab **Data** (grid / form / detail baris) + tab **Spasial** (peta multi-layer) |

### 4.4 Keputusan untuk refactor tab Spasial

| Keputusan | Detail |
|-----------|--------|
| **Integrasi ke tab Spasial?** | **Tidak.** Panel ini bagian alur legacy; tidak masuk rail/toolbar Spasial baru. |
| **Setelah migrasi main** | Hapus komponen + data path `issue_feature_attributes` dari UX (mungkin tetap di DB sampai migrasi data). |

---

## 5. Target UX (selaras Data & Chat)

Prinsip dari diskusi 2026-07 — **belum di-code**:

### 5.0 Rail collapsible — keputusan SQ1 (lintas tab)

**Keputusan (2026-07):** pakai **rail kiri yang bisa disembunyikan** (collapsible), **default terbuka**, di **tab Data, Chat, dan Spasial** — bukan memilih antara rail permanen atau popover saja.

Ini memenuhi dua kebutuhan sekaligus:

- **Navigasi jelas** (master–detail seperti sekarang) saat rail terbuka
- **Area kerja full** saat rail dilipat (peta / grid / obrolan melebar)

Sidebar **global** workspace (org / ruang kerja / unit kerja) **sudah** collapsible (`PanelLeft` di header, `isSidebarCollapsed`). Pola yang sama diperluas ke **rail dalam tab**.

```
┌ Sidebar ─┬─ [◧] Rail tab ─┬─ Area kerja ─────────────┬─ Panel kanan ─┐
│ global   │  (collapsible) │  peta / grid / chat      │  (opsional)   │
│ collapse │  default: open │  FULL saat rail tutup     │  detail baris │
└──────────┴───────────────┴──────────────────────────┴───────────────┘
```

#### Isi rail per tab

| Tab | Isi rail (saat terbuka) | Lebar target |
|-----|-------------------------|--------------|
| **Data** | Daftar tabel + cari (isi `WorkspaceTableBrowser` hari ini) | `max-w-[22rem]` |
| **Chat** | Inbox obrolan + cari | `max-w-[22rem]` |
| **Spasial** | Daftar lapisan (toggle on/off per tabel virtual) + cari | `max-w-[22rem]` |

#### Perilaku collapse

| Aspek | Keputusan |
|-------|-----------|
| **Toggle** | Tombol di **kiri header area kerja** (ikon `PanelLeft` / `PanelLeftClose`), selaras sidebar global |
| **Animasi** | `transition-[width]` + `aria-hidden` / `inert` saat tertutup (sama sidebar) |
| **Persistensi** | `localStorage` per tab, mis. `spatial-pm-workspace-rail:{Data\|Chat\|Map}` |
| **Default** | **Terbuka** |
| **Saat rail tutup** | Spasial: kontrol layer tetap lewat **popover «Lapisan ▾»** di toolbar (bukan pengganti rail, melainkan **fallback**) |

#### Komponen bersama (rencana)

Ekstrak `WorkspaceCollapsibleRail` — dipakai **Data, Chat, dan Spasial dalam satu roll-out** (satu PR / fase S3), bukan Spasial saja.

#### Warna layer (SQ3)

✅ **Rotasi otomatis** — palet tetap, warna per `table_id` ditetapkan dari urutan tabel (mis. `position` / urutan di rail), bukan picker manual pengguna.

#### Mobile

Tidak pakai collapse rail; tetap pola **daftar → layar penuh** (sudah ada di Data & Chat).

#### Tiga kolom sempit

Sidebar global + rail tab + panel kanan boleh aktif bersamaan (**SQ4 ✅ A**): **tidak** auto-tutup rail atau sidebar saat panel detail terbuka — pengguna lipat manual. Tombol «Fokus» (tutup keduanya) ditunda ke fase polish.

**SQ1:** ✅ **Rail collapsible, default terbuka** — lihat juga §8 untuk panel kanan saat klik geometri.

---

### 5.1 Layout tab Spasial (dengan rail collapsible)

```
┌─ Rail kiri (~22rem, collapsible) ─┬─ Pane peta (flex-1) ────────────────────────┐
│ [◧] Cari lapisan                 │ [◧] [Lapisan▾] [Impor▾] [+Layer] [⋯]        │
│ ☑ Daftar Bidang (133)            │                                              │
│ ☑ Progres Desa (152)             │           WorkspaceMap                        │
│ ☐ Pratinjau impor (3)             │    (klik poligon → panel kanan, §8)          │
└──────────────────────────────────┴──────────────────────────────────────────────┘
                                                      ┌─ Panel kanan ─────────────┐
                                                      │ Detail baris (vtable)   │
                                                      └───────────────────────────┘
```

- **Rail** = analog daftar tabel (Data) / inbox (Chat); bisa dilipat untuk peta full.
- **Toolbar** = satu baris, tanpa kotak bordered ganda seperti UI lama.
- **Klik geometri vtable** → **panel kanan** detail baris (§8), bukan popup di tengah peta.

### 5.2 Toolbar (usulan)

| Kontrol | Fungsi |
|---------|--------|
| **Lapisan ▾** | Popover: toggle per tabel virtual (+ pratinjau); default semua aktif |
| **Impor ▾** | GeoJSON / DXF → tabel existing (pilih di dialog) |
| **+ Layer** | Buat tabel baru dari file (shortcut surveyor) |
| **⋯** | Bantuan impor, (sementara) legacy geom — disembunyikan setelah migrasi |

### 5.3 Rail collapsible di tab Data & Chat

Refactor UX Spasial **sekaligus** memperkenalkan pola yang sama di:

| Tab | Perubahan |
|-----|-----------|
| **Data** | Bungkus daftar tabel di `WorkspaceCollapsibleRail`; toggle di header `VirtualTableView` atau border rail |
| **Chat** | Bungkus inbox di `WorkspaceCollapsibleRail`; toggle di header percakapan |
| **Spasial** | Rail lapisan baru dengan pola identik |

Satu vibe: **semua tab permukaan kerja bisa «full»** tanpa meninggalkan navigasi master–detail.

### 5.4 Yang sengaja tidak disamakan dengan Data

- Tab Spasial tetap **multi-tabel** — bukan satu tabel + view switcher.
- View **Peta** di Data tetap untuk konteks **satu dataset + filter view**.

---

## 6. Klik geometri → panel kanan (bukan popup peta)

### 6.1 Perilaku saat ini

`WorkspaceMap` (`workspace-map.tsx`) memakai **Leaflet `bindPopup`** pada setiap poligon:

- Popup muncul **di atas peta** (umumnya dekat titik klik / anchor geometri), class CSS `workspace-map-popup`.
- Isi HTML dibangun di `popupHtmlWithGeoJson`: judul baris, daftar atribut (key/value), tombol **«Chat baris»** untuk layer `virtual_table`.
- Metadata vtable disisipkan di properti GeoJSON: `_virtual_row_id`, `_popup_row_title`, `_virtual_table_id`, dll. (`virtual-table-map-popup.ts`).
- Tab Spasial hanya meneruskan `onVirtualRowChat` ke `openVirtualRowChatPanel` — **bukan** membuka detail baris.
- View **Peta** per tabel (`virtual-table-map-view.tsx`) juga memakai `WorkspaceMap` yang sama → popup yang sama.

**Masalah UX:**

- Popup menutupi area kerja peta, terasa «terpisah» dari pola Data/Chat.
- Detail tidak konsisten dengan **panel kanan** (`row-detail`) yang sudah dipakai «Buka berdampingan» dari Chat.
- Sulit membaca banyak atribut di kotak kecil di tengah peta.

### 6.2 Perilaku target (keputusan 2026-07)

| Aspek | Keputusan |
|-------|-----------|
| **Klik poligon vtable** | Buka **panel kanan** `kind: "row-detail"` via `openRowDetail()` — **bukan** panel `row` dengan tab Chat (chat lewat aksi di `RowDetailSection` / buka chat terpisah) |
| **Isi panel** | `RowDetailSection` — payload baris, path konteks, kolom tabel (sama detail baris di Data) |
| **Popup Leaflet** | **Dihapus** untuk layer `virtual_table` (tab Spasial + view Peta) |
| **Sorot peta** | Poligon terpilih disorot (style berbeda) selama panel terbuka untuk baris itu |
| **Chat baris** | Dari header panel (`row` dengan tab Chat) atau tombol di `RowDetailSection` — bukan satu-satunya aksi di popup |
| **Legacy `issue_geometry`** | Sementara boleh tetap popup sampai kode legacy dihapus (§2); **tidak** dikembangkan |

### 6.3 Alur desktop (target)

```
Klik poligon di WorkspaceMap
        │
        ▼
Ekstrak tableId + rowId dari feature.properties (_virtual_row_id, _virtual_table_id)
        │
        ▼
openRowDetail({ tableId, rowId, pathSegments, rowPayload, relationLabels })
        │
        ▼
WorkspaceRightPanel — RowDetailSection
        │
        ├── (opsional) user buka tab Chat di panel row
        └── tutup panel → hapus sorot poligon
```

**Tab aktif:** panel kanan harus tampil saat user di tab **Spasial** (sama seperti tab Data). Saat ini `WorkspaceRightPanel` menyembunyikan kind chat jika `chatTabActive`; kind **`row-detail` tetap diizinkan** di semua tab permukaan kerja.

### 6.4 Mobile

- Tidak ada panel kanan desktop; **tap poligon → layar penuh** detail baris (selaras overlay / navigasi mobile tab Data).
- Popup Leaflet di mobile dihapus untuk vtable — ganti tap → halaman detail.

### 6.5 Perubahan kode (anchor implementasi)

| Area | Perubahan |
|------|-----------|
| `workspace-map.tsx` | Ganti `bindPopup` untuk `virtual_table` → `click` handler; callback baru `onVirtualRowSelect?` |
| `workspace-client.tsx` | Tab Spasial: `onVirtualRowSelect` → fetch/resolve payload → `openRowDetail` |
| `virtual-table-map-view.tsx` | Teruskan `onOpenRow` / `openRowDetail` ke `WorkspaceMap` |
| `virtual-table-view.tsx` | View Peta: klik poligon → `openRowDetail` (embedded) atau panel global |
| CSS | Kurangi / hapus styling `workspace-map-popup` untuk vtable |

### 6.6 Acceptance

- [x] Klik bidang di tab Spasial → panel kanan detail baris, **tanpa** popup di tengah peta.
- [x] Klik bidang di view Peta (tab Data) → perilaku sama (panel kanan atau inline jika `embeddedInRightPanel`).
- [x] Poligon aktif tersorot; klik poligon lain mengganti isi panel.
- [x] Klik area kosong peta / tutup panel → sorot hilang.
- [ ] «Chat baris» masih bisa diakses dari panel detail.

---

## 7. Fase implementasi (usulan)

| # | Fase | Deliverable | Catatan |
|---|------|-------------|---------|
| **S0** | Dokumen | File ini + tautan di `workspace-navigation-and-views.md` | ✅ 2026-07 |
| **S1** | Ekstrak komponen | `workspace-spatial-view.tsx` dari `workspace-client.tsx` | ✅ Tanpa ubah perilaku |
| **S2** | Toolbar 1 baris | Popover Lapisan + Impor + Layer; vtable-only UI | ✅ 2026-07 |
| **S3** | `WorkspaceCollapsibleRail` | Rail collapsible di **Data, Chat, Spasial** | ✅ 2026-07 |
| **S4** | Rail lapisan Spasial | Daftar layer vtable; ganti checkbox lama | ✅ 2026-07 |
| **S5** | Klik geometri → panel kanan | Hapus popup vtable; `openRowDetail` | ✅ 2026-07 |
| **S6** | Dialog impor terpadu | Wizard target tabel + format + pratinjau | ✅ 2026-07 |
| **S7** | Hapus legacy | Setelah proyek `main` migrasi | Geom issue + `SpatialAttributesPanel` |
| **G-A…G-G** | Fitur GIS lanjutan | Lihat `docs/workspace-spatial-gis-roadmap.md` | G-A ✅ G-B ✅; G-C… freeze $0 dulu |

---

## 8. Keputusan produk (ringkas — siap implementasi)

| ID | Topik | Keputusan |
|----|--------|-----------|
| SQ1 | Rail lapisan | ✅ Rail **collapsible**, default terbuka; Data + Chat + Spasial — §5.0 |
| SQ2 | Persistensi layer on/off | ✅ **Ya**, `localStorage` per `project_id` + `table_id`; default on — §3 |
| SQ3 | Warna layer | ✅ **Rotasi otomatis** (palet tetap) |
| SQ4 | Sidebar + rail + panel kanan | ✅ **Biarkan ketiganya terbuka**; lipat manual |
| SQ5 | Klik geometri | ✅ **Panel kanan** `row-detail`; hapus popup vtable — §6 |
| — | Jenis panel klik peta | **`row-detail` saja** (bukan tab Detail+Chat) |
| — | Mobile tap poligon | **Layar penuh** detail baris |
| — | Posisi toggle rail | **Kiri header** area kerja |
| — | Legacy di UI dev | **Disembunyikan** (kode tetap sampai migrasi `main`) |
| — | Roll-out `WorkspaceCollapsibleRail` | **Ketiga tab sekaligus** (fase S3) |

Tidak ada pertanyaan terbuka yang menghalangi fase **S1–S5**. Fase **S6–S7** (impor wizard, hapus legacy) tetap terjadwal terpisah.

---

## 9. Changelog (dokumen)

| Tanggal | Perubahan |
|---------|-----------|
| 2026-07-05 | G-B GIS surveyor (ukur, identify, go to XY, diff impor, export PNG) |
| 2026-07-05 | **§11** pola data A/B/C & fase **G-H** — lihat `workspace-spatial-gis-roadmap.md` |
| 2026-07-05 | Tautan ke `workspace-spatial-gis-roadmap.md`; fase G-A…G-G di §7 |
| 2026-07-05 | S6 ✅ wizard impor terpadu; satu tombol Impor; embedded dialog forms |
| 2026-07-05 | S5 ✅ klik poligon vtable → panel `row-detail`; sorot + tanpa popup Leaflet |
| 2026-07-05 | S4 ✅ rail lapisan utama; toggle Eye; pratinjau impor; popover fallback saat rail tutup |
| 2026-07-05 | S3 ✅ `WorkspaceCollapsibleRail` di Data, Chat, Spasial; persist rail per tab |
| 2026-07-05 | S2 ✅ toolbar satu baris; popover Lapisan/Impor; persist layer; legacy UI disembunyikan |
| 2026-07-05 | SQ2–SQ4 + keputusan implementasi (panel, mobile, legacy, roll-out) — §8 lengkap |
| 2026-07-05 | SQ1 ✅ rail collapsible lintas Data/Chat/Spasial; §6 klik geometri → panel kanan (ganti popup) |
| 2026-07-05 | §5.0: penjelasan SQ1 Rail vs Popover (koreksi: bukan beda dua «peta») |
| 2026-07-05 | Dokumen awal: tab Spasial vs view Peta (§1), legacy, default lapisan aktif, `SpatialAttributesPanel` |
