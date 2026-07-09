# Strategi: Spatial PM sebagai satu-satunya workbench surveyor

Dokumen keputusan produk & organisasi — **bukan** panduan teknis impor.  
Diperbarui: 2026-07-09 (Fase 7: heuristik klasifikasi layer CAD).

**Terkait:** `[spatial-import-roadmap.md](./spatial-import-roadmap.md)`, `[workspace-spatial-gis-roadmap.md](./workspace-spatial-gis-roadmap.md)` §11, `[spatial-import-user-guide.md](./spatial-import-user-guide.md)`.

---

## 1. Keputusan


| Aspek              | Keputusan                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Tujuan bisnis**  | Kurangi ketergantungan lisensi CAD/GIS berbayar (AutoCAD, QGIS, dll.); satu stack = biaya lebih rendah, data lebih terpusat.              |
| **Peran aplikasi** | **Workbench produksi + penyimpanan**, bukan “database akhir” setelah surveyor selesai di software lain.                                   |
| **Adopsi**         | Pemilik produk sekaligus PM akan **mengajar** alur standar ke tim surveyor; sedikit paksaan organisasi diterima.                          |
| **Model data**     | Tetap **virtual table** + kolom kunci (`no_bidang` / upsert) + kolom `geometry` — lihat pola A di `workspace-spatial-gis-roadmap.md` §11. |


---



## 2. Masalah saat ini (kenapa surveyor merasa rugi)

Alur yang tertanam di produk hari ini:

1. Admin/PM: tabel + CSV atribut
2. Surveyor: titik di lapangan → **AutoCAD/QGIS** → poligon tertutup
3. Surveyor: impor DXF/GeoJSON ke portal (**langkah tambahan**)

Portal dulu dianggap hanya menerima **poligon yang sudah jadi** di CAD. Sejak workbench Fase 1–4, surveyor dapat memproduksi bidang **langsung di Portal**:

- **Bidang dari titik** (CSV → poligon)
- **Gambar bidang** di peta
- **DXF bangun dari garis** (polygonize)
- **Arsip titik ukur** + buat ulang poligon
- Impor GeoJSON/DXF poligon tertutup (jalur legacy, tetap didukung)

**Yang masih perlu di luar** (edge case): busur presisi ekstrem, gambar CAD kompleks yang belum didukung polygonize. **Migrasi CAD lama satu file campur** — direncanakan **Fase 7**. **Geser/rotasi bidang setelah cek overlap persil BPN** — direncanakan **Fase 8A** (edit geometri di peta). **Layout & frame cetak** tetap di luar Portal (AutoCAD/CAD).

### Alur lapangan lengkap (diskusi surveyor, 2026-07)

Setara detail praktik di lapangan hari ini:

```
Ekspor titik dari controller → DXF/CSV
        │
        ▼
AutoCAD: gambar poligon, garis, titik per layer (bidang, bangunan, jalan, saluran…)
        │  (sambil lihat sketsa kertas)
        ▼
Overlay persil unduhan BPN (DXF/SHP) → cek overlap dengan bidang hasil ukur
        │
        ├─► Ada overlap → geser bidang sampai bersih
        └─► Bersih → «beres» → layout & cetak
```

| Langkah | Di Portal hari ini | Rencana |
|---------|-------------------|---------|
| Titik → gambar per layer | ✅ Fase 6 (titik + digitasi + bootstrap layer) | — |
| Impor persil unduhan (DXF/SHP) sebagai referensi | ✅ Unggah → tabel virtual / lapisan | — |
| Cek overlap bidang vs persil | ✅ Analisis spasial → Overlap (G-D1) | Perkuat alur QC di Fase 8 |
| Geser/rotasi bidang; snap saat koreksi | ❌ | **Fase 8A** |
| Peta persil live dari BHUMI/ATLAS | ❌ (unduh file manual) | **Fase 8B** (eksplorasi WMS/WFS) |
| Layout & cetak | ❌ | Tetap di CAD |

---



## 3. Visi alur (target)

Surveyor pulang dari lapangan → **buka Spatial PM** → data rapi di perusahaan tanpa membuka CAD.

