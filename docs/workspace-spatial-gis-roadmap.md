# Tab Spasial — roadmap fitur GIS & biaya layanan

**Status:** keputusan produk + backlog (2026-07); **G-A … G-G ✅**; **G-H ✅**; **G-D ✅**; **G-F1–F5 ✅**; **G-F6** graticule disembunyikan (perlu polish); **G-A5b** satelit belum; §10 uji manual sebagian.  
**Kebijakan biaya:** **$0 dulu** — tidak ada API key berbayar, tidak ada satelit/Google/Mapbox sampai keputusan produk eksplisit (§8 GQ8).  
**Tujuan:** memperkaya tab **Spasial** agar terasa semakin **GIS** (TOC, alat peta, analisis ringan), tanpa mengorbankan pola UX di `docs/workspace-spatial-tab-ux.md` (peta dominan, rail, panel kanan `row-detail`).

**Referensi terkait:**


| Dokumen                                  | Isi                                                           |
| ---------------------------------------- | ------------------------------------------------------------- |
| `docs/workspace-virtual-table-fetch-optimization-notes.md` | Fetch virtual table per tab + backlog optimasi (poin 1–7 ✅) |
| `docs/workspace-dashboard-v2-roadmap.md` | Backlog Dashboard v2 + mockup UI target |
| `docs/workspace-spatial-tab-ux.md`       | UX refactor S1–S6 ✅; legacy S7; beda tab Spasial vs view Peta |
| `docs/workspace-navigation-and-views.md` | Tab workspace, integrasi Data/Chat                            |
| `docs/spatial-import-roadmap.md`         | Impor GeoJSON/DXF/SHP, CRS                                    |
| `docs/spatial-import-user-guide.md`      | Panduan pengguna impor                                        |


**Kode terkait (anchor):**


| Area                   | File                                                                |
| ---------------------- | ------------------------------------------------------------------- |
| Peta workspace         | `app/src/app/workspace-map.tsx`                                     |
| Tab Spasial            | `app/src/app/workspace-spatial-view.tsx`                            |
| Toolbar / rail lapisan | `workspace-spatial-toolbar.tsx`, `workspace-spatial-layer-rail.tsx` |
| View Peta per tabel    | `virtual-table-map-view.tsx`                                        |
| Pratinjau impor / DXF  | `dxf-mapping-preview-map.tsx`                                       |
| CRS / reprojeksi       | `app/src/lib/crs-reproject.ts`                                      |
| Relasi / panel 360°    | `virtual-table-relation-explorer.tsx`, `virtual-table-entity-360-panel.tsx`, `lib/virtual-table-find-on-map.ts` |
| Trace relasi peta      | `lib/workspace-map-relation-trace.ts`, `workspace-map-relation-trace-layer.tsx` |
| Cache lapisan geometri | `lib/workspace-spatial-geometry-layers-cache.ts`, `lib/workspace-spatial-geometry-layers.ts` |
| Cache baris virtual table | `lib/virtual-table-rows-fetch.ts`, `lib/virtual-table-rows-cache.ts` |
| Dummy pola B           | `supabase/migrations/0074_gh_demo_virtual_tables_seed.sql`, `0077_ghdemo_relation_trace_seed.sql` |


---

## 1. Baseline saat ini (gratis, sudah ada)


| Aspek            | Keadaan                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| **Basemap**      | OpenStreetMap via `tile.openstreetmap.org` — **tanpa API key**, $0        |
| **Engine**       | Leaflet — open source                                                     |
| **Lapisan data** | Poligon dari tabel virtual (+ pratinjau impor); warna otomatis per tabel  |
| **Interaksi**    | Toggle lapisan, rail collapsible, klik poligon → panel **360°** / row-detail, trace relasi (G-D5) |
| **Impor**        | Wizard GeoJSON/DXF; CRS UTM/TM-3/WGS84 di server                          |


**Catatan OSM:** tile publik OSM **bukan CDN produksi skala besar**. Untuk pilot/organisasi kecil biasanya cukup; jika traffic peta tinggi, pertimbangkan **hosting tile sendiri** atau provider berbayar (biaya infra, bukan lisensi Google).

---

## 2. Backlog fitur GIS (semua ide)

Setiap item punya ID `**G-***`, fase implementasi, dan **tier biaya** (§3).

### 2.1 Fase G-A — «Rasanya GIS» (impact tinggi, effort rendah)


| ID   | Fitur                               | Deskripsi singkat                                                      | Tier biaya |
| ---- | ----------------------------------- | ---------------------------------------------------------------------- | ---------- |
| G-A1 | **Status bar peta**                 | Koordinat kursor (lat/lon + opsional UTM), level zoom, skala perkiraan | **$0**     |
| G-A2 | **Skala bar & utara**               | Kontrol Leaflet standar di overlay peta                                | **$0**     |
| G-A3 | **Legenda dinamis**                 | Warna + nama lapisan aktif + jumlah fitur                              | **$0**     |
| G-A4 | **Opacity per lapisan**             | Slider di rail (selain toggle Eye)                                     | **$0**     |
| G-A5 | **Basemap switcher**                | OSM / OpenTopoMap / Carto Positron — **$0 only**                       | **$0** ✅   |
| G-A6 | **Zoom ke lapisan**                 | Ikon target per baris rail → `fitBounds` extent lapisan                | **$0**     |
| G-A7 | **Zoom ke semua / bookmark extent** | Simpan & pulihkan view per `project_id` (localStorage atau DB)         | **$0**     |
| G-A8 | **Label di peta**                   | Tampilkan kolom judul (mis. `no_bidang`) di centroid poligon           | **$0**     |


### 2.2 Fase G-B — Alat lapangan & surveyor


