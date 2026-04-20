# Roadmap & catatan: import geometri, DXF, atribut, mapping

Dokumen ini **dipantau bersama** sebagai catatan keputusan produk, apa yang sudah ada di kode, batasan, dan ide fase berikutnya. Update isi ini setiap ada perubahan besar perilaku atau scope.

**Panduan pengguna (operasional):** halaman aplikasi **`/help/spatial-import`** + berkas [`spatial-import-user-guide.md`](./spatial-import-user-guide.md) (CRS, `feature_key`, format impor).

---

## 1. Model data yang jadi acuan

| Konsep | Penjelasan singkat |
|--------|---------------------|
| **Unit kerja** | Issue di project (`issue_id`). Dialog simpan geometri selalu terikat unit kerja terpilih. |
| **`feature_key`** | String pengenal fitur geometri dalam satu unit kerja. **Penyambung** antara geometri (`issue_geometry_features` / view peta) dan atribut tabular (`issue_feature_attributes`). |
| **Tanpa FK otomatis** | Import CSV atribut **tidak wajib** ada geometrinya dulu; geometri bisa menyusul. Kunci cocok hanya jika **`issue_id` + `feature_key` sama persis** (perhatikan typo & konsistensi huruf). |
| **CRS** | SRID sumber dari form (daftar EPSG yang sama untuk GeoJSON & DXF); penyimpanan mengikuti pipeline PostGIS (transform ke WGS84 sesuai RPC yang ada). |

---

## 2. Yang sudah ada di aplikasi (ringkas)

### 2.1 View Map — tinggi peta & dialog geometri

- Peta workspace mengisi sisa tinggi panel (rantai flex + opsi ScrollArea `fillAvailableHeight` saat tab Map aktif).
- Dialog **Simpan / hapus geometri**: menampilkan **scope unit kerja** (`selectedScopePath`) agar jelas target unit kerja.
- Dialog simpan geometri: **`<details>` petunjuk** ringkas (`feature_key`, CRS, batas ukuran) + tautan **`/help/spatial-import`** dan `docs/spatial-import-user-guide.md`.

### 2.2 GeoJSON (tab Map, mode GeoJSON)

- File GeoJSON / JSON; mendukung Feature tunggal, Polygon/MultiPolygon, atau **FeatureCollection** (batch).
- Batch memakai **prefix** `feature_key` opsional + key dari properti fitur bila ada; **tabel Feature key & label** per poligon (editable, mengisi ulang saat prefix atau file berubah) — simpan memakai payload GeoJSON yang sudah disisipkan `feature_key` / `label` per fitur + **prefix kosong** ke server.
- **ZIP shapefile** (`.shp` + `.dbf`, idealnya `.shx` + `.prj`) di area yang sama: klien memakai **shpjs** → FeatureCollection hanya **Polygon / MultiPolygon**; bila ZIP berisi beberapa set shapefile, **dropdown layer** memilih `.shp` mana yang dimuat ke textarea batch. Batas ukuran **ZIP** ~**36 MB** (`MAX_SHAPEFILE_ZIP_BYTES`); setelah konversi, batas teks **~12 MB** ke server tetap berlaku seperti GeoJSON biasa.
- **Batas ukuran teks** payload GeoJSON (single & batch) sama dengan DXF: ~**12 MB**; pesan error server/klien memakai `spatial-import-limits.ts`.

### 2.3 Atribut di view Tabel (`spatial-attributes-panel`)

- **Baris manual** + **`feature_key`** tanpa geometri.
- **Import CSV** dengan kolom key (default nama kolom `feature_key`) → upsert ke `issue_feature_attributes`.
- **Unduh template CSV** minimal satu kolom `feature_key` (dialog import atribut).

### 2.4 DXF (tab Map, mode DXF) — fase 1 + mapping key (langkah kecil)