```
Titik koordinat (TS/GPS/Excel)
        │
        ├─► [Fase 2] Tempel / impor CSV titik → poligon di app → simpan
        │
        ├─► [Fase 3] Digitasi sudut di peta → simpan
        │
        ├─► [Fase 4] Arsip titik lapangan → referensi di peta (marker)
        │
        ├─► [Fase 6] Titik referensi + digitasi garis (jalan/saluran) → tabel layer terpisah
        │
        ├─► [Fase 1] File DXF layer garis (legacy drawing) → polygonize di app → mapping no_bidang → simpan
        │
        ├─► [Fase 7] Satu file DXF campur → deteksi geom + layer CAD → pisah ke tabel Bidang / Jalan / Titik
        │
        ├─► [Fase 8A] Koreksi di peta: geser/rotasi bidang + snap ke referensi
        │
        └─► [Fase 8B] Referensi persil BPN: file unduhan + opsional layer ATLAS (WMS/WFS)

Semua jalur ──► virtual_rows (WGS84) + upsert kunci ──► tab Spasial & Data
```

**Prinsip:** beberapa jalur masuk, **satu tempat penyimpanan**, **satu kunci** penghubung atribut–geometri.

---



## 4. Roadmap fitur (prioritas)

Centang saat selesai; urutan = dampak adopsi surveyor × kompleksitas teknis.

### Fase 1 — Polygonize DXF (garis → bidang)

**Masalah:** file CAD lama / kebiasaan gambar garis; surveyor tidak boleh wajib `BOUNDARY` di AutoCAD.

**Fitur:**

- Mode impor DXF baru: **«Bangun poligon dari garis»**
- Baca `LINE`, LW/PL **terbuka** pada layer terpilih
- Snap ujung (toleransi meter, sesuai EPSG), noding, dedup garis dobel
- `ST_Polygonize` / setara → daftar poligon
- Filter: buang face luar, poligon terlalu kecil, opsional envelope kerja
- UI: pratinjau peta + tabel mapping `no_bidang` (reuse pola dialog DXF existing)
- Server: tetap konversi ke FeatureCollection → `importVirtualRowsGeoJsonBatchAction`

**Kode sentuh:** `dxf-import-utils.ts`, `virtual-table-dxf-import-dialog.tsx`, `importVirtualRowsDxfBatchAction`, opsional RPC PostGIS.

**Status:** `[x]` selesai — mode «Bangun dari garis» di dialog impor DXF (`dxf-line-polygonize.ts`, `geometry_mode=polygonize`).

---



### Fase 2 — Bidang dari daftar titik (tanpa CAD)

**Masalah:** output lapangan = tabel titik, bukan file gambar.

**Fitur:**

- Wizard **«Bidang dari titik»** (tab Spasial atau Tabel)
- Input: CSV/Excel tempel — minimal `no_bidang`, `x`, `y`, opsional `urutan` / `nama_titik`
- EPSG sumber (reuse daftar UTM/TM-3/WGS84)
- Aturan penutupan: urutan titik → ring; validasi (min 3 titik, cek self-intersect)
- Pratinjau peta + edit urutan jika perlu
- Upsert ke tabel terpilih via `no_bidang`

**Opsional v1.1:** satu baris CSV = banyak titik dengan grup `no_bidang`.

**Status:** `[x]` selesai — wizard «Bidang dari titik» (`points-to-polygon-import.ts`, `virtual-table-points-import-dialog.tsx`).

---



### Fase 3 — Digitasi ringan di peta

**Masalah:** sketsa cepat / koreksi tanpa file.

**Fitur:**

- Mode alat **«Gambar bidang»**: klik sudut, tutup poligon, isi `no_bidang`, simpan
- Snap ke vertex fitur lain (opsional)
- Mobile: touch-friendly (min target 44px)

**Status:** `[x]` selesai — alat **Gambar bidang** di tab Spasial (Alat → Gambar bidang), snap vertex, simpan ke tabel virtual.

---



### Fase 4 — Titik ukur mentah tersimpan

**Masalah:** audit & revisi; poligon bisa diubah tanpa hilang sumber lapangan.

**Fitur:**

- Tabel/kolom **titik** (point) terhubung ke baris bidang via relasi atau `no_bidang`
- Impor titik tanpa langsung membentuk poligon (arsip)
- Regenerasi poligon dari titik jika definisi berubah

**Status:** `[x]` selesai — wizard **Arsip titik ukur** + **Buat ulang poligon** (`virtual-table-survey-points-archive.ts`, skema `kode_titik`/`no_bidang`/`urutan`, titik Point di peta).

---



### Fase 5 — Penyempurnaan & sunset jalur lama

- Dokumentasi internal + `/help/spatial-import` diperbarui: **alur resmi = portal**
- Kurangi promosi impor «hanya poligon tertutup» sebagai satu-satunya cara
- Evaluasi: apakah lisensi AutoCAD per seat bisa diturunkan setelah Fase 1–4 stabil

