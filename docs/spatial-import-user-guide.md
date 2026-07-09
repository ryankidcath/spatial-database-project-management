# Panduan pengguna: impor geometri & workbench surveyor

Ringkasan operasional untuk tim lapangan dan admin. Detail teknis ada di [`spatial-import-roadmap.md`](./spatial-import-roadmap.md). Strategi produk: [`surveyor-workbench-strategy.md`](./surveyor-workbench-strategy.md).

**Di aplikasi (tanpa repositori):** buka **`/help/spatial-import`** pada host Anda (halaman bantuan dapat diakses tanpa login).

---

## 0. Alur resmi — produksi bidang di Portal (tabel virtual)

**Deliverable geometri** = baris di **tabel virtual** ruang kerja (terlihat di tab **Spasial** dan **Data**), bukan file `.dwg` di folder pribadi.

**Kunci penghubung** atribut ↔ geometri: kolom kunci upsert, biasanya **`no_bidang`** (atau `nib` — sama di CSV admin dan impor surveyor).

### Pilih jalur sesuai sumber data

| Situasi | Jalur di Portal | Menu |
|--------|-----------------|------|
| Titik koordinat dari TS/GPS/Excel (satu file, tanpa kode jenis) | **Titik lapangan mentah** | Tab Spasial → Impor → «Titik lapangan → tabel baru» |
| Siapkan tabel untuk digitasi (belum ada geometri) | **Bootstrap layer kosong** | Impor Spasial → «Buat tabel layer kosong» → Bidang / Jalan / Saluran |
| Titik per bidang (sudah ada no_bidang) | **Bidang dari titik** / **Arsip titik** | Format workbench di wizard |
| Titik lapangan disimpan dulu (audit/revisi) | **Arsip titik ukur** → lalu **Buat ulang poligon** bila perlu | Impor «Arsip titik ukur»; regenerasi dari menu tabel bidang |
| Sketsa/koreksi cepat di peta | **Gambar bidang** | Tab Spasial → Alat → Gambar bidang |
| File CAD lama (garis, belum tertutup) | **DXF — Bangun dari garis** | Impor DXF, mode polygonize |
| File CAD/GeoJSON poligon sudah jadi | **Impor GeoJSON / DXF poligon tertutup** | Jalur legacy — tetap didukung |

**Disarankan untuk proyek baru:** titik CSV langsung (**Bidang dari titik**) atau digitasi (**Gambar bidang**). Impor «poligon tertutup saja» tidak lagi menjadi satu-satunya cara.

### Alur lengkap workbench (training singkat)

Pola lapangan yang paling umum — meniru AutoCAD (titik → layer → snap):

1. **Impor titik lapangan** — CSV `x`,`y` saja → tabel «Titik lapangan»; label **T1**, **T2**, … di peta.
2. **Sketsa kertas** — di luar app; catat titik mana untuk bidang, jalan, saluran.
3. **Buat tabel layer kosong** — Impor Spasial → «Buat tabel layer kosong» → pilih **Bidang**, **Jalan**, atau **Saluran** (boleh beberapa tabel).
4. **Aktifkan lapisan** di tab Spasial — centang tabel titik + tabel layer target.
5. **Digitasi** — Alat → **Gambar bidang** (poligon, kunci `no_bidang`) atau **Gambar garis** (LineString, kunci `no_garis`); snap ke T1, T2…
6. **Cek hasil** — tab Spasial (geometri) dan tab Data (baris + kunci).

Satu titik fisik boleh dipakai di **beberapa** geometri (snap ulang ke titik yang sama).

### CRS / SRID sumber (EPSG)

Di setiap dialog impor, pilih **EPSG** yang cocok dengan angka di file:

| Pilihan | Kapan dipakai |
|---------|----------------|
| **EPSG:4326** | Koordinat sudah lon/lat (WGS84) |
| **EPSG:32748 / 32749** | UTM zona 48S / 49S (meter) |
| **EPSG:23833–23836** | Grid TM-3 Indonesia di form |

Salah SRID → geometri salah posisi. **Selalu cek pratinjau peta** sebelum simpan.

### Bidang dari titik (CSV)

Kolom minimal: **`no_bidang`**, **`x`**, **`y`**. Opsional: `urutan`, `nama_titik`.

1. Tempel atau unggah CSV.
2. Pilih EPSG sumber.
3. Pratinjau poligon di peta; urutan titik bisa disesuaikan.
4. Isi kunci upsert (`no_bidang`) per bidang → simpan ke tabel virtual.

### Titik lapangan mentah (satu file TS/GPS)

Kolom minimal: **`x`**, **`y`** saja. Opsional: `urutan`. **Tidak perlu** `no_bidang` — semua titik dari satu pengukuran lapangan.