| ID   | Fitur                            | Deskripsi singkat                                           | Tier biaya                |
| ---- | -------------------------------- | ----------------------------------------------------------- | ------------------------- |
| G-B1 | **Ukur jarak & luas**            | Gambar polyline/polygon sementara; luas m²/ha, panjang sisi | **$0** (client + Turf.js) |
| G-B2 | **Identify titik**               | Klik koordinat → daftar lapisan/atribut di titik (stacking) | **$0**                    |
| G-B3 | **Go to XY**                     | Loncat ke lon/lat atau UTM; tanpa geocoding alamat          | **$0**                    |
| G-B4 | **Badge CRS / sistem koordinat** | Tampilkan EPSG aktif; baca koordinat dalam UTM 48S/49S      | **$0**                    |
| G-B5 | **Diff impor di peta**           | Sorot fitur baru vs existing setelah wizard impor           | **$0**                    |
| G-B6 | ~~Export screenshot peta~~       | **Dibatalkan** — cukup screenshot OS/browser                | —                         |


### 2.3 Fase G-C — TOC & simbol


| ID   | Fitur                              | Deskripsi singkat                                    | Tier biaya |
| ---- | ---------------------------------- | ---------------------------------------------------- | ---------- |
| G-C1 | **Grup lapisan**                   | Folder + urutan drag (Hasil ukur, Referensi, …)      | **$0**     |
| G-C2 | **Simbol per lapisan**             | Isi, garis, dash, transparansi (beyond rotasi warna) | **$0**     |
| G-C3 | **Filter spasial dari saved view** | Sinkron filter tab Data → subset geometri di Spasial | **$0**     |
| G-C4 | **Heatmap / density**              | Dari centroid atau titik (progress per wilayah)      | **$0**     |
| G-C5 | **Agregasi label saat zoom out**   | Cluster «133 bidang» per desa/kecamatan              | **$0**     |


### 2.4 Fase G-D — Analisis ringan (GIS lite)


| ID   | Fitur                  | Deskripsi singkat                                           | Tier biaya       |
| ---- | ---------------------- | ----------------------------------------------------------- | ---------------- |
| G-D1 | **Overlap / tabrakan** | Dua lapisan → daftar poligon tumpang (QC impor)             | **$0** (Turf.js) |
| G-D2 | **Within / buffer**    | Fitur dalam radius X m atau dalam poligon referensi         | **$0**           |
| G-D3 | **Statistik extent**   | Total luas lapisan aktif, jumlah fitur, bbox                | **$0**           |
| G-D4 | **Compare selection**  | Dua baris: jarak centroid, selisih luas                     | **$0** ✅       |
| G-D5 | **Trace relasi**       | Garis visual ke berkas/permohonan terkait (vtable relation) | **$0** ✅       |


### 2.5 Fase G-E — Integrasi Data & Chat


| ID   | Fitur                         | Deskripsi singkat                                        | Tier biaya |
| ---- | ----------------------------- | -------------------------------------------------------- | ---------- |
| G-E1 | **Buka di Spasial** dari Data | Dari view Peta → tab Spasial, fokus lapisan + extent     | **$0**     |
| G-E2 | **Selection sync**            | Centang baris Data ↔ sorot di Spasial (dua arah)         | **$0**     |
| G-E3 | **Chat kontekstual spasial**  | Snapshot extent / koordinat ke thread chat               | **$0**     |
| G-E4 | **Filter dari panel kanan**   | «Tampilkan fitur dengan status sama» dari baris terpilih | **$0**     |


### 2.6 Fase G-F — Kontrol «desktop GIS»


| ID   | Fitur                      | Deskripsi singkat                          | Tier biaya          |
| ---- | -------------------------- | ------------------------------------------ | ------------------- |
| G-F1 | **Mini-map (overview)**    | Sudut kanan bawah                          | **$0**              |
| G-F2 | **Fullscreen peta**        | Sembunyikan sidebar/rail sementara         | **$0**              |
| G-F3 | **Keyboard shortcuts**     | `+/-` zoom, `F` fit, `Esc` clear selection | **$0**              |
| G-F4 | **Swipe compare**          | Dua basemap atau before/after impor        | **$0** (basemap §4) |
| G-F5 | **Attribute table docked** | Tabel atribut bawah peta ↔ sorot poligon   | **$0**              |
| G-F6 | **Grid / graticule**       | Untuk cetak (opsional)                     | **$0** 🔒 disembunyikan |


### 2.7 Fase G-G — Lapisan eksternal (opsional, fase lanjut)


| ID   | Fitur                           | Deskripsi singkat                          | Tier biaya                         |
| ---- | ------------------------------- | ------------------------------------------ | ---------------------------------- |
| G-G1 | **WMS / WMTS referensi**        | Batas administratif, peta dasar instansi   | **$0–$$** (tergantung penyedia)    |
| G-G2 | **GeoJSON referensi read-only** | Upload batas desa/kecamatan statis         | **$0** (storage Supabase existing) |
| G-G3 | **Tile cache offline (mobile)** | Unduh extent untuk lapangan tanpa jaringan | **$0–$** (storage + engineering)   |


### 2.8 Fase G-H — Relasi multi-tabel & navigasi entitas

**Konteks (2026-07):** proyek dengan **≥2 tabel bisnis** + kolom `relation` (pola B: hub nominatif + tabel geom terpisah). Fitur ini melengkapi peta yang hanya membaca `geometry` per lapisan — lihat **§11**.

**Status:** ✅ diimplementasi (2026-07-05); uji manual di project dummy **`GHDEMO`** (`0074`, `0077`).


| ID   | Fitur                               | Deskripsi singkat                                                                                       | Tier biaya |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------- |
| G-H1 | **Jelajah relasi (explorer)**       | Dari baris tabel mana pun: daftar koneksi keluar (dan opsional masuk) ke tabel lain; buka baris terkait | **$0** ✅   |
| G-H2 | **Tunjukkan di peta (find on map)** | Dari baris tanpa geom: ikuti rantai relasi → baris yang punya `geometry` → zoom/sorot di Spasial        | **$0** ✅   |
| G-H3 | **Panel 360° dari peta**            | Klik poligon → panel kanan multi-section (tabel hub + relasi 1 hop sesuai profil)                       | **$0** ✅   |
| G-H4 | **Profil entitas per proyek**       | Config: tabel anchor + urutan section (mis. Bidang → Berkas → Pemilik); opsional                        | **$0** ✅   |
| G-H5 | **Impor geom → isi relasi lookup**  | Saat impor DXF/GeoJSON ke tabel gambar: auto-resolve relasi ke tabel nominatif via `lookup_slug`        | **$0** ✅   |