**Status:** `[x]` selesai — `spatial-import-user-guide.md` + `/help/spatial-import` (alur workbench §0); wizard Spasial & DXF default polygonize; DXF/dialog menyebut jalur legacy; checklist evaluasi lisensi di panduan §3.

**Evaluasi lisensi (organisasi, berkelanjutan):** lihat checklist di `[spatial-import-user-guide.md](./spatial-import-user-guide.md)` §3.

---



### Fase 6 — Satu file titik lapangan → digitasi per layer (gantikan AutoCAD)

**Praktik lapangan (yang harus ditiru Portal):**

- Surveyor mengukur **semua** yang ada di lokasi → **satu file titik** (TS/GPS/Excel). Titik **tidak** dinamai atau dikodekan per jenis (bidang vs jalan vs saluran).
- **Pembeda** ada di **sketsa kertas** yang selalu dibuat di lapangan (mana sudut bidang, mana tepi jalan, mana saluran).
- Di **AutoCAD:** file titik diimpor sebagai referensi → dengan sketsa di samping, surveyor **menggambar per layer** (bidang, jalan, saluran, bangunan) dengan snap ke titik yang relevan.

Portal harus mengikuti pola yang sama: **titik = referensi**, **sketsa = di luar sistem** (kertas; opsional ke depan: foto sketsa di lampiran baris/chat), **geometri resmi = hasil digitasi per tabel/layer** di peta.

**Masalah produk hari ini:** Arsip titik dan CSV saat ini mengasumsikan kolom `**no_bidang`** per baris — itu cocok untuk atribut admin, **bukan** untuk dump titik mentah lapangan. Belum ada alat **gambar garis** (LineString) dengan snap ke titik referensi; **Gambar bidang** snap hanya ke vertex poligon, bukan ke Point arsip.

**Alur target (paralel AutoCAD + sketsa kertas):**

```
Satu CSV titik (x, y [, urutan instrumen])  →  tabel «Titik lapangan» (semua Point di peta)
        │
        │  (surveyor membuka sketsa kertas / ingatan lapangan)
        │
        ├─► Digitasi **bidang** → snap subset titik → poligon → tabel «Bidang»
        ├─► Digitasi **jalan** → snap titik berurutan → LineString → tabel «Jalan»
        └─► Digitasi **saluran** / lainnya → tabel layer terpisah
```

Satu titik fisik boleh dipakai di **beberapa** geometri (snap ulang); tidak perlu «diklasifikasi» saat impor.

**Fitur (rencana):**

- [x] **Impor titik mentah** — CSV minimal `x`, `y` (opsional `urutan`); tanpa wajib `no_bidang`; nomor titik otomatis `T1`, `T2`, …
- [x] **Bootstrap tabel titik dari UI** — wizard Spasial «Titik lapangan → tabel baru» (`bootstrapAndImportFieldPointsAction`)
- [x] **Bootstrap tabel layer** kosong per jenis (Bidang / Jalan / Saluran) — poligon atau LineString
- [x] **Gambar bidang** — snap ke **Point** lapisan titik (bukan hanya vertex poligon)
- [x] Alat **«Gambar garis»** — snap titik berurutan → LineString; simpan ke tabel jalan/saluran
- [x] Label titik di peta (nomor `T1`…) agar mudah dicocokkan dengan sketsa kertas
- [x] Panduan §0 + training: «satu file titik → sketsa → digitasi layer»

**Status saat ini (Fase 6 selesai):**


| Langkah (paralel AutoCAD)                           | Ketersediaan                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Impor **satu file** titik tanpa kode jenis          | ✅ **Titik lapangan mentah** — CSV `x`,`y` saja; wizard «Titik lapangan → tabel baru» |
| Semua titik tampil sebagai referensi di peta        | ✅ Point ditampilkan (marker biru); kolom `nama_titik` = T1…Tn                        |
| Sketsa kertas                                       | ✅ Di luar app (workflow manusia, sama seperti di CAD)                                |
| Bootstrap tabel layer kosong (Bidang/Jalan/Saluran) | ✅ Wizard «Buat tabel layer kosong»                                                   |
| Gambar bidang dengan snap ke titik referensi        | ✅ **Gambar bidang** + snap Point & poligon                                           |
| Gambar jalan/saluran (garis)                        | ✅ **Gambar garis** + simpan LineString                                               |
| Satu tabel = satu «layer» CAD                       | ✅ Pola tabel virtual + tab Spasial sudah mendukung banyak lapisan                    |