- File **`.dxf`** (teks), pilih **layer**, **prefix `feature_key` opsional** (mengisi ulang default di tabel), SRID dari daftar yang sama dengan GeoJSON.
- **LWPOLYLINE** & **POLYLINE tertutup** pada layer terpilih; **bulge (arc)** diraster; **INSERT** pada layer yang sama diekspansi ke poligon dari definisi blok (LW/PL tertutup di blok → WCS; skala XY, rotasi derajat, translasi; array kolom/baris sederhana; **tanpa** HATCH di dalam blok / INSERT bersarang); **HATCH** pada layer yang sama (teks DXF, boundary poliline / garis+busur; spline/ellips edge belum); **Z diabaikan**. Daftar layer: entitas ter-parse + layer HATCH di `ENTITIES`.
- **Tabel mapping**: satu baris per poligon (urutan = urutan entitas di `dxf.entities`) dengan kolom **Feature key** dan **Label (opsional)**. Default key dari pola `{prefix}{slug-layer}-{nomor}`; mengubah **prefix** atau **layer** mengatur ulang key + label kosong di tabel.
- **Tempel daftar key**: textarea satu key per baris + tombol **Terapkan ke kolom Feature key** (mengisi dari atas; baris ekstra diabaikan; lebih sedikit baris hanya mengisi sebagian).
- **Saran key dari atribut**: daftar `feature_key` yang punya baris `issue_feature_attributes` untuk unit kerja ini tetapi belum punya geometri; chip menambah ke textarea, **Salin semua ke textarea tempel**, **Terapkan ke tabel (urutan terurut)**.
- **Pratinjau peta mapping**: poligon hasil parse diproyeksikan ke WGS84 (`proj4`, SRID yang sama dengan form) di peta kecil; **klik poligon ↔ sorot baris tabel** (scroll baris ke area terlihat).
- **Unduh template CSV** `feature_key` + `label` untuk spreadsheet lapangan (selaras dengan tempel daftar key & tabel mapping).
- Simpan mengirim **`feature_keys_json`** dan opsional **`feature_labels_json`** (array string, boleh kosong per elemen → pakai label default `DXF {layer} #n`). Bila `feature_keys_json` tidak ada, fallback ke prefix + pola otomatis (kompatibilitas).
- Properti geometri disisipkan: `source: "dxf"`, `dxf_layer`, `dxf_polygon_index`.

**Referensi kode (utama):**

- `app/src/lib/dxf-import-utils.ts` — parse, layer, ekstrak ring, penamaan key.
- `app/src/lib/crs-reproject.ts` — ring DXF → GeoJSON WGS84 untuk pratinjau (`proj4`).
- `app/src/app/dxf-mapping-preview-map.tsx` — Leaflet mini untuk dialog DXF.
- `app/src/app/issue-geometry-feature-actions.ts` — `upsertIssueGeometryFeaturesFromDxfAction`.
- `app/src/app/workspace-client.tsx` — UI toggle GeoJSON / DXF, pratinjau jumlah poligon & contoh key.
- `app/src/app/help/spatial-import/page.tsx` — halaman bantuan impor spasial (publik).
- `app/src/lib/spatial-import-limits.ts` — batas teks (~12 MB), batas ZIP shapefile (~36 MB), template CSV + pesan error seragam.
- `app/src/lib/shapefile-import-utils.ts` — parse ZIP → layer poligon untuk alur batch GeoJSON.
- `app/src/lib/geojson-multipolygon.ts` — ekstraksi Polygon/MultiPolygon + WKT (dipakai server & klien).
- `app/src/lib/geojson-batch-mapping-utils.ts` — baris poligon batch, default key/label, apply mapping ke FeatureCollection.

---

## 3. Batasan & risiko yang disadari (jangan lupa)

| Topik | Catatan |
|-------|---------|
| **Urutan poligon DXF** | Urutan baris di tabel = urutan parser file. User **bisa mengubah string `feature_key`** per baris. Di dialog impor ada **pratinjau peta** (Leaflet + proyeksi ke WGS84 untuk SRID di form) untuk **klik poligon ↔ sorot baris**; bukan penyuntingan geometri di peta workspace utama. |
| **Bulge / arc** | Sudah di-flatten jadi polyline (sampling busur); presisi tergantung langkah adaptif (~4–192 segmen per arc). |
| **INSERT / block** | INSERT pada layer impor: blok diekspansi ke LW/PL tertutup (WCS). HATCH di dalam blok, INSERT bersarang, dan extrusion mirror belum ditangani. |
| **HATCH** | Boundary poliline / garis+busur di `ENTITIES` diekstrak jadi ring; path **spline / ellips** dilewati; urutan ring = poliline dari parser dulu, lalu hatch. |
| **Ukuran file** | Batas teks **~12 MB** untuk GeoJSON (single & batch), DXF, dan pratinjau klien; konstanta `MAX_SPATIAL_GEOMETRY_TEXT_CHARS` di `spatial-import-limits.ts`. ZIP shapefile di klien dibatasi **~36 MB** (`MAX_SHAPEFILE_ZIP_BYTES`). |
| **Shapefile / shpjs** | Hanya **poligon** yang dipertahankan; titik/garis di `.shp` diabaikan. **`.prj`**: parser dapat mengonversi ke lon/lat — user harus memilih **EPSG:4326** di form bila koordinat sudah WGS84; tanpa `.prj`, SRID manual harus cocok dengan koordinat mentah di `.shp`. |
| **Validitas topologi** | Polygon kompleks/self-intersect bisa gagal di PostGIS — pesan error per fitur di batch. |
| **Bantuan `/help/`** | Route di bawah `/help/` **publik** (tanpa login) untuk dokumentasi UI; tidak menampilkan data project. |