1. Tab Spasial → Impor → **Titik lapangan → tabel baru** (atau format «Titik lapangan mentah» ke tabel titik yang ada).
2. Tempel/unggah CSV; pilih EPSG sumber.
3. Titik disimpan dengan label otomatis **T1**, **T2**, … (kolom `nama_titik`) — cocokkan dengan **sketsa kertas** di lapangan.
4. Pemisahan bidang/jalan/saluran dilakukan saat **digitasi** di peta (Fase 6B+), bukan saat impor.

### Arsip titik ukur (tanpa poligon)

Sama format CSV, tetapi setiap baris disimpan sebagai **titik (Point)** — untuk arsip lapangan atau referensi. Kunci per titik: `kode_titik` (= `no_bidang` + urutan).

Titik tampil di peta sebagai **marker bulat biru** kecil.

### Buat ulang poligon dari titik arsip

Setelah titik tersimpan, gunakan **Buat ulang poligon** (menu tabel bidang atau wizard Impor) untuk membentuk poligon bidang dari grup `no_bidang` + urutan titik.

### Gambar garis di peta (jalan, saluran)

1. Buat tabel layer kosong (**Jalan** atau **Saluran**) lewat Impor Spasial, atau pilih tabel garis yang sudah ada.
2. Aktifkan lapisan **titik lapangan** + tabel garis di peta.
3. Tab Spasial → **Alat → Gambar garis**.
4. Klik vertex berurutan (snap ke T1, T2…) → **Selesai garis** → isi kode garis → simpan.

### Gambar bidang di peta

1. Buat tabel **Bidang** kosong lewat Impor Spasial (atau gunakan tabel bidang yang ada).
2. Pastikan lapisan **titik lapangan** aktif di peta (label **T1**, **T2**, … tampil saat zoom ≥ 12).
3. Tab Spasial → **Alat → Gambar bidang**.
4. Klik sudut — snap ke titik ukur (kotak biru) atau vertex poligon lain.
5. **Tutup bidang** → isi `no_bidang` → simpan.
6. Buka **sketsa kertas** untuk memilih titik mana yang jadi sudut bidang.

### DXF — dua mode

| Mode | Untuk |
|------|--------|
| **Bangun dari garis** (disarankan untuk CAD lama) | `LINE` + polyline **terbuka** → polygonize di Portal |
| **Poligon tertutup** (legacy) | LW/PL tertutup, INSERT blok, HATCH |

Keduanya: pilih layer, mapping `no_bidang`, pratinjau peta, SRID → simpan ke tabel virtual.

### GeoJSON / shapefile

- **GeoJSON / ZIP shapefile:** poligon batch ke tabel virtual; mapping kunci per fitur.
- Shapefile: hanya Polygon/MultiPolygon di ZIP; batas ukuran ~36 MB ZIP, ~12 MB teks ke server.

### Setelah simpan

- Periksa tab **Spasial** (lapisan tabel aktif).
- Baris ada di tab **Data**; kunci `no_bidang` harus cocok dengan atribut admin bila diisi terpisah.

---

## 1. Legacy — `feature_key` (unit kerja / issue)

> Bagian ini untuk alur **unit kerja lama** (bukan tabel virtual utama). Pilot baru memakai **`no_bidang`** di tabel virtual (§0).

- Setiap fitur di **satu unit kerja** punya string **`feature_key`**.
- Geometri dan atribut tabular disambungkan lewat **`issue_id` + `feature_key` sama persis**.
- Atribut boleh diisi dulu (CSV) lalu geometri menyusul, atau sebaliknya.

---

## 2. Legacy — tab Map unit kerja (GeoJSON / DXF)

Dialog **Simpan geometri fitur unit kerja** (bukan wizard tabel virtual):

- GeoJSON / shapefile / DXF poligon tertutup per layer.
- Lihat §0 untuk alur tabel virtual yang disarankan.

---

## 3. Evaluasi lisensi CAD (organisasi)

Setelah Fase 1–4 stabil di lapangan, tim dapat meninjau apakah jumlah **lisensi AutoCAD/GIS per surveyor** bisa diturunkan. Checklist:

- [ ] ≥80% bidang baru masuk lewat Portal tanpa menutup poligon di CAD dulu
- [ ] Surveyor terlatih jalur §0 (titik / gambar / polygonize)
- [ ] File `.dwg` hanya arsip opsional, bukan deliverable resmi

---

*Dokumen ini diselaraskan dengan perilaku aplikasi; perubahan versi terbaru: [`spatial-import-roadmap.md`](./spatial-import-roadmap.md), [`surveyor-workbench-strategy.md`](./surveyor-workbench-strategy.md).*