**Status fase:** `[x]` Fase 6 selesai (2026-07-07) — 6A–6D: titik mentah, snap/label, gambar garis, bootstrap layer + panduan training.

**Kode 6A:** `points-to-polygon-import.ts` (`parseFieldPointsCsv`), `virtual-table-field-points-import-dialog.tsx`, `bootstrapAndImportFieldPointsAction`, wizard Spasial.

**Kode 6D:** `virtual-table-workbench-layer-bootstrap.ts`, `bootstrapVirtualTableWorkbenchLayerAction`, `virtual-table-workbench-layer-bootstrap-dialog.tsx`, wizard «Buat tabel layer kosong»; panduan §0 alur lengkap.

---

### Fase 7 — DXF satu file → pisah otomatis ke beberapa tabel (migrasi CAD)

**Masalah:** File `.dwg`/DXF lama sering berisi **campuran** bidang, jalan/saluran, dan titik dalam satu gambar — kadang rapi per layer CAD, kadang tidak. Impor DXF hari ini: **satu layer → satu tabel**, satu jenis hasil (poligon). Surveyor harus memecah file manual atau impor berulang.

**Keputusan produk:** **Kedua pendekatan** di bawah **keduanya** dibuat, digabung dalam satu wizard — bukan pilih salah satu:

| Pendekatan | Peran di produk |
|------------|-----------------|
| **A. Mapping layer CAD** | Utama untuk file yang sudah rapi di AutoCAD (`BIDANG`, `JALAN`, `TITIK`, …). User konfirmasi atau ubah pemetaan layer → jenis tabel. |
| **B. Heuristik jenis geometri** | Cadangan + default saat layer tidak jelas; pecah campuran dalam satu layer CAD. |

**Gabungan (alur target):**

```
Unggah DXF
    │
    ├─► Scan: per layer CAD + per jenis entitas (poligon / garis / titik)
    │
    ├─► [A] Saran default dari nama layer (alias: bidang, jalan, pipa, titik, …)
    │
    ├─► [B] Heuristik geom untuk layer tanpa nama jelas atau layer campuran:
    │       • LW/PL tertutup, HATCH → poligon (Bidang)
    │       • LINE / PL terbuka → LineString (Jalan atau Saluran — user pilih)
    │       • POINT → titik lapangan
    │       • Jaringan garis → polygonize loop → Bidang; sisa garis → Jalan
    │
    ├─► UI: tabel mapping editable + pratinjau peta per kelompok
    │
    └─► Batch simpan → tabel virtual terpisah (bootstrap 6D bila belum ada)
```

**Fitur (rencana):**

- [x] **Ekstrak POINT** dari DXF (parser + mode impor POINT di dialog DXF virtual table)
- [x] **Ekstrak LineString** terbuka (garis yang tidak dipaksa jadi poligon)
- [x] **Heuristik klasifikasi** — alias nama layer + aturan topologi geometri (`dxf-layer-classification.ts`)
- [x] **UI mapping** — per baris layer (atau layer+geom): target = Bidang / Jalan / Saluran / Titik / lewati (`virtual-table-dxf-split-import-dialog.tsx`)
- [x] **Pratinjau** — hitung entitas per kelompok; peta warna berbeda per tabel tujuan (`dxf-split-preview-map.tsx`)
- [x] **Kunci otomatis** — `no_bidang`, `no_garis`, label `T1…` (editable batch sebelum simpan via regenerate on target change)
- [x] **Server action** — impor DXF split multi-tabel dalam satu transaksi UI (`importDxfSplitMultiTableAction`)
- [x] **Wizard Spasial** — «DXF → pisah ke beberapa layer» (`workspace-spatial-import-wizard.tsx`)
- [ ] **Panduan** — kapan pakai Fase 7 vs titik CSV + digitasi (Fase 6)

**Kebijakan:**

- **Proyek baru:** tetap disarankan Fase 6 (titik lapangan + digitasi), bukan DXF campur.
- **Migrasi / arsip CAD:** Fase 7 mempercepat onboarding file lama.
- **Jalan vs Saluran:** tidak bisa 100% otomatis — user pilih di mapping (heuristik bisa default «Jalan»).
- **Tidak full-otomatis tanpa konfirmasi:** selalu ada langkah review mapping + pratinjau sebelum simpan.