---

## 4. Backlog ide / fase berikutnya (prioritas bisa diubah)

Centang `[ ]` → `[x]` saat fase selesai; tambahkan tanggal di baris bawah jika perlu.

### 4.1 Mapping `feature_key` per poligon (DXF & mungkin batch GeoJSON)

**Ide:** Setelah parse, tampilkan **tabel** satu baris per poligon dengan **`feature_key` editable** (default dari aturan sekarang), opsional label, indikator “key ini sudah punya atribut / belum / bentrok”. Simpan memakai key hasil mapping, bukan murni urutan file.

**Status (2026-04):**

- [x] Tabel **# + Feature key** per poligon DXF; simpan lewat `feature_keys_json` (lihat §2.4).
- [x] **Label opsional** per baris (`feature_labels_json`; kosong = label default `DXF {layer} #n`).
- [x] Isi berurutan dari daftar key (paste / CSV satu kolom → textarea + terapkan ke kolom Feature key).
- [x] Saran key dari atribut yang **belum punya geometri** untuk `issue_id` ini (chip + salin semua ke textarea + terapkan urutan terurut ke tabel).
- [x] Klik poligon di pratinjau peta dialog ↔ sorot baris tabel (dan sebaliknya, klik baris di luar input).
- [x] **Batch GeoJSON / shapefile (FeatureCollection):** tabel **Feature key + label** per poligon (filter sama server); prefix mengatur ulang default dari properti file.

### 4.2 DXF — penyempurnaan geometri

- [x] Flatten **bulge** (arc) → deretan vertex untuk LWPOLYLINE/POLYLINE (pusat busur + sampling sudut; penutup `shape` vs titik awal/akhir duplikat ditangani).
- [x] Dukung **HATCH** sebagai sumber area (boundary poliline + edge garis/busur; teks DXF + section `ENTITIES`).
- [x] **EXPAND INSERT** / block reference — scope v1: INSERT pada layer impor → LW/PL tertutup di `dxf.blocks[name]` ke WCS (skala, rotasi °, translasi; kolom/baris × spacing); tanpa HATCH dalam blok / INSERT bersarang.

### 4.3 Format lain

- [x] **Shapefile ZIP** — klien **shpjs** (`parseZip`), filter Polygon/MultiPolygon, pemilih layer jika beberapa `.shp` dalam satu ZIP; batas ZIP & CRS dijelaskan di dialog Map (§2.2, §3). **Belum:** impor folder tanpa ZIP, titik/garis, pipeline GDAL sisi server.
- [x] Ekspor / unduh template CSV (`feature_key` + `label` di dialog DXF; kolom `feature_key` saja di import atribut tab Tabel).

### 4.4 UX & operasional

- [x] Dokumentasi user-facing: **`docs/spatial-import-user-guide.md`** (CRS, key, format) + petunjuk ringkas di dialog Map (`<details>`).
- [x] Halaman bantuan **di dalam aplikasi**: route **`/help/spatial-import`** (`help/spatial-import/page.tsx`), publik lewat middleware (`/help/`).
- [ ] **CMS / penyuntingan** konten bantuan oleh non-developer (opsional).
- [x] Batas ukuran & pesan error yang konsisten antar format (~12 MB teks; `spatialGeometryTextTooLargeMessage`; cek ukuran saat baca file GeoJSON/DXF di klien).

---

## 5. Cara memakai dokumen ini

1. **Rencana / diskusi baru** → tambahkan sub-bagian di §4 (atau §3 jika itu batasan yang baru disadari).
2. **Fitur dirilis** → pindahkan ringkasan ke §2, centang item di §4, tautkan PR/commit jika perlu.
3. **Keputusan produk berubah** → edit §1 dan teks terkait di §2/§3 agar tidak kontradiksi.

---

*Terakhir diperbarui: tabel mapping key/label untuk batch GeoJSON (FeatureCollection); sesuaikan lagi saat fase berikutnya selesai.*