**Keterkaitan:** **G-D5** trace relasi (garis centroid di peta, 1 hop) melengkapi G-H3 — toggle menu ⋯ Spasial; nice-to-have orientasi spasial.

### 3.1 Tier biaya (definisi)


| Tier     | Arti                                                            |
| -------- | --------------------------------------------------------------- |
| **$0**   | Hanya kode client/server existing; tidak perlu API key berbayar |
| **$0–$** | Default gratis; opsi berbayar jika skala/SLA membutuhkan        |
| **$**    | Hampir pasti butuh langganan/API atau biaya infra tambahan      |
| **$$**   | Lisensi data atau enterprise GIS                                |


### 3.2 Jawaban singkat: «Apakah semua ide butuh biaya tambahan?»

**Tidak.** Dari **38 item backlog (G-A1 … G-G3)**, **33 item = $0** murni (Leaflet, Turf.js, data vtable yang sudah ada).

Yang **bisa** menambah biaya:


| Area                             | Item backlog           | Kapan jadi berbayar                                                                 |
| -------------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| **Basemap satelit / premium**    | G-A5, G-F4             | Hanya jika memilih provider berlisensi (Google, Mapbox, MapTiler, ArcGIS Online, …) |
| **Geocoding / search alamat**    | *Tidak ada di backlog* | Jika nanti ditambah «cari alamat» → Google/Mapbox/HERE berbayar                     |
| **Tile OSM skala produksi**      | implisit di semua peta | Traffic sangat tinggi → hosting tile sendiri (~$5–50+/bulan VPS/CDN)                |
| **WMS komersial / BPN berbayar** | G-G1                   | Jika endpoint data instansi berlangganan                                            |
| **Offline tile cache cloud**     | G-G3                   | Storage + sync; bisa $0 jika purely local (IndexedDB)                               |


**Google Satellite** (disebut di diskusi awal) **tidak direkomendasikan sebagai default**: memerlukan **Google Maps Platform** (billing account, kuota/kredit, ToS ketat untuk tile di luar SDK resmi). **Bukan bagian keputusan produk saat ini.**

---

## 4. Strategi basemap (keputusan G-A5)

### 4.1 Opsi tanpa biaya lisensi pihak ketiga (rekomendasi default)