**Kode yang akan disentuh (indikatif):** `dxf-import-utils.ts` (POINT, LineString), `dxf-layer-classification.ts` (heuristik A+B), `virtual-table-dxf-import.ts`, `bootstrapVirtualTableWorkbenchLayerAction`, wizard Spasial, action batch baru.

**Kode heuristik (selesai):** `classifyDxfDocument` / `classifyDxfLayer` / `matchDxfLayerAlias` / `scanDxfLayerGeometry` — saran target `bidang` | `jalan` | `saluran` | `titik` | `skip`; layer campuran → `splitGroups` per jenis geom; polygonize loop → Bidang + sisa garis → Jalan; konflik alias vs geom → ikuti geom + confidence rendah.

**Status fase:** `[x]` MVP selesai (2026-07-09) — heuristik + wizard mapping/pratinjau + batch impor multi-tabel; panduan user §Fase 7 belum.

---

### Fase 8 — Koreksi geometri + referensi persil BPN

**Masalah (dari diskusi surveyor):** Setelah gambar bidang, surveyor membandingkan dengan **persil unduhan BPN**. Jika overlap, bidang **digeser** (kadang rotasi, kadang snap ke batas) sampai bersih — baru dinyatakan «beres». Portal hari ini bisa **deteksi overlap** (analisis G-D1) dan **impor persil referensi** (DXF/SHP → tabel), tetapi **tidak bisa menggeser geometri** yang sudah tersimpan di peta seperti AutoCAD.

Fase 8 dibagi dua jalur independen (bisa rilis bertahap):

#### Fase 8A — Edit geometri di peta (geser, rotasi, snap)

**Target:** menggantikan langkah «geser bidang di CAD» untuk koreksi overlap ringan.

| Kemampuan | Status saat ini | Target Fase 8A |
|-----------|-----------------|----------------|
| Snap saat **menggambar baru** | ✅ Gambar bidang / garis | — |
| **Translasi** seluruh poligon/garis | ❌ | Alat «Geser» di tab Spasial |
| **Rotasi** | ❌ | Opsional v1.1 |
| **Edit vertex** (geser sudut) | ❌ | v1 atau v1.1 |
| Snap ke **lapisan referensi** saat menggeser | ❌ | Snap ke persil BPN + titik ukur |
| Edit via GeoJSON teks | ⚠️ Tab Data (tidak praktis surveyor) | Tetap ada sebagai fallback |

**Alur target:**

```
Bidang hasil ukur + lapisan «Persil BPN» aktif
        │
        ├─► Analisis overlap → sorot pasangan tumpang
        │
        ├─► Alat «Geser bidang» → drag + snap ke batas persil / titik
        │
        └─► Simpan → virtual_rows diperbarui (audit log)
```

**Fitur (rencana):**

- [x] Mode alat **Geser geometri** — pilih baris/lapisan, drag translasi di peta (`move-geom`, `workspace-map-move-geom-controller.tsx`, `updateVirtualRowGeometryAction`)
- [x] **Snap** ke vertex lapisan referensi aktif (termasuk titik lapangan) saat geser — opsi di HUD
- [ ] **Pratinjau overlap** real-time (atau refresh setelah lepas drag)
- [x] Simpan ke kolom `geom` tabel virtual (WGS84); `emitVirtualTableRowsMutated`
- [ ] (Opsional v1.1) Rotasi handle; edit vertex satu per satu
- [ ] Panduan: kapan geser di Portal vs tetap di CAD (busur presisi, layout cetak)

**Kode yang akan disentuh (indikatif):** `workspace-map.tsx`, lib transform geometri (Turf `transformTranslate` / `transformRotate`), alat Spasial baru, server action update geom.

**Status fase:** `[~]` berjalan (2026-07-09) — alat Geser geometri + persist; snap overlap QC & rotasi belum.

#### Fase 8B — Referensi persil BPN (file unduhan + ATLAS)

**Konteks:** Persil unduhan tersedia sebagai **DXF/SHP** (impor manual → tabel referensi — **sudah didukung**). Peta publik **[BHUMI](https://bhumi.atrbpn.go.id/peta)** menampilkan data otoritatif ATR/BPN; backend geospasial terintegrasi dengan geoportal **[ATLAS](https://atlas.atrbpn.go.id/)**.

**Halaman pengembang ATLAS** ([atlas.atrbpn.go.id/developer](https://atlas.atrbpn.go.id/developer/)) mendokumentasikan layanan **GeoNode/GeoServer** terbuka:

| Layanan | URL indikatif (dari dokumentasi ATLAS) | Potensi di Portal |
|---------|----------------------------------------|-------------------|
| **WMS** 1.1.1 | `https://atlas.atrbpn.go.id/geoserver/ows?service=WMS&…` | Lapisan referensi read-only (sudah ada infrastruktur **G-G1** WMS eksternal) |
| **WFS** 1.1.0 | `https://atlas.atrbpn.go.id/geoserver/ows?service=WFS&…` | Query/download fitur persil (eksplorasi; perhatikan beban & ToS) |
| **WMTS** 1.0.0 | `https://atlas.atrbpn.go.id/geoserver/gwc/service/wmts?…` | Tile cache (alternatif WMS) |
| **CSW** | `https://atlas.atrbpn.go.id/catalogue/csw` | Katalog metadata — cari layer persil yang tepat |

**Keputusan produk:**

- **Jalur utama (pilot):** tetap **unduh persil** dari BHUMI → impor DXF/SHP ke tabel «Persil BPN referensi» — tidak bergantung API live.
- **Jalur lanjutan:** konfigurasi **WMS ATLAS** di dialog lapisan eksternal Spasial (G-G1) setelah uji teknis: layer name, CRS, CORS, performa, dan **izin penggunaan** data otoritatif di aplikasi organisasi.
- **Bukan target v1:** embed iframe BHUMI di dalam Portal (disclaimer, login Keycloak ATR/BPN, kebijakan embed).

**Fitur (rencana):**

- [ ] **Preset lapisan** «Referensi BPN» — template WMS ATLAS + nama layer yang sudah diverifikasi (setelah spike)
- [ ] Dokumentasi admin: cara temukan `layers=` dari GetCapabilities ATLAS
- [ ] (Opsional) Impor WFS bbox ke tabel referensi proyek (cache lokal, bukan query live tiap pan)
- [x] Spike teknis awal: WMS ATLAS publik berhasil dimuat (contoh `geonode:status_hak_atas_tanah_berbasis_bidang`, cakupan Jaksel). Catatan: isi layer ini data turunan status hak, **bukan** persil unduhan BHUMI 1:1.
- [ ] Selaraskan dengan skema `bidang_eksisting_bpn` di `catatan-skema-database.md` bila dipakai di produksi

**Status fase:** `[ ]` belum dimulai — **spike ATLAS WMS** bisa dilakukan tanpa kode produk (uji manual di dialog lapisan eksternal).

**Estimasi:** spike 0,5–1 hari; preset + panduan ~2–3 hari jika WMS publik tanpa auth.

**Tautan resmi:**

- Peta publik: [bhumi.atrbpn.go.id/peta](https://bhumi.atrbpn.go.id/peta)
- Pengembang / OGC services: [atlas.atrbpn.go.id/developer](https://atlas.atrbpn.go.id/developer/)

---



## 5. Kebijakan organisasi (untuk training surveyor)

1. **Deliverable resmi geometri** = baris di tabel virtual ruang kerja (terlihat di tab Spasial), bukan file `.dwg` di folder pribadi.
2. **Kunci wajib:** `no_bidang` (atau kolom kunci yang disepakati PM) — sama untuk atribut admin dan geometri surveyor.
3. **CRS:** pilih EPSG di form impor; salah SRID = tanggung jawab dicek di pratinjau peta sebelum simpan.
4. **Transisi:** file DXF lama boleh Fase 1 (polygonize); proyek baru disarankan Fase 2 (titik langsung) begitu fitur ada.
5. **Titik lapangan mentah:** satu file koordinat tanpa kode jenis — normal; pemilahan bidang/jalan/saluran dilakukan saat **digitasi** di peta (dengan sketsa kertas), bukan saat impor titik (Fase 6).
6. **Tidak ada double entry:** admin isi nominatif CSV; surveyor **hanya** geom + kunci (kecuali kolom lapangan memang milik surveyor).

---



## 6. Metrik keberhasilan


| Metrik                                     | Target (indikatif)                |
| ------------------------------------------ | --------------------------------- |
| % bidang masuk lewat portal tanpa file CAD | Naik per kuartal setelah Fase 1–2 |
| Waktu lapangan → tampil di peta            | 1 hari kerja (bukan minggu)       |
| Keluhan «portal cuma database»             | Turun di feedback internal        |
| Lisensi CAD/GIS aktif per surveyor         | Turun setelah adopsi stabil       |


---



## 7. Risiko & mitigasi


| Risiko                                            | Mitigasi                                                                                                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Polygonize gagal (garis putus, dobel, T-junction) | Toleransi snap + pesan error per area; training singkat «garis harus ketemu di sudut»                                                                            |
| Surveyor resistensi                               | PM/trainer sendiri pakai dulu; pilot satu ruang kerja                                                                                                            |
| Geometri kompleks (busur presisi tinggi)          | Fase 1 flatten bulge sudah ada untuk LW/PL; untuk busur ekstrem, tetap boleh impor poligon tertutup (jalur legacy) sampai digitasi/CAD benar-benar tidak dipakai |
| Fitur besar                                       | Fase 1 dan 2 independen — bisa rilis bertahap                                                                                                                    |
| Salah klasifikasi DXF split (Fase 7)              | Wajib langkah review mapping + pratinjau; heuristik hanya saran; user override per layer                                                                           |
| Geser geometri merusak topologi (Fase 8A)         | Validasi ring setelah transform; undo satu langkah; preview overlap sebelum simpan                                                                                |
| WMS ATLAS tidak stabil / ToS (Fase 8B)            | Jalur file unduhan tetap utama; WMS opsional; cache tile; koordinasi legal organisasi                                                                             |


---



## 8. Lacak implementasi

Saat memulai kode, update:

- `[ ]` → `[x]` di §4 dokumen ini
- Entri baru di `[spatial-import-roadmap.md](./spatial-import-roadmap.md)` §4 (backlog)
- `[spatial-import-user-guide.md](./spatial-import-user-guide.md)` + `/help/spatial-import` saat fitur rilis ke user
- Ceklis uji manual §9 dokumen ini setelah perubahan besar workbench

---



## 9. Uji manual & ceklis QA

Gunakan bagian ini saat mencoba workbench di lingkungan dev/staging. Centang `[x]` setelah lulus. Jika gagal, catat di kolom **Catatan** (boleh langsung di bawah tabel atau di issue).

**Panduan operasional:** `[spatial-import-user-guide.md](./spatial-import-user-guide.md)` §0 · **Bantuan in-app:** `/help/spatial-import`

### 9.1 Prasyarat

- [x] Dev server jalan (`npm run dev` di folder `app/`)
- [x] Login sebagai user dengan akses **ruang kerja uji**
- [x] Buka ruang kerja/proyek uji (tab **Spasial** tersedia)
- [x] (Opsional) Siapkan **sketsa kertas** sederhana: titik mana untuk bidang, mana untuk jalan/saluran



### 9.2 Data contoh (titik lapangan mentah)

Salin ke wizard impor. Sesuaikan **EPSG** di form dengan sistem koordinat angka di bawah.

**WGS84 (EPSG:4326)** — cocok untuk uji cepat di Indonesia:

```csv
x,y
106.845600,-6.208800
106.846100,-6.208800
106.846100,-6.209300
106.845600,-6.209300
106.845850,-6.209050
106.846000,-6.208950
```

**UTM 49S (EPSG:32749)** — ganti angka jika punya file lapangan asli:

```csv
x,y,urutan
500123.45,9812345.67,1
500223.45,9812345.67,2
500223.45,9812245.67,3
500123.45,9812245.67,4
500173.45,9812295.67,5
```



### 9.3 Alur lengkap Fase 6 (disarankan diuji berurutan)


| #   | Langkah                                                                       | Cek | Catatan |
| --- | ----------------------------------------------------------------------------- | --- | ------- |
| 1   | Tab **Spasial** → **Impor** → pilih **Titik lapangan → tabel baru**           | [ ] |         |
| 2   | Tempel CSV `x`,`y` saja (tanpa `no_bidang`); pilih EPSG yang benar            | [ ] |         |
| 3   | Pratinjau peta menampilkan titik di lokasi masuk akal                         | [ ] |         |
| 4   | Simpan → tabel baru muncul di daftar lapisan + tab **Data**                   | [ ] |         |
| 5   | Kolom `nama_titik` berisi **T1**, **T2**, … (urut sesuai baris/urutan)        | [ ] |         |
| 6   | Titik tampil di peta sebagai **marker biru**                                  | [ ] |         |
| 7   | Zoom ≥ 12 → label **T1**, **T2**, … terlihat di peta                          | [ ] |         |
| 8   | **Impor** → **Buat tabel layer kosong** → jenis **Bidang** → simpan           | [ ] |         |
| 9   | Ulangi langkah 8 untuk **Jalan** (dan opsional **Saluran**)                   | [ ] |         |
| 10  | Tabel Bidang punya kolom `title`, `no_bidang`, `geom`                         | [ ] |         |
| 11  | Tabel Jalan/Saluran punya kolom `title`, `no_garis`, `geom`                   | [ ] |         |
| 12  | Centang lapisan **Titik lapangan** + **Bidang** di panel lapisan              | [ ] |         |
| 13  | **Alat → Gambar bidang** — klik sudut; **snap** ke titik T1… (indikator biru) | [ ] |         |
| 14  | **Tutup bidang** → isi `no_bidang` (mis. `B-001`) → simpan                    | [ ] |         |
| 15  | Poligon langsung muncul di peta tanpa refresh manual                          | [ ] |         |
| 16  | Baris baru ada di tab **Data** tabel Bidang                                   | [ ] |         |
| 17  | Centang lapisan **Titik lapangan** + **Jalan**                                | [ ] |         |
| 18  | **Alat → Gambar garis** — klik vertex berurutan dengan snap ke T1, T2…        | [ ] |         |
| 19  | **Selesai garis** → isi `no_garis` (mis. `J-001`) → simpan                    | [ ] |         |
| 20  | LineString tampil di peta; baris ada di tab **Data** tabel Jalan              | [ ] |         |
| 21  | Satu titik yang sama bisa dipakai lagi (snap) untuk bidang/garis lain         | [ ] |         |




### 9.4 Ceklis per fitur (regresi singkat)

**6A — Titik lapangan mentah**

- [x] Format «Titik lapangan mentah» ke **tabel titik yang sudah ada** (bukan hanya bootstrap baru)
- [x] Impor gagal dengan pesan jelas jika CSV tanpa kolom `x`/`y`

**6B — Label & snap bidang**

- [x] Snap ke **Point** titik lapangan (bukan hanya vertex poligon lain)
- [ ] Label titik tidak mengganggu saat zoom jauh (hilang di zoom rendah)

**6C — Gambar garis**

- [x] Garis minimal 2 vertex; simpan ditolak jika kurang
- [x] Dialog simpan memilih kolom `no_garis` secara default pada tabel Jalan/Saluran

**6D — Bootstrap layer kosong**

- [x] Tiga jenis layer (Bidang / Jalan / Saluran) bisa dibuat tanpa unggah file
- [x] Nama tabel bisa diedit sebelum simpan
- [x] Tabel baru langsung bisa dipilih sebagai target **Gambar bidang** / **Gambar garis**

**Panduan & bantuan**

- [x] `/help/spatial-import` menampilkan **Alur lengkap workbench (training singkat)**
- [x] Wizard Impor Spasial punya opsi **Buat tabel layer kosong**



### 9.5 Jalur workbench lain (opsional)

Centang jika ingin memastikan fase sebelumnya tidak rusak:


| Jalur                                          | Cek singkat                                      | Lulus |
| ---------------------------------------------- | ------------------------------------------------ | ----- |
| **Bidang dari titik** (CSV dengan `no_bidang`) | CSV → poligon per bidang → simpan                | [ ]   |
| **Arsip titik ukur**                           | Titik Point tersimpan; marker biru di peta       | [ ]   |
| **Buat ulang poligon**                         | Dari arsip titik → poligon bidang                | [ ]   |
| **DXF bangun dari garis**                      | LINE terbuka → polygonize → mapping `no_bidang`  | [ ]   |
| **Gambar bidang** tanpa titik referensi        | Digitasi bebas (tanpa lapisan titik) tetap jalan | [ ]   |




### 9.6 Kriteria lulus uji Fase 6

Uji dianggap **lulus** jika semua ini benar:

- [x] Satu file CSV titik mentah → semua titik referensi di peta (T1…Tn)
- [x] Bootstrap tabel Bidang + Jalan tanpa file eksternal
- [x] Digitasi bidang dan garis dengan **snap ke titik referensi**
- [x] Geometri tersimpan di **tabel virtual** (tab Data + Spasial), bukan hanya di pratinjau
- [x] Tidak ada error konsol fatal saat simpan (cek DevTools browser)

**Catatan tester:** _________________________________  
**Tanggal:** __________ · **Browser:** __________ · **Ruang kerja uji:** __________

---



## 10. Ringkasan satu kalimat

**Spatial PM harus menjadi tempat surveyor memproduksi dan menyimpan geometri lapangan (bidang, titik, garis), bukan tempat mengunggah sisa kerjaan AutoCAD — demi data terpusat dan mengurangi biaya software.**