| Basemap                          | URL / sumber             | Biaya              | Catatan                                                                                                    |
| -------------------------------- | ------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| **OpenStreetMap** (saat ini)     | `tile.openstreetmap.org` | $0                 | Sudah dipakai; hormati [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)           |
| **OpenTopoMap**                  | `tile.opentopomap.org`   | $0                 | Topo/contour — cocok surveyor                                                                              |
| **Carto Positron / Dark Matter** | `basemaps.cartocdn.com`  | $0 tier dev/pilot  | Basemap netral untuk overlay poligon                                                                       |
| **Esri World Street / Topo**     | ArcGIS REST tile         | $0 non‑commercial* | *Periksa [Esri Terms](https://www.esri.com/en-us/legal/terms/full-master-agreement) untuk produk komersial |
| **Humanitarian OSM**             | HOT tile server          | $0                 | Alternatif OSM                                                                                             |


**Keputusan sementara (2026-07):** basemap switcher **G-A5** diimplementasi dengan **OSM + OpenTopoMap + Carto Positron** — semua **$0**, tanpa API key.

### 4.2 Opsi berbayar / butuh kontrak (hanya jika produk memutuskan)


| Provider                                       | Perkiraan                                                            | Risiko / catatan                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Google Maps Platform** (Satellite, Roads, …) | ~$2–7 per 1000 tile load (varies); kredit $200/bulan untuk akun baru | **Berbayar** setelah kredit; ToS melarang scrape tile di Leaflet tanpa Maps JS API resmi |
| **Mapbox**                                     | Free tier terbatas → pay-as-you-go                                   | API key wajib; pricing per map load                                                      |
| **MapTiler**                                   | Free dev tier → paid                                                 | Satellite/hybrid jelas di tier berbayar                                                  |
| **ArcGIS Online / Location Platform**          | Subscription                                                         | Cocok enterprise; lisensi komersial jelas                                                |
| **Maxar / Nearmap / vendor citra**             | Enterprise $$                                                        | Citra resolusi tinggi untuk PLM premium                                                  |
| **Self-host MBTiles**                          | VPS + storage $                                                      | Satu kali setup; cocok jika punya citra sendiri                                          |


### 4.3 Satelit tanpa Google?


| Opsi                                     | Biaya                                        | Kualitas / cakupan                                                             |
| ---------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| **Tidak menawarkan satelit di v1**       | $0                                           | Cukup untuk banyak workflow bidang (poligon di atas OSM/topo)                  |
| **Esri World Imagery** (REST tile)       | Gratis non‑komersial* / berlisensi komersial | Global; resolusi bervariasi; **validasi legal wajib** sebelum produk komersial |
| **Sentinel-2 / open aerial** (self-host) | Infra only                                   | Effort tinggi; Indonesia tercover tapi tidak «Google sharp»                    |
| **MapTiler Satellite**                   | Paid tier                                    | Integrasi Leaflet mudah                                                        |


**Keputusan sementara (2026-07):** **v1 basemap switcher tanpa satelit.** Evaluasi satelit di **G-A5b** setelah keputusan legal + anggaran (Esri vs MapTiler vs none).

---

## 5. Dependensi teknis (semua open source, $0)


| Kebutuhan         | Paket / plugin                                       | Lisensi   |
| ----------------- | ---------------------------------------------------- | --------- |
| Analisis geometri | `@turf/turf`                                         | MIT       |
| Ukur jarak/luas   | `leaflet-draw` atau `@geoman-io/leaflet-geoman-free` | BSD / OSS |
| Skala bar         | `leaflet-simple-graticule` atau custom L.control     | OSS       |
| Label             | `leaflet-tooltip` / custom divIcon                   | —         |
| Mini-map          | `leaflet-minimap`                                    | BSD       |


Tidak ada dependensi berbayar wajib untuk fase **G-A … G-F**.

---

## 6. Prinsip UX (tetap dari spatial-tab-ux)


| Prinsip                              | Penerapan fitur GIS                                                    |
| ------------------------------------ | ---------------------------------------------------------------------- |
| Peta dominan                         | Alat jarang dipakai → menu **⋯** atau overlay sudut                    |
| Alat sering (ukur, legenda, basemap) | Toolbar satu baris                                                     |
| Detail atribut                       | Tetap **panel kanan** `row-detail`, bukan popup tengah peta            |
| Mobile                               | Ukur, identify, fullscreen; rail → sheet                               |
| Tab Spasial vs view Peta             | Fitur GIS di **WorkspaceMap** → otomatis shared ke view Peta per tabel |


---

## 7. Fase implementasi (usulan)


| #         | Fase               | Deliverable                                                                         | Tier biaya  |
| --------- | ------------------ | ----------------------------------------------------------------------------------- | ----------- |
| **G-A**   | «Rasanya GIS»      | G-A1–A8: status bar, skala, legenda, opacity, zoom layer, basemap OSM/topo/positron | **$0** ✅    |
| **G-B**   | Surveyor           | G-B1–B5: ukur, identify, go to XY, CRS badge, diff impor                            | **$0** ✅    |
| **G-C**   | TOC lanjut         | G-C1–C3: grup, simbol, filter saved view                                            | **$0** ✅    |
| **G-D**   | Analisis lite      | G-D1–D5 ✅ (overlap, buffer, statistik, bandingkan, trace)                        | **$0** ✅    |
| **G-E**   | Integrasi          | G-E1–E4: buka di Spasial, selection sync, konteks chat, filter panel                | **$0** ✅    |
| **G-F**   | Desktop GIS        | G-F1–F5 ✅; **G-F6** graticule ditunda (kode ada, UI off)                         | **$0** 🟡    |
| **G-G**   | Eksternal          | G-G1–G3: WMS, referensi, offline                                                    | **$0–$$** ✅ |
| **G-H**   | Relasi multi-tabel | G-H1–H5 ✅ (uji: project **GHDEMO**)                                                | **$0** ✅    |
| **G-A5b** | Satelit (opsional) | Keputusan provider + legal                                                          | **$–$$**    |


**Urutan disarankan (historis):** G-A → G-B → G-E1 → G-D1 → G-F5 → G-G → **G-H** (selesai 2026-07-05). **Berikutnya:** §10 uji manual, **G-D4**, polish (centroid trace), **G-F6** / **G-A5b** jika diminta.

Tidak menggantikan **S7** (hapus legacy geom) di `workspace-spatial-tab-ux.md`.

---

## 8. Keputusan produk (ringkas)


| ID   | Topik                                   | Keputusan                                                                                                   |
| ---- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| GQ1  | Apakah fitur GIS majority berbayar?     | **Tidak** — hampir semua $0                                                                                 |
| GQ2  | Google Satellite?                       | **Tidak** di v1; butuh Google Maps Platform (berbayar + ToS)                                                |
| GQ3  | Basemap default v1                      | OSM (existing) + **OpenTopoMap** + **Carto Positron** — $0                                                  |
| GQ4  | Satelit                                 | **Tunda** (G-A5b); evaluasi Esri/MapTiler/self-host setelah kebutuhan legal                                 |
| GQ5  | Geocoding alamat                        | **Out of scope** backlog ini (berbayar jika ditambah)                                                       |
| GQ6  | Analisis spasial                        | **Client-side** (Turf) dulu; server-side PostGIS nanti jika dataset besar                                   |
| GQ7  | Roll-out UI alat                        | Shared `WorkspaceMap`; toolbar Spasial + kontrol overlay peta                                               |
| GQ8  | Kebijakan sementara                     | **Hanya fitur $0**; fase berbayar (G-A5b satelit, G-G WMS komersial) **freeze** sampai ada anggaran         |
| GQ9  | Model data proyek pilot (daftar bidang) | **Satu tabel virtual** — atribut + kolom `geometry` di baris yang sama (**pola penyimpanan A**, §11)        |
| GQ10 | Pola A / B / C = mode aplikasi?         | **Tidak** — konvensi desain tabel + fitur navigasi **G-H**; **bukan** cabang kode terpisah              |
| GQ11 | Entitas spasial default (proyek besar)  | **Rekomendasi:** geom di **tabel hub** (pola A); tabel lain tanpa geom + `relation` keluar                  |
| GQ12 | G-H kapan dikerjakan?                   | **Selesai** (2026-07-05) setelah spike **`GHDEMO`**; produksi menunggu proyek pilot nyata pola B |


### 8.0 Keputusan G-H (GQ-H1–H7) — dipakai di implementasi v1


| ID        | Topik                                            | Opsi                                                                                                                                           | Default sementara                                          |
| --------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **GQ-H1** | Siapa menentukan **tabel anchor** spasial?       | (a) Konvensi tim / dokumentasi proyek (b) Config per `project_id` di UI (c) Deteksi otomatis (tabel dengan geom + paling banyak relasi keluar) | **(a)** untuk v1 G-H                                       |
| **GQ-H2** | Kedalaman traverse relasi                        | 1 hop saja vs N hop (batas 2–3)                                                                                                                | **1 hop** untuk G-H1/G-H3 v1                               |
| **GQ-H3** | Relasi **balik** (inbound)                       | Tampilkan «tabel lain yang mengacu ke baris ini»?                                                                                              | **Ya**, read-only, 1 hop                                   |
| **GQ-H4** | Kardinalitas **1:N** di panel                    | Satu section per tabel target: list semua baris terkait vs hanya pertama                                                                       | **List semua** (dengan batas mis. 50)                      |
| **GQ-H5** | **Find on map** bila geom di tabel lain (pola B) | Aturan: kolom relasi eksplisit «geom holder» vs scan semua tabel geom di project                                                               | **Eksplisit** di profil G-H4 atau kolom relasi `gambar_id` |
| **GQ-H6** | Panel 360°: edit atau read-only?                 | Hanya baca vs inline edit per section                                                                                                          | **Read-only** v1; edit tetap lewat tab Data                |
| **GQ-H7** | Performa fetch                                   | Batch `resolveRelationLabels` + payload penuh vs lazy per section                                                                              | Putuskan saat spike desain API                             |


Keputusan di atas **sudah diterapkan** di kode v1 G-H. **Trace (G-D5):** 1 hop saja; tidak traverse rantai (G001→G002→G003 tidak digambar sekaligus dari G001).


| ID   | Status | Anchor kode                                                         |
| ---- | ------ | ------------------------------------------------------------------- |
| G-A1 | ✅      | `workspace-map-gis-chrome.tsx` — status bar koordinat/zoom/skala    |
| G-A2 | ✅      | `workspace-map.tsx` — `L.control.scale` + panah utara               |
| G-A3 | ✅      | `workspace-map-legend.tsx` — overlay legenda                        |
| G-A4 | ✅      | `workspace-spatial-layer-list.tsx` — slider opacity + persist       |
| G-A5 | ✅      | `workspace-map-basemaps.ts` + toolbar basemap (OSM, topo, positron) |
| G-A6 | ✅      | Tombol target di rail → `WorkspaceMapHandle.fitFootprints`          |
| G-A7 | ✅      | Simpan/pulihkan extent per `project_id` (menu ⋯)                    |
| G-A8 | ✅      | Toggle Label + tooltip permanen di zoom ≥ 14                        |


### 8.2 Implementasi G-B (2026-07-05)


| ID   | Status | Anchor kode                                                                                          |
| ---- | ------ | ---------------------------------------------------------------------------------------------------- |
| G-B1 | ✅      | Menu **Alat → Ukur jarak/luas**; `workspace-map-tool-controller.tsx` + `@turf/length` / `@turf/area` |
| G-B2 | ✅      | **Identify titik** → HUD daftar fitur; `lib/workspace-map-identify.ts`                               |
| G-B3 | ✅      | **Go to XY** dialog Lon/Lat + UTM 48S/49S; `workspace-spatial-go-to-dialog.tsx`                      |
| G-B4 | ✅      | Badge EPSG di status bar (klik toggle Lon/Lat ↔ UTM); persist `coordinateDisplay`                    |
| G-B5 | ✅      | Pratinjau impor: sorot existing tumpang (merah); `lib/workspace-map-import-diff.ts`                  |
| G-B6 | —      | ~~Export PNG~~ dibatalkan (2026-07-05)                                                               |


### 8.3 Implementasi G-C (2026-07-05)


| ID   | Status | Anchor kode                                                                                                       |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| G-C1 | ✅      | `workspace-spatial-layer-rail.tsx` — grup + urutan ↑↓; `workspace-spatial-layer-layout-preference.ts`             |
| G-C2 | ✅      | Editor simbol (isi/garis/dash/lebar) di rail; `workspace-spatial-layer-style-preference.ts` + `workspace-map.tsx` |
| G-C3 | ✅      | **Ikuti filter tab Data** (menu ⋯); `virtual-table-view-session.ts` + `virtual-table-row-filters.ts`              |


### 8.4 Implementasi G-D (2026-07-05)


| ID   | Status | Anchor kode                                                                                            |
| ---- | ------ | ------------------------------------------------------------------------------------------------------ |
| G-D1 | ✅      | Dialog **Analisis spasial → Overlap**; `lib/workspace-map-layer-overlap.ts`                            |
| G-D2 | ✅      | Tab **Within / buffer** (radius titik + within lapisan referensi); `lib/workspace-map-layer-within.ts` |
| G-D3 | ✅      | Tab **Statistik** extent per lapisan aktif; `lib/workspace-map-layer-stats.ts`                         |
| G-D4 | ✅      | Tab **Bandingkan** di dialog Analisis; `lib/workspace-map-compare-selection.ts` (@turf/centroid) |
| G-D5 | ✅      | Garis trace relasi (panel 360°, 1 hop); `lib/workspace-map-relation-trace.ts` + toggle menu ⋯          |


### 8.5 Implementasi G-E (2026-07-05)


| ID   | Status | Anchor kode                                                                                      |
| ---- | ------ | ------------------------------------------------------------------------------------------------ |
| G-E1 | ✅      | **Buka di tab Spasial** dari view Peta / toolbar Data; `workspace-spatial-data-sync-context.tsx` |
| G-E2 | ✅      | Centang baris Data ↔ sorot peta (toggle menu ⋯); kolom ◉ di grid                                 |
| G-E3 | ✅      | **Salin konteks peta** → clipboard + isi draft chat; `workspace-spatial-map-context-text.ts`     |
| G-E4 | ✅      | **Filter di Spasial** dari panel kanan row-detail; `workspace-spatial-filter-from-row.ts`        |


### 8.6 Implementasi G-F (2026-07-05)


| ID   | Status | Anchor kode                                                                     |
| ---- | ------ | ------------------------------------------------------------------------------- |
| G-F1 | ✅      | `workspace-map-minimap.tsx` — overview sudut kanan bawah; toggle menu ⋯         |
| G-F2 | ✅      | Tombol **Penuh** toolbar + keluar floating; sembunyikan rail/toolbar            |
| G-F3 | ✅      | Keyboard `+/-` zoom, `F` fit all, `Esc` clear alat/seleksi/panel                |
| G-F4 | ✅      | `workspace-map-basemap-swipe-control.tsx` + pane compare di `workspace-map.tsx` |
| G-F5 | ✅      | `workspace-spatial-attribute-dock.tsx` + `lib/workspace-map-attribute-rows.ts`  |
| G-F6 | 🔒      | Kode ada (`workspace-map-graticule-layer.tsx`); **disembunyikan** — perlu polish cetak/label |


### 8.7 Implementasi G-G (2026-07-05)


| ID   | Status | Anchor kode                                                                                                                          |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| G-G1 | ✅      | WMS + WMTS/XYZ referensi; `workspace-spatial-external-layers-dialog.tsx` + `workspace-map-external-layers.ts`                        |
| G-G2 | ✅      | GeoJSON read-only (URL atau unggah file → IndexedDB); `workspace-spatial-geojson-store.ts`                                           |
| G-G3 | ✅      | Unduh basemap offline + mode offline (IndexedDB); `workspace-spatial-offline-pack-dialog.tsx` + `workspace-map-cached-tile-layer.ts` |


### 8.8 Implementasi G-H (2026-07-05)


| ID   | Status | Anchor kode                                                                                                      |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| G-H1 | ✅      | `virtual-table-relation-explorer.tsx`; `fetchInboundRelationsForRowAction` di `virtual-table-actions.ts`         |
| G-H2 | ✅      | `lib/virtual-table-find-on-map.ts`; tombol **Tunjukkan di peta** di `virtual-table-view.tsx`                     |
| G-H3 | ✅      | `virtual-table-entity-360-panel.tsx`; `fetchEntity360PanelAction`; klik poligon → `openEntity360`                |
| G-H4 | ✅      | `lib/project-entity-360-profile.ts`; `workspace-entity-360-profile-dialog.tsx`; migration `0075`                 |
| G-H5 | ✅      | `lib/virtual-table-geom-inbound-link.ts`; hook di `importVirtualRowsGeoJsonBatchAction`                          |


---

## 9. Changelog (dokumen)


| Tanggal    | Perubahan                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| 2026-07-05 | **G-F6** graticule disembunyikan dari UI (kode tetap); perlu polish cetak                          |
| 2026-07-05 | **G-F6** grid graticule Lat/Lon (implementasi awal)                                                |
| 2026-07-05 | **G-D4 ✅** tab Bandingkan (jarak centroid + selisih luas); sinkron roadmap G-D lengkap              |
| 2026-07-05 | **Sinkron roadmap:** G-H ✅, G-D5 ✅; §2.8, §8.8, §11.4–11.6; GQ12; dummy trace **`0077`**            |
| 2026-07-05 | **G-H ✅** H1–H5 + **G-D5** trace; profil G-H4; inbound link G-H5; panel 360°; find-on-map           |
| 2026-07-05 | Migration **`0074`** project dummy `GHDEMO`; §10 boleh ditunda; §11.6 dummy G-H                      |
| 2026-07-05 | **§11.5–11.6** GQ9 bukan lock-in; urutan mulai pilot / §10 / G-H                                      |
| 2026-07-05 | **§11** pola data A/B/C; fase **G-H**; GQ9–GQ12 + keputusan terbuka GQ-H1–H7                          |
| 2026-07-05 | **G-G ✅** lapisan eksternal WMS/WMTS/GeoJSON + basemap offline IndexedDB; §8.7 + §10.9                |
| 2026-07-05 | **G-F ✅** desktop GIS: minimap, fullscreen, keyboard, swipe basemap, attribute dock; §8.6 + §10.7     |
| 2026-07-05 | **G-E ✅** integrasi Data/Chat: buka di Spasial, seleksi sync, konteks chat, filter panel; §8.5        |
| 2026-07-05 | **G-D ✅** analisis overlap, within/buffer, statistik extent; §8.4                                     |
| 2026-07-05 | **G-C ✅** grup lapisan, simbol per lapisan, filter sync Data→Spasial; §8.3 + §10 checklist uji manual |
| 2026-07-05 | **G-B ✅** alat surveyor: ukur, identify, go to XY, diff impor, export PNG; §8.2                       |
| 2026-07-05 | **G-A ✅** implementasi; kebijakan **$0 dulu** (GQ8); §8.1 anchor kode                                 |
| 2026-07-05 | Dokumen awal: backlog G-A…G-G, matriks biaya, strategi basemap, keputusan GQ1–GQ7                     |


---

## 10. Checklist uji manual (G-A … G-H)

Gunakan ruang kerja dengan **≥1 tabel virtual ber-geometry** (mis. daftar bidang) dan data impor uji. Centang setelah diverifikasi di browser.

> **Catatan:** item `[ ]` boleh **ditunda sengaja** — tidak menghalangi pilot data atau sprint G-H. Beberapa area punya ceklis tambahan terpisah; urutan verifikasi bebas.

### 10.1 Navigasi & dasar

- [x] Tab **Spasial** memuat peta tanpa error konsol
- [x] Klik poligon → panel kanan **row-detail** terbuka (bukan popup tengah)
- [x] Klik area kosong peta → panel kanan tertutup (jika row-detail aktif)
- [x] **Bantuan impor** (menu ⋯) → halaman help → **Back browser** kembali ke tab/org/project yang sama
- [ ] Mobile: rail lapisan tersembunyi; menu **Lapisan** di toolbar tersedia

### 10.2 G-A — «Rasanya GIS»

- [x] **Status bar** (bawah peta): koordinat kursor berubah saat mouse digerakkan
- [ ] Klik badge koordinat → toggle **Lat/Lon ↔ UTM**; preferensi persist setelah refresh
- [x] **Skala bar** dan **panah utara** terlihat di overlay peta
- [x] **Legenda** (kiri bawah): warna lapisan + jumlah fitur; pratinjau impor jika ada
- [x] **Basemap**: OSM / OpenTopoMap / Carto Positron — tile berganti, peta tidak blank
- [x] **Opacity** slider per lapisan di rail → poligon lebih transparan
- [x] **Target (zoom ke lapisan)** → extent fit ke lapisan itu saja
- [x] **Semua** → zoom ke semua lapisan aktif
- [x] Menu ⋯ → **Simpan tampilan peta** → navigasi/zoom → **Pulihkan** kembali ke view tersimpan
- [x] Toggle **Label** → teks judul baris muncul di centroid (zoom ≥ 14)

### 10.3 G-B — Alat surveyor

- [x] **Alat → Ukur jarak**: klik titik-titik → HUD panjang; Selesai / Bersihkan
- [x] **Alat → Ukur luas**: poligon → luas m²/ha di HUD
- [x] **Identify titik**: klik peta → daftar fitur di titik; pilih → panel kanan
- [x] **Go to XY**: Lon/Lat dan UTM 48S/49S → peta loncat ke koordinat
- [ ] **Pratinjau impor** dengan overlap existing → fitur tumpang **merah** di peta + legenda

### 10.4 G-C — TOC & simbol

- [x] Rail: tombol **+ Grup** → grup baru; collapse/expand grup
- [x] Dropdown **Grup** per lapisan → pindah ke grup / tanpa grup
- [x] Tombol **↑ ↓** mengubah urutan lapisan di daftar (persist setelah refresh)
- [x] **Palette (simbol)**: ubah isi, garis, dash, lebar → warna/garis di peta berubah
- [x] Tab **Data**: terapkan filter saved view → kembali **Spasial** → hanya subset geometri (badge jumlah `X / Y` jika filter aktif)
- [x] Menu ⋯ → matikan **Ikuti filter tab Data** → semua geometri tampil lagi
- [x] Toggle filter sync ON lagi → subset filter diterapkan

### 10.5 G-D — Analisis ringan

- [x] Menu ⋯ → **Analisis spasial…** → dialog terbuka
- [x] Tab **Statistik**: jumlah fitur, total luas (ha/m²), bbox per lapisan aktif
- [x] Tab **Overlap**: pilih lapisan A & B → pasangan tumpang tindih + luas irisan; klik hasil → sorot ungu + zoom
- [x] Tab **Within / buffer**: radius dari titik (Lon/Lat + meter) → daftar fitur dalam buffer; **Pusat peta saat ini** mengisi koordinat
- [x] Tab **Within / buffer**: mode **Dalam lapisan** → fitur sumber inside referensi
- [x] Tutup dialog → sorot analisis hilang
- [x] **GHDEMO:** panel 360° + menu ⋯ **Trace relasi di peta** → garis oranye antar poligon terkait 1 hop (mis. G002 ↔ G001, G003)
- [x] Tab **Bandingkan**: pilih fitur A & B → jarak centroid + selisih luas; sorot ungu di peta; prefill dari 2 baris tercentang (sync ON)

### 10.6 G-E — Integrasi Data & Chat

- [x] Tab **Data** (tabel ber-geometry): tombol **Buka di Spasial** → pindah tab Spasial + zoom ke lapisan/baris
- [x] View **Peta** per tabel: tombol **Buka di tab Spasial** (sudut kanan atas peta)
- [x] Menu ⋯ Spasial → **Sinkron seleksi Data ↔ Spasial** ON → centang baris (kolom ◉) ↔ sorot oranye di peta
- [x] Klik poligon di Spasial (sync ON) → toggle centang baris di Data
- [x] Menu ⋯ → **Salin konteks peta** → tempel di chat (atau buka chat baris → draft terisi)
- [x] Panel kanan row-detail → **Filter di Spasial** → tab Spasial + subset geometri sesuai nilai kolom

### 10.7 G-F — Desktop GIS

- [x] Menu ⋯ → **Mini-map overview** → kotak overview kanan bawah; klik mini-map → pan utama
- [x] Tombol **Penuh** → rail + toolbar hilang; tombol **Keluar layar penuh** di sudut kanan atas
- [x] Keyboard `+` / `-` → zoom in/out; `F` → fit semua lapisan; `Esc` → bersihkan alat, seleksi, panel kanan
- [x] Menu ⋯ → **Bandingkan basemap (swipe)** → slider atas peta; basemap kiri/kanan berbeda
- [x] Menu ⋯ → **Tabel atribut (dock)** → daftar fitur bawah peta; klik baris → sorot + zoom + panel kanan
- [x] Preferensi minimap/atribut/swipe persist per project setelah refresh
- [ ] ~~Grid graticule~~ ditunda (G-F6 disembunyikan)

### 10.8 G-H — Relasi multi-tabel (uji di **GHDEMO**)

- [x] Tab **Data** → baris **B001** tanpa geom → **Tunjukkan di peta** → tab Spasial + sorot poligon G001
- [x] Klik poligon → panel **360°** (multi-section), bukan hanya row-detail satu tabel
- [x] Menu baris / browser → **Jelajah relasi** (keluar + masuk)
- [x] Menu ⋯ Spasial → **Relasi peta & panel 360°…** (profil otomatis / lanjutan)
- [x] Impor GeoJSON ke **Gambar** dengan `no_bidang: B003` → kolom `gambar` di B003 terisi (**G-H5**)
- [x] Trace relasi: lihat item terakhir §10.5

### 10.9 G-G — Lapisan eksternal & offline

- [ ] Menu ⋯ → **Lapisan referensi eksternal…** → tambah WMS (URL + nama layer) → overlay tampil di peta
- [ ] Tambah lapisan WMTS/XYZ dengan template `{z}/{x}/{y}` → tile referensi tampil
- [ ] Unggah file `.geojson` atau URL GeoJSON → batas administratif read-only; toggle visibility + opacity di rail **Referensi eksternal**
- [ ] Klik **Target** pada lapisan GeoJSON → zoom ke extent
- [x] Menu ⋯ → **Basemap offline…** → unduh area saat ini (pilih zoom min/max) → paket muncul di daftar
- [x] Aktifkan **Mode offline** → basemap hanya dari tile tersimpan (area di luar paket kosong)
- [x] Refresh halaman → konfigurasi lapisan eksternal + paket offline persist per project

### 10.10 Regresi cepat

- [ ] Impor GeoJSON/DXF via wizard → pratinjau di peta → commit → lapisan baru muncul
- [ ] Semua lapisan dimatikan → banner peringatan + peta kosong (tanpa crash)
- [ ] Refresh halaman → visibility, opacity, basemap, layout grup, simbol, bookmark persist per project

---

## 11. Pola data multi-tabel vs fitur navigasi (catatan produk)

**Bukan tiga «mode» di kode.** Mesin yang sama untuk semua tabel virtual: lapisan peta dari kolom `geometry`; klik poligon → `row-detail` **tabel lapisan itu**; kolom `relation` = UUID + label tampilan.

### 11.1 Pola penyimpanan (keputusan tim / skema tabel)


| Pola                  | Geom di mana?                | Klik poligon buka…                                       | Cocok untuk                             |
| --------------------- | ---------------------------- | -------------------------------------------------------- | --------------------------------------- |
| **A — Hub + geom**    | Tabel pusat (mis. Bidang)    | Baris hub (atribut + geom satu tempat)                   | Proyek pilot; proyek besar (disarankan) |
| **B — Geom terpisah** | Tabel lain (mis. Gambar CAD) | Baris gambar; nominatif di hub via relasi                | Peran admin/surveyor sangat terpisah    |
| **C — Profil 360°**   | Fleksibel (aturan tampilan)  | Section multi-tabel di panel (**G-H3** + opsional **G-H4**) | Banyak tabel; UX terstruktur            |


Pola **C** melengkapi A atau B — **bukan** pengganti.

### 11.2 Alur kerja paralel (admin + surveyor) — pilot saat ini


| Langkah | Peran      | Aksi                                                              |
| ------- | ---------- | ----------------------------------------------------------------- |
| 1       | Admin / PM | Satu tabel «Daftar Bidang» + kolom `no_bidang` + kolom `geometry` |
| 2       | Admin      | Impor CSV nominatif (geom kosong boleh)                           |
| 3       | Surveyor   | Impor DXF/GeoJSON ke **tabel yang sama**; upsert via `no_bidang`  |
| 4       | Semua      | Klik poligon → panel kanan = baris lengkap                        |


Penyambung: `**no_bidang**` (atau kolom kunci upsert), bukan `feature_key` legacy issue.

### 11.3 Kebutuhan pengguna → fitur (status)


| Pertanyaan pengguna                       | Fitur                         | Status |
| ----------------------------------------- | ----------------------------- | ------ |
| «Baris X di A terhubung ke apa di B, C?»  | **G-H1** Jelajah relasi       | ✅      |
| «Poligon untuk baris ini di mana?»        | **G-H2** Find on map          | ✅      |
| «Klik poligon → lihat semua data terkait» | **G-H3** Panel 360° + **G-H4** | ✅      |
| Garis visual hubungan di peta (1 hop)     | **G-D5** Trace relasi         | ✅      |
| Impor geom isi relasi hub                 | **G-H5**                      | ✅      |


### 11.4 Yang sudah ada di kode (pasca G-H)


| Ada ✅                                                                 | Belum / batasan v1                                              |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| Kolom `relation`; resolve label; impor CSV `lookup_slug`               | Traverse relasi **N hop** di trace / explorer                   |
| Beberapa tabel geom = beberapa lapisan peta                            | Geom sintetis tanpa baris di tabel geom                         |
| **G-H2** find on map (hub → geom via relasi)                           | **G-A5b** satelit (GQ8)                                         |
| **G-H3** panel 360° + **G-H4** profil (otomatis / lanjutan)            | Edit inline di panel 360° (GQ-H6: read-only)                    |
| **G-H5** impor geom → isi relasi inbound hub                           | Satelit / geocoding (**G-A5b**, GQ5)                            |
| **G-D5** trace garis centroid, 1 hop (toggle menu ⋯)                   | Trace multi-hop; centroid area-weighted (polish)                |
| Explorer relasi keluar + masuk (**G-H1**)                              |                                                                 |


### 11.5 GQ9 (pola A) bukan lock-in

**GQ9 hanya mengunci alur pilot** — satu tabel, atribut + `geometry` di baris yang sama, upsert via kolom kunci (`no_bidang`). **Bukan** batasan arsitektur permanen.


| Situasi                                                  | Bisa? | Catatan                                                                         |
| -------------------------------------------------------- | ----- | ------------------------------------------------------------------------------- |
| Proyek baru pakai **pola B** (hub + tabel geom terpisah) | ✅     | Skema + **G-H** UX (find-on-map, panel 360°, trace); uji di **GHDEMO** dulu       |
| **A dan B** dalam satu `project_id`                      | ✅     | Tiap tabel virtual independen; mesin peta/relasi sama                           |
| Migrasi data pilot **A → B**                             | ✅     | Reorganisasi skema/data (pisah baris, isi relasi); **bukan** refactor fitur GIS |
| Tetap **pola A** untuk proyek besar                      | ✅     | Rekomendasi **GQ11**; pola B opsional per kebutuhan tim                         |


Pola **B** didukung di model data **dan** UX navigasi (**G-H**). Spike dev: project **`GHDEMO`** (`0074`, `0077`); produksi: replikasi skema + uji §10.8.

### 11.6 Mulai dari mana (urutan disarankan)

**Tanpa kode dulu — nilai pilot segera**

1. Siapkan tabel «Daftar Bidang»: kolom kunci (`no_bidang`), atribut nominatif, kolom `geometry`.
2. Admin: impor CSV (geom boleh kosong).
3. Surveyor: impor DXF/GeoJSON ke **tabel yang sama**; upsert lewat `no_bidang`.
4. Uji alur: klik poligon → panel kanan; tab Data ↔ Spasial; analisis overlap jika perlu.

**Verifikasi & perbaikan fitur yang sudah ada (§10)**

Centang checklist §10 di browser. Prioritas jika gagal uji:


| Prioritas | Item §10                                     | Kenapa                                   |
| --------- | -------------------------------------------- | ---------------------------------------- |
| 1         | **10.7** swipe basemap                       | Fitur G-F4; sering dilaporkan bermasalah |
| 2         | **10.3** identify titik, overlap impor merah | Alat surveyor inti                       |
| 3         | **10.6** Filter di Spasial dari row-detail   | Integrasi Data ↔ Spasial                 |
| 4         | **10.2** toggle UTM persist; **10.1** mobile | Polish UX                                |
| 5         | **10.9** lapisan eksternal WMS/GeoJSON       | Sudah di kode; perlu uji manual          |
| 6         | **10.10** regresi impor & persist            | Sebelum rilis pilot                      |


**Backlog berikutnya (pasca G-H)**


| Prioritas | Apa                                                                 |
| --------- | ------------------------------------------------------------------- |
| 1         | **§10** uji manual sisa (10.9 WMS/GeoJSON, 10.10 regresi)           |
| 2         | Replikasi **GHDEMO** → proyek pilot nyata pola B                    |
| 3         | Polish trace: centroid geometris; label garis (opsional)            |
| 4         | **G-F6** graticule — aktifkan kembali setelah work-around cetak     |
| 5         | **G-A5b** satelit — hanya jika diminta (GQ8)                        |


**Project dummy G-H:** org **KJSB Demo**, key **`GHDEMO`** — **Daftar Bidang** + **Gambar** (3 poligon trace); kolom `gambar_terkait`, `bidang_sebelah`; **B003** tanpa poligon. Migrations **`0074`**, **`0077`**. Detail: `docs/dummy-data-increment-6-8.md` §G-H.