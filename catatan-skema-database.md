# Catatan Skema Database — Project Management

> **Status:** draf awal. Akan disempurnakan bertahap sebelum implementasi.

## 1. Tujuan

Dokumen ini merangkum **skema database** untuk gabungan **manajemen proyek kerja internal** dan **domain Pelayanan Langsung Masyarakat (PLM)** — pencatatan berkas permohonan, pemilik tanah, dan kontak/kuasa. Struktur disusun agar bisa disesuaikan nanti (misalnya **spatial / GIS** pada objek bidang tanah).

## 2. Prinsip Umum

- **Multi-tenant opsional:** `organization` atau `workspace` sebagai batas data per perusahaan/tim.
- **Soft delete:** kolom `deleted_at` pada entitas penting agar data bisa dipulihkan dan audit tetap jelas.
- **Audit trail:** siapa membuat/mengubah dan kapan (`created_by`, `updated_by`, `created_at`, `updated_at`).
- **Normalisasi vs kemudahan query:** label/tag dan custom field sering dipisah tabel junction; untuk performa, indeks dan caching bisa ditambah di fase implementasi.

## 3. Domain PLM — berkas, pemilik tanah, kontak

### 3.1 Alur bisnis (catatan awal)

- Satu **berkas permohonan** memiliki **kode resmi** (contoh konvensi internal: `BKS-2026-XXXX` / KJSB).
- Yang datang ke layanan bisa **pemilik tanah yang namanya tercantum di berkas**, atau **kontak/kuasa** yang mewakili.
- Satu berkas (untuk **objek bidang tanah yang sama**) dapat mencantumkan **lebih dari satu nama pemilik** (misalnya dua pemilik).
- Satu **pemilik tanah** dapat terlibat di **banyak berkas** permohonan.
- Satu **kontak** dapat terhubung ke **banyak pemilik tanah** dan ke **banyak berkas** (mewakili / sebagai penghubung di beberapa kasus).
- Saat **kontak** (jika mewakili) datang ke kantor membawa **beberapa berkas** sekaligus, untuk rangkaian berkas itu diterbitkan **satu invoice** (satu tagihan gabungan).
- **Satu invoice** dapat dibayar **sekali** atau **beberapa kali**; setiap pembayaran dicatat sebagai **kwitansi** (satu baris pembayaran per bukti).
- Untuk berkas-berkas yang dibawa pada kunjungan yang sama, diterbitkan **satu tanda terima** (satu dokumen pengakuan penerimaan berkas).
- **Pemilik tanah dapat datang sendiri** (bukan lewat kuasa). Dalam kasus itu **tidak wajib** mengisi baris **`kontak`** dengan nama yang sama; cukup catat **pemilik mana yang menyerahkan** pada kunjungan tersebut (lihat §3.8).
- Setelah pembayaran, proses lanjut ke **permohonan informasi spasial** untuk menilai apakah bidang yang ditunjuk dapat dilanjutkan proses; hasil akhir disimpan sebagai data spasial (GeoJSON/geometry) tanpa revisi (lihat §3.9).
- Jika informasi spasial dinyatakan layak, dilanjutkan ke **surat tugas pengukuran** dan **surat pemberitahuan pengukuran**, lalu pengukuran lapangan oleh satu atau beberapa surveyor dengan 1-2 perangkat GNSS, dilanjutkan olah data di AutoCAD untuk menghasilkan file gambar (lihat §3.10).
- Setelah hasil ukur siap, proses lanjut ke **legalisasi GU di BPN** sampai terbit GU/NIB/PBT, TTE, upload final, dan penyelesaian (lihat §3.11).

### 3.2 Apakah skema perlu penyesuaian?

**Ya.** Model generik PM (hanya `project` / `issue`) **tidak cukup** untuk merekam relasi ini dengan rapi. Perlu **entitas domain PLM** tersendiri, lalu **dihubungkan** ke alur kerja (misalnya satu `issue` atau satu `project` = satu berkas, atau satu epic per berkas — diputuskan nanti).

Yang penting di basis data: relasi **banyak-ke-banyak (M:N)** dengan tabel penghubung (junction), bukan kolom tunggal `pemilik_id` di berkas saja.

### 3.3 Entitas yang disarankan (konseptual)

| Entitas | Peran |
|--------|--------|
| **berkas_permohonan** | Satu permohonan; kode unik `nomor_berkas` (mis. `BKS-2026-0042`); tanggal, jenis layanan, status proses, dll. |
| **pemilik_tanah** | Subjek hukum / orang atau badan sebagai master data (bukan hanya teks bebas di PDF), agar histori antar-berkas konsisten. |
| **kontak** | Pihak selain pemilik yang dihubungi atau mewakili (**kuasa, keluarga, konsultan**, dll.); **bukan wajib** dipakai saat pemilik datang sendiri (lihat §3.8). |
| **berkas_pemilik** (junction) | Menautkan berkas ↔ pemilik; opsional: `urutan`, `peran` (pemilik bersama, dll.), `nama_di_berkas` jika beda ejaan dengan master. |
| **kontak_pemilik** (junction) | Kontak ↔ pemilik (satu kontak mewakili beberapa pemilik). |
| **kontak_berkas** (junction) | Kontak ↔ berkas (satu kontak terkait beberapa permohonan); opsional: `peran` (kuasa formal, pendamping, kontak teknis), `tanggal_mulai` / `tanggal_akhir` jika kuasa bertime period. |
| **penerimaan_kunjungan** (disarankan) | Satu “sesi” di kantor: **siapa yang menyerahkan** (pemilik atau kontak) + daftar berkas; menautkan **satu invoice** dan **satu tanda terima** ke **set berkas yang sama** (hindari duplikasi daftar berkas). |
| **invoice** | Tagihan resmi; **M:N** ke berkas lewat baris rincian (atau lewat `penerimaan_id`); total, status pembayaran, dll. |
| **invoice_item** / **invoice_berkas** | Baris per berkas di invoice (opsional: harga satuan, subtotal). |
| **pembayaran** (kwitansi) | **Banyak baris per satu invoice**; tanggal, jumlah, nomor kwitansi, metode, referensi. |
| **tanda_terima** | Satu dokumen per kunjungan (atau per peristiwa serah terima); **M:N** ke berkas lewat junction (atau lewat `penerimaan_id`). |

### 3.4 Kolom ringkas (draf)

- **berkas_permohonan**  
  `id`, `nomor_berkas` (unik), `tanggal_berkas`, `status`, `catatan`, `created_at`, `updated_at`, `deleted_at`  
  *(FK ke `objek_bidang` atau geometri — lihat §3.5.)*

- **pemilik_tanah**  
  `id`, `nama_lengkap`, `nik` atau identitas lain (nullable / encrypted sesuai kebijakan), `alamat`, …

- **kontak**  
  `id`, `nama`, `telepon`, `email`, `hubungan` (opsional), …

- **berkas_pemilik** — `berkas_id`, `pemilik_id`, plus atribut per pasangan seperti di atas.

- **kontak_pemilik** — `kontak_id`, `pemilik_id`.

- **kontak_berkas** — `kontak_id`, `berkas_id`, `peran`, …

### 3.5 Objek bidang tanah (pertanyaan terbuka)

Anda menyebut **satu objek bidang tanah yang sama** di satu berkas dengan beberapa pemilik. Untuk lapangan dan GIS nanti, pertimbangkan entitas terpisah:

- **objek_bidang_tanah** (atau serupa): nomor bidang, NOP, alamat, **geometri** (polygon), luas — lalu **berkas_permohonan** mengacu ke `objek_bidang_id`.

Manfaat: berkas lain yang mengacu ke bidang yang sama tidak menduplikasi geometri. Jika tahap awal cukup “satu bidang per berkas” tanpa berbagi, geometri bisa tetap di level berkas dulu dan dipisah saat kebutuhan muncul.

### 3.6 Integrasi dengan modul PM

- Opsi A: **`berkas_permohonan` = satu `issue`** (atau tipe issue khusus) dengan tautan ke entitas PLM.
- Opsi B: **`berkas_permohonan` entitas utama**; `issue` / task hanya langkah kerja internal yang punya `berkas_id`.

Keduanya valid; pilihan mempengaruhi laporan dan board Kanban.

#### Berkas permohonan — perlu dikaitkan ke `project`?

**Tidak wajib.** Secara konsep, alur PLM (berkas, pemilik, kontak, penerimaan, invoice) sudah utuh tanpa `project`. Cukup mengikat semua data ke **`organization` / workspace** (satu kantor, satu unit kerja).

**Mengapa tetap sering menambahkan `project_id` (nullable)?**

| Situasi | Rekomendasi singkat |
|--------|----------------------|
| Satu unit layanan, satu tim, tidak perlu pemisahan papan kerja | **Tanpa project** untuk berkas, atau **satu project default** implisit; fokus filter lewat status berkas / tahun. |
| Beberapa tim / program / anggaran terpisah (“proyek” = mandat kerja) | **`berkas_permohonan.project_id`** (FK opsional atau wajib) agar laporan dan hak akses bisa per project. |
| Issue/task harus selalu tampil di board per project | **Ya, kaitkan:** berkas punya `project_id`, lalu task mewarisi project yang sama (atau task hanya punya `berkas_id` dan project di-*resolve* dari berkas). |

**Relasi yang umum jika dipakai:** `berkas_permohonan` **N : 1** `project` (satu berkas paling banyak satu project; satu project banyak berkas). Ini **bukan** menggantikan relasi berkas–pemilik–kontak; ini hanya **kategori kerja internal**.

**Ringkas:** kalau aplikasi Anda memakai **project** sebagai tempat board, sprint, dan membership tim — **kaitkan berkas ke project** (langsung atau lewat task). Kalau **project** hanya untuk hal lain (mis. pengembangan software) dan PLM satu alur global — **FK project pada berkas boleh diabaikan** (`NULL`) atau diganti dengan **label / tahun / jenis layanan** saja.

### 3.7 Invoice, pembayaran (kwitansi), dan tanda terima — relasi

**Ringkasan relasi (inti):**

| Dari | Ke | Kardinalitas | Keterangan |
|------|-----|--------------|------------|
| **invoice** | **berkas_permohonan** | **1 : N** (lewat baris) | Satu invoice memuat **beberapa berkas** yang dibawa pada kunjungan itu (via `invoice_item` / `invoice_berkas`). |
| **invoice** | **pembayaran** | **1 : N** | Satu invoice bisa lunas dengan **satu** kwitansi atau **cicilan** beberapa kwitansi. |
| **tanda_terima** | **berkas_permohonan** | **1 : N** (lewat baris) | Satu tanda terima mencakup **beberapa berkas** yang sama pada peristiwa serah terima itu. |
| **kontak** | **invoice** / **penerimaan** | **1 : N** (umumnya) | Kontak yang datang membawa berkas dapat dicatat sebagai `kontak_id` pada kunjungan atau invoice (bukan FK wajib di setiap berkas jika sudah lewat penerimaan). |

**Diagram alur (satu kunjungan):**

```text
kontak ──< penerimaan_kunjungan >── berkas_permohonan   (N berkas dibawa)
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
    invoice (1)           tanda_terima (1)
        │
        └──< pembayaran / kwitansi (1..N)
```

**Opsi disarankan: entitas `penerimaan_kunjungan`**

- Satu baris = **satu kali** pihak datang ke kantor dengan **sekumpulan berkas** tertentu.
- Kolom contoh: `id`, `tanggal_waktu`, **`pemilik_yang_menyerahkan_id`** (nullable), **`kontak_yang_menyerahkan_id`** (nullable), `petugas_penerima_id` (user internal, opsional), `catatan` — **tepat satu** dari dua FK penyerah terisi (constraint aplikasi/DB), kecuali kebijakan Anda mengizinkan pengecualian.
- Junction **`penerimaan_berkas`**: `penerimaan_id`, `berkas_id` (urutan opsional).
- **`invoice`**: `penerimaan_id` (unik, 1:1) — satu tagihan untuk kunjungan itu; rincian biaya per berkas tetap di **`invoice_item`** (`invoice_id`, `berkas_id`, `jumlah`, …) yang berisi **subset** atau **seluruh** berkas di penerimaan (biasanya sama persis).
- **`tanda_terima`**: `penerimaan_id` (unik, 1:1) — satu nomor tanda terima untuk daftar berkas yang sama; alternatif: junction **`tanda_terima_berkas`** jika suatu saat satu tanda terima harus dipecah tanpa mengikat penerimaan (kurang umum untuk alur Anda).

Manfaat **penerimaan**: satu sumber kebenaran untuk “berkas mana saja yang dibawa hari itu”, sehingga invoice dan tanda terima **tidak perlu menyalin daftar berkas secara terpisah** tanpa jembatan.

**Tanpa `penerimaan` (minimal):**

- **`invoice_berkas`**: (`invoice_id`, `berkas_id`, …) dan **`tanda_terima_berkas`**: (`tanda_terima_id`, `berkas_id`, …).
- Aturan bisnis di aplikasi: untuk satu kunjungan, kedua junction harus berisi **himpunan berkas yang sama**; lebih rentan inkonsistensi, tapi skema tetap valid.

**Pembayaran:**

- Tabel **`pembayaran`** (atau **`kwitansi`**): `id`, `invoice_id`, `tanggal`, `jumlah`, `nomor_kwitansi` (unik), `metode` (tunai, transfer, …), `referensi_bank` (opsional), `created_at`, …
- Di **`invoice`**: simpan `total_tagihan`; hitung **total terbayar** = jumlah `pembayaran` atau simpan kolom denormalisasi `total_terbayar` / `status` (`belum_bayar`, `sebagian`, `lunas`) yang diperbarui lewat trigger atau job.
- Constraint bisnis: Σ `pembayaran.jumlah` ≤ `invoice.total_tagihan` (atau izinkan kelebihan bayar sebagai deposit jika kebijakan mengizinkan — catat di catatan).

**Indeks / unik yang berguna**

- Unik: `invoice.nomor_invoice`, `tanda_terima.nomor`, `pembayaran.nomor_kwitansi`.
- Indeks: `(invoice_id)` pada pembayaran; `(penerimaan_id)` pada invoice dan tanda terima.

### 3.8 Pemilik datang sendiri — relasi dengan `kontak`

**Pertanyaan:** Kalau yang datang adalah **pemilik tanah** sendiri, apakah tabel **`kontak` harus tetap diisi** (misalnya dengan nama yang sama)?

**Rekomendasi: tidak wajib.** Lebih rapi membedakan peran:

| Yang datang | Apa yang diisi | Tabel `kontak` |
|-------------|----------------|----------------|
| **Kuasa / kontak** mewakili | `penerimaan.kontak_yang_menyerahkan_id` | Pakai baris **`kontak`** yang sudah ada (atau buat baru). Relasi **`kontak_berkas`** / **`kontak_pemilik`** tetap sesuai kebutuhan hukum/administrasi. |
| **Pemilik** sendiri | `penerimaan.pemilik_yang_menyerahkan_id` | **`kontak_id` boleh NULL.** Identitas orang yang datang sudah tercakup di **`pemilik_tanah`** + tautan **`berkas_pemilik`** (pemilik itu memang terdaftar di berkas yang diserahkan). |

**Relasi yang tetap berlaku:**

- **`berkas_pemilik`**: berkas ↔ pemilik (siapa nama di permohonan).
- **`penerimaan_berkas`**: berkas mana yang dibawa pada kunjungan itu.
- **`pemilik_yang_menyerahkan`**: harus konsisten dengan aturan bisnis — umumnya orang itu **salah satu pemilik** yang terhubung ke **minimal satu** berkas dalam penerimaan tersebut (validasi di aplikasi).

**Opsi kurang disarankan:** membuat baris **`kontak`** duplikat dengan nama sama seperti **`pemilik_tanah`** hanya agar “selalu ada kontak”. Ini menggandakan data dan membingungkan laporan (“kontak” vs “pemilik”). Jika suatu saat satu orang perlu dua peran jelas di master data, lebih baik **satu entitas `pemilik_tanah`** + **`kontak_pemilik`** hanya ketika ia juga berperan sebagai kuasa orang lain — atau gunakan flag **`orang_ini_juga_kontak`** dan tautkan ke dua baris dengan **ID sama-sama referensi** (lanjutan desain, tercatat di checklist).

**Ringkas:** pemilik datang sendiri → isi **`pemilik_yang_menyerahkan_id`** pada **`penerimaan_kunjungan`**, **`kontak_yang_menyerahkan_id` = NULL**; **`kontak`** tidak perlu diisi dengan “nama dirinya sendiri” hanya untuk formalitas.

### 3.9 Permohonan informasi spasial (pasca pembayaran)

Setelah pembayaran (minimal status invoice **sebagian** atau **lunas**, sesuai SOP), proses berikutnya adalah **permohonan informasi spasial** untuk menilai apakah bidang yang ditunjuk dapat dilanjutkan proses.

**Data yang perlu dicatat (sesuai alur Anda):**

- Nomor berkas
- Tanggal berkas
- NIB bidang terdaftar (dapat lebih dari satu, sebagai atribut di data spasial)
- Tanggal surat perintah setor (SPS)
- Nominal SPS
- Tanggal bayar SPS
- Tanggal download hasil
- Hasil data spasial (GeoJSON) yang memuat atribut NIB dan geometri

**Rekomendasi struktur tabel (disederhanakan sesuai aturan \"tanpa revisi\"):**

- **`permohonan_informasi_spasial`** (satu hasil final per berkas)
  - `id`, `berkas_id` (**unik**), `tanggal_permohonan`, `status_hasil` (`layak_lanjut`, `tidak_layak`, `perlu_review`),
  - `tanggal_sps`, `nominal_sps`, `tanggal_bayar_sps`, `tanggal_download_hasil`,
  - `hasil_geojson` (JSON/JSONB), `hasil_geom` (geometry, opsional tapi direkomendasikan untuk query spasial),
  - `catatan`, `created_at`, `updated_at`, `deleted_at`.

Catatan:
- `hasil_geojson` menyimpan payload asli.
- `hasil_geom` menyimpan geometri ter-normalisasi untuk query peta cepat.
- Atribut NIB dibaca dari properti GeoJSON; jika nanti butuh pelaporan tabular, NIB bisa di-*extract* ke view/materialized view tanpa membuat tabel detail terpisah.

**Relasi utama:**

| Dari | Ke | Kardinalitas | Catatan |
|------|----|--------------|---------|
| `berkas_permohonan` | `permohonan_informasi_spasial` | 1 : 0..1 | Maksimal satu hasil spasial final per berkas (tanpa revisi). |

**Kaitan dengan pembayaran (aturan bisnis):**

- Umumnya `permohonan_informasi_spasial` hanya boleh dibuat jika invoice terkait berkas sudah memenuhi syarat SOP pembayaran.
- Ini lebih cocok sebagai **validasi aplikasi/workflow** daripada FK langsung antar tabel (karena satu berkas bisa terkait beberapa invoice pada skenario tertentu).

**GeoJSON masuk aplikasi:**

- Ya, benar. Dalam skema ini, GeoJSON disimpan langsung di `permohonan_informasi_spasial.hasil_geojson`.
- Untuk performa spasial, geometri utamanya disalin ke `hasil_geom` (PostGIS `geometry` + indeks spasial).
- Karena tidak ada revisi, tidak perlu tabel file versi.

### 3.10 Pengukuran lapangan dan hasil gambar (pasca informasi spasial)

Setelah `permohonan_informasi_spasial.status_hasil = layak_lanjut`, proses berlanjut ke dokumen penugasan dan kegiatan ukur lapangan.

**Data proses yang perlu dicatat:**

- Nomor/tanggal **surat tugas pengukuran**
- Nomor/tanggal **surat pemberitahuan pengukuran**
- Tanggal janji ukur
- Tim surveyor (bisa lebih dari satu orang)
- Perangkat ukur GNSS yang dipakai (1 atau 2 unit)
- Referensi **gambar ukur (GU)** yang dibawa
- Hasil olahan AutoCAD (file gambar final)

**Rekomendasi struktur tabel:**

- **`pengukuran_lapangan`** (header kegiatan ukur per berkas)
  - `id`, `berkas_id`, `permohonan_spasial_id` (opsional FK ke `permohonan_informasi_spasial`),
  - `nomor_surat_tugas`, `tanggal_surat_tugas`,
  - `nomor_surat_pemberitahuan`, `tanggal_surat_pemberitahuan`,
  - `tanggal_janji_ukur`, `tanggal_realisasi_ukur` (opsional),
  - `status` (`dijadwalkan`, `diukur`, `olah_cad`, `selesai`),
  - `catatan`, `created_at`, `updated_at`, `deleted_at`.

- **`pengukuran_surveyor`** (anggota tim ukur, karena bisa banyak surveyor)
  - `id`, `pengukuran_id`, `surveyor_user_id`, `peran` (ketua/anggota), `created_at`.

- **`alat_ukur`** (master perangkat)
  - `id`, `kode_aset`, `jenis` (`gnss`), `merek_model`, `serial_number`, `is_active`.

- **`pengukuran_alat`** (alat yang dipakai pada kegiatan ukur, bisa 1-2 GNSS)
  - `id`, `pengukuran_id`, `alat_id`, `peran_alat` (base/rover atau unit-1/unit-2), `created_at`.

- **`pengukuran_dokumen`** (lampiran GU dan hasil AutoCAD)
  - `id`, `pengukuran_id`, `tipe_dokumen` (`gu_referensi`, `hasil_cad`),
  - `file_name`, `mime_type`, `storage_key` / `storage_url`,
  - `uploaded_at`, `uploaded_by`, `created_at`.

**Relasi utama:**

| Dari | Ke | Kardinalitas | Catatan |
|------|----|--------------|---------|
| `berkas_permohonan` | `pengukuran_lapangan` | 1 : N | Secara bisnis biasanya 1, tapi N memberi ruang pengukuran ulang bila SOP berubah. |
| `pengukuran_lapangan` | `pengukuran_surveyor` | 1 : N | Tim bisa lebih dari satu surveyor. |
| `pengukuran_lapangan` | `pengukuran_alat` | 1 : N | Umumnya 1-2 GNSS per kegiatan. |
| `pengukuran_lapangan` | `pengukuran_dokumen` | 1 : N | Menyimpan GU referensi dan output AutoCAD. |

**Aturan bisnis yang disarankan:**

- `pengukuran_lapangan` hanya boleh dibuat jika hasil spasial berstatus `layak_lanjut`.
- Validasi jumlah alat GNSS aktif di `pengukuran_alat` adalah 1 sampai 2 unit.
- Minimal satu surveyor pada `pengukuran_surveyor` sebelum status berubah ke `diukur`.
- File `hasil_cad` wajib ada sebelum status `selesai`.

### 3.11 Legalisasi GU di BPN (6 tahap)

Proses ini mendaftarkan hasil ukur ke sistem BPN sampai selesai legalisasi administrasi dan integrasi bidang.

**Konsep umum:** satu `berkas_permohonan` dapat punya satu proses legalisasi aktif; status bergerak bertahap dari tahap 1 sampai tahap 6.

**Tabel utama yang disarankan:** `legalisasi_gu`

- Kolom identitas:
  - `id`, `berkas_id`, `status_tahap` (`draft`, `submit_bpn`, `verifikasi_sps`, `terbit_gu`, `integrasi_bidang`, `tte_upload`, `selesai`).
- Tahap 1 (input awal admin):
  - `nomor_berkas_legalisasi`, `tanggal_berkas_legalisasi`,
  - `penggunaan_tanah`, `luas_hasil_ukur` (integer),
  - `tanggal_submit`.
- Tahap 2 (SPS dari BPN):
  - `tanggal_sps`, `nominal_sps`, `tanggal_bayar_sps`.
- Tahap 3 (terbit GU):
  - `nomor_gu`, `tanggal_gu`.
- Tahap 4 (integrasi bidang):
  - `nib_baru`, `tanggal_nib`,
  - `nomor_pbt`, `tanggal_pbt`.
- Tahap 5 (layout, TTE, upload):
  - `tanggal_tte_gu`, `tanggal_tte_pbt`,
  - `tanggal_upload_gu`, `tanggal_upload_pbt`.
- Tahap 6 (penyelesaian BPN):
  - `tanggal_persetujuan`, `tanggal_penyelesaian`.
- Audit:
  - `catatan`, `created_at`, `updated_at`, `deleted_at`.

**Lampiran file tahap 1, 2, dan 5:** `legalisasi_gu_file`

- `id`, `legalisasi_gu_id`, `tipe_file` (`hasil_ukur`, `scan_berkas`, `scan_sketsa_gu`, `sps_download`, `gu_signed`, `pbt_signed`, `dokumen_lain`),
- `file_name`, `mime_type`, `storage_key` / `storage_url`,
- `uploaded_by`, `uploaded_at`, `created_at`.

**Relasi utama:**

| Dari | Ke | Kardinalitas | Catatan |
|------|----|--------------|---------|
| `berkas_permohonan` | `legalisasi_gu` | 1 : 0..1 (disarankan) | Umumnya satu jalur legalisasi per berkas. Jika perlu daftar ulang, bisa diubah jadi 1:N. |
| `legalisasi_gu` | `legalisasi_gu_file` | 1 : N | Menyimpan file upload tahap 1 dan dokumen signed tahap 5. |
| `pengukuran_lapangan` | `legalisasi_gu` | 1 : 0..1 | Opsional FK `pengukuran_id` bila ingin menautkan legalisasi ke hasil ukur tertentu. |

**Aturan bisnis bertahap (gating):**

- Tahap 2 hanya boleh diisi jika `tanggal_submit` (tahap 1) sudah ada.
- Tahap 3 hanya boleh diisi jika `tanggal_bayar_sps` ada.
- Tahap 4 hanya boleh diisi jika `nomor_gu` sudah ada.
- Tahap 5 hanya boleh diisi jika `nib_baru` dan `nomor_pbt` sudah ada.
- Tahap 6 hanya boleh diisi jika upload GU/PBT (tahap 5) selesai.

**Daftar file wajib per tahap (final):**

- **Tahap 1 (wajib):** `scan_sketsa_gu`, `scan_berkas`, `hasil_ukur`.
- **Tahap 2 (wajib):** `sps_download` (hasil unduh SPS dari web BPN).
- **Tahap 3:** tidak ada file dari internal (proses murni di BPN).
- **Tahap 4:** tidak ada file dari internal (proses murni di BPN).
- **Tahap 5 (wajib):** `gu_signed`, `pbt_signed` (file GU & PBT ter-TTE).
- **Tahap 6:** tidak ada file dari internal (proses murni di BPN).

**Catatan implementasi:**

- Simpan `luas_hasil_ukur` sebagai bilangan bulat (sesuai proses Anda).
- `nomor_gu`, `nib_baru`, `nomor_pbt` sebaiknya diindeks dan diberi unik sesuai kebijakan domain.
- Jejak perubahan: **`plm.legalisasi_gu_history`** (F5-4 / migrasi **`0014`**) mencatat patch field, naik tahap, lampiran, dan pembuatan draft.

### 3.12 Model geometri bidang (eksisting vs hasil ukur)

Anda benar: dalam alur ini secara natural ada **dua entitas geometri** yang berbeda fungsinya:

1) **Bidang eksisting (referensi BPN)** — muncul saat **informasi spasial**. Ini dipakai untuk *cek sekitar lokasi / constraints* dan konteks peta awal.  
2) **Bidang hasil ukur (draft internal)** — hasil kerja surveyor (dari ukur + olah CAD) yang kemudian **didaftarkan** hingga terbit **NIB/PBT**.

Supaya konsisten dan mudah ditampilkan di peta, rekomendasi skema spasialnya:

#### A. `bidang_eksisting_bpn` (referensi saat informasi spasial)

- **Sumber**: hasil download informasi spasial (GeoJSON) / data BPN.
- **Kunci domain**: `nib` (atau identitas BPN lain jika ada).
- **Kolom ringkas**:
  - `id`, `nib`, `geom` (geometry), `atribut` (JSONB, opsional), `sumber`, `downloaded_at`.

Catatan: ini bisa di-*upsert* berdasarkan `nib` saat proses info spasial.

#### B. `bidang_hasil_ukur` (draft internal sampai legalisasi selesai)

- **Sumber**: hasil pengukuran + olah CAD (turunan geometri dari GU/PBT yang dilayout).
- **Kunci internal**: `id` + FK ke berkas.
- **Kolom ringkas**:
  - `id`, `berkas_id`, `pengukuran_id` (opsional), `geom` (geometry), `luas_ukur` (integer/decimal sesuai kebijakan), `created_at`.

#### C. Hubungan ke proses (apa ditautkan ke mana)

- `permohonan_informasi_spasial` menyimpan hasil spasial BPN (GeoJSON + `hasil_geom`).  
  Jika Anda ingin “bidang sekitar” disimpan sebagai entitas-queryable, ekstrak feature-feature penting ke `bidang_eksisting_bpn`.

- `legalisasi_gu` menyimpan nomor **GU/NIB/PBT** yang terbit.  
  Tambahkan FK opsional ke geometri internal:
  - `legalisasi_gu.bidang_hasil_ukur_id` (opsional, 1:1 secara praktik).

#### D. Saat NIB baru terbit (menjembatani dua dunia)

Ketika tahap 4 legalisasi menghasilkan `nib_baru`, Anda bisa:

- menyimpan `nib_baru` di `legalisasi_gu`, dan
- membuat/menautkan baris `bidang_eksisting_bpn` untuk NIB baru (jika/ketika geometri BPN untuk NIB baru tersedia), lalu
- buat tabel penghubung **`bidang_mapping`** (opsional tapi rapi):
  - `id`, `bidang_hasil_ukur_id`, `bidang_eksisting_bpn_id`, `jenis_mapping` (`precheck`, `hasil_terbit`), `created_at`.

Dengan ini, peta bisa menampilkan:
- layer “**hasil ukur (draft)**” (dari `bidang_hasil_ukur.geom`)
- layer “**bidang BPN (eksisting/terbit)**” (dari `bidang_eksisting_bpn.geom`)

#### E. Praktik indeks & SRID

- Pastikan `geom` memakai SRID yang konsisten (mis. 4326 atau SRID internal).
- Buat indeks spasial GiST pada `bidang_eksisting_bpn.geom` dan `bidang_hasil_ukur.geom`.

---

## 4. Entitas inti manajemen proyek (ringkas)

| Entitas | Fungsi umum |
|--------|-------------|
| **User** | Akun pengguna; autentikasi (bisa terpisah ke layanan auth). |
| **Organization / Workspace** | Kontainer tingkat atas (perusahaan, divisi, atau space tim). |
| **Project** | Satu proyek dalam workspace; punya pengaturan, anggota, status. |
| **ProjectMember** | Relasi user–project + peran (owner, admin, member, viewer). |
| **Board / View** | Opsional: papan Kanban per proyek atau view tersimpan (filter, kolom). |
| **Issue / Task / WorkItem** | Unit kerja utama: judul, deskripsi, status, prioritas, assignee, due date. |
| **Status** | Daftar status per proyek atau per board (To Do, In Progress, Done, custom). |
| **Epic / Milestone** | Pengelompokan issue besar atau target tanggal. |
| **Sprint** | Untuk alur agile: rentang waktu + backlog sprint. |
| **Label / Tag** | Kategori bebas (bug, feature, urgent); many-to-many ke issue. |
| **Comment** | Diskusi pada issue (thread sederhana atau nested opsional). |
| **Attachment** | File terlampir (metadata + URL storage). |
| **TimeEntry** | Pencatatan waktu kerja per issue/user. |
| **Dependency** | Relasi antar issue (blocks, relates to, duplicates). |
| **Activity / AuditLog** | Riwayat perubahan untuk notifikasi dan compliance. |
| **Notification** | Preferensi atau antrian notifikasi per user. |
| **Invitation** | Undangan ke workspace/project (email + token). |

## 5. Skema konseptual PM (tabel & kolom utama)

Berikut **kerangka** yang sering dipakai; nama tabel/kolom bisa disesuaikan saat implementasi (PostgreSQL, SQL Server, dll.).

### 5.1 Identitas & akses

- **users**  
  `id`, `email`, `name`, `avatar_url`, `timezone`, `locale`, `created_at`, `updated_at`, `deleted_at`

- **organizations** (atau **workspaces**)  
  `id`, `name`, `slug`, `settings` (JSON opsional), `created_at`, `updated_at`, `deleted_at`

- **organization_members**  
  `organization_id`, `user_id`, `role` (owner / admin / member), `joined_at`

- **projects**  
  `id`, `organization_id`, `name`, `key` (singkatan unik, mis. `PROJ`), `description`, `is_archived`, `created_at`, `updated_at`, `deleted_at`

- **project_members**  
  `project_id`, `user_id`, `role`, `joined_at`

### 5.2 Pekerjaan (issue / task)

- **issues** (atau **tasks**)  
  `id`, `project_id`, `key` (nomor tampilan, mis. `PROJ-42`), `title`, `description` (rich text / markdown),  
  `status_id`, `priority` (enum: low / medium / high / critical),  
  `reporter_id`, `assignee_id` (nullable),  
  `parent_id` (nullable, untuk sub-task atau hierarki),  
  `epic_id`, `sprint_id` (nullable),  
  `due_date`, `start_date`, `estimate_points` atau `estimate_minutes`,  
  `sort_order`, `created_at`, `updated_at`, `deleted_at`

- **statuses**  
  `id`, `project_id` (atau `board_id`), `name`, `category` (todo / in_progress / done), `position`, `is_default`

- **epics**  
  `id`, `project_id`, `name`, `description`, `start_date`, `end_date`, `created_at`, `updated_at`

- **sprints**  
  `id`, `project_id`, `name`, `goal`, `start_date`, `end_date`, `state` (planned / active / closed)

### 5.3 Klasifikasi & fleksibilitas

- **labels**  
  `id`, `project_id` (atau `organization_id`), `name`, `color`

- **issue_labels**  
  `issue_id`, `label_id`

- **custom_fields** (opsional, untuk produk yang kompleks)  
  `id`, `project_id`, `name`, `field_type` (text, number, select, date, user), `options` (JSON untuk select)

- **issue_custom_field_values**  
  `issue_id`, `custom_field_id`, `value` (text/JSON tergantung tipe)

### 5.4 Kolaborasi & file

- **comments**  
  `id`, `issue_id`, `author_id`, `body`, `parent_comment_id` (nullable, untuk reply), `created_at`, `updated_at`, `deleted_at`

- **attachments**  
  `id`, `issue_id` (atau `comment_id`), `uploaded_by`, `file_name`, `mime_type`, `size_bytes`, `storage_url` atau `storage_key`, `created_at`

### 5.5 Waktu & dependensi

- **time_entries**  
  `id`, `issue_id`, `user_id`, `started_at`, `ended_at` atau `duration_minutes`, `note`, `created_at`

- **issue_dependencies**  
  `id`, `from_issue_id`, `to_issue_id`, `type` (blocks, blocked_by, relates_to, duplicates)

### 5.6 Riwayat & notifikasi

- **activity_log** (atau **issue_history**)  
  `id`, `issue_id`, `actor_id`, `action` (created, status_changed, assigned, …), `metadata` (JSON: nilai lama/baru), `created_at`

- **notifications**  
  `id`, `user_id`, `type`, `payload` (JSON), `read_at`, `created_at`

### 5.7 Board Kanban (opsional)

- **boards**  
  `id`, `project_id`, `name`, `is_default`

- **board_columns**  
  `id`, `board_id`, `status_id`, `position`

*(Alternatif: status sudah punya `position` per project — board hanya view/filter tanpa tabel tambahan.)*

## 6. Indeks & constraint yang umum

- Unik: `(organization_id, slug)` pada organization; `(project_id, key)` pada issue jika `key` numerik per proyek.
- Foreign key dengan `ON DELETE` sesuai kebijakan (soft delete sering tidak cascade fisik).
- Indeks untuk query sering: `(project_id, status_id)`, `(assignee_id, due_date)`, `(project_id, updated_at DESC)`.
- Full-text search: indeks GIN (PostgreSQL) pada `title` + `description` jika dibutuhkan.

## 7. Ekstensi spatial (catatan untuk nanti)

Jika proyek ini **berbasis spasial** (GIS), pertimbangkan menambah:

- Kolom geometri pada **issue**, **berkas_permohonan**, atau entitas **objek_bidang_tanah** (`geometry`, SRID, `label`).
- Tabel **layers** / **map_views** terikat project atau wilayah kerja.
- Indeks spasial (GiST / SP-GiST) dan aturan validasi geometri.

Detail akan ditulis setelah kebutuhan bisnis dirinci.

## 8. Checklist penyempurnaan berikutnya

### 8.1 Keputusan yang sudah ditetapkan

- [x] Memilih model tenant: **wajib `organization`**.
- [x] Workflow status: **global per project/organization**.
- [x] Sub-task: **hierarki dalam**.
- [x] Integrasi auth: **internal saja** (tabel `users` internal).
- [x] Kebutuhan spatial: **rekomendasi: keduanya** (`objek_bidang_tanah` untuk referensi + `bidang_hasil_ukur` untuk hasil kerja/internal).
- [x] Pelaporan: **ya**, perlu tabel agregat / materialized view.
- [x] PLM: surat kuasa di `kontak_berkas` **tidak wajib**.
- [x] PLM: satu orang bisa jadi pemilik dan kontak — **pakai 2 entitas saja** (`pemilik_tanah` + `kontak`), tanpa `party` tunggal.
- [x] PLM: validasi `pemilik_yang_menyerahkan` **tidak harus** wajib termasuk pemilik di berkas.
- [x] Keuangan: **ada invoice tanpa kunjungan fisik** (keduanya harus didukung).
- [x] Keuangan: satu berkas masuk lebih dari satu invoice? **tidak**.
- [x] PM: `berkas_permohonan.project_id` **dipakai** (pembatasan akses per project/berkas).
- [x] Spasial: permohonan informasi spasial **boleh tanpa pembayaran terlebih dahulu** (pengecualian orang tertentu).
- [x] Spasial: standar SRID: **4326** (sementara).
- [x] Spasial: aturan validasi geometri **sudah ditetapkan** (Polygon/MultiPolygon, SRID 4326, valid wajib, luas > 0, overlap boleh + warning, geometri invalid ditolak).
- [x] Pengukuran: **bisa pengukuran ulang**.
- [x] Pengukuran: format hasil final: **GeoJSON atau DXF**.
- [x] Pengukuran: data titik ukur mentah **perlu disimpan**.
- [x] Legalisasi GU: relasi `berkas_permohonan -> legalisasi_gu` = **1:N** (mendukung daftar ulang; daftar ulang mulai lagi dari permohonan informasi spasial).
- [x] Legalisasi GU: daftar file wajib per tahap **sudah ditetapkan** (tahap 1, 2, dan 5 wajib; tahap 3, 4, 6 tidak ada file internal).
- [x] Legalisasi GU: unik `nomor_gu`/`nib_baru`/`nomor_pbt` = **per tahun + per kantor pertanahan**.
- [x] Geometri: `bidang_eksisting_bpn` **dipisah** + tetap simpan GeoJSON raw (ikuti rekomendasi).
- [x] Geometri: `bidang_hasil_ukur` **1:1 ke `berkas_permohonan`**.
- [x] Geometri: strategi mapping draft ↔ terbit = **opsi 1** (pakai `nib_baru` di `legalisasi_gu`, tanpa tabel `bidang_mapping` dulu).

### 8.2 Penjelasan untuk poin yang diminta lebih detail

- **Workflow status: global per project atau multiple board?**  
  Maksudnya: apakah daftar status proses (`draft`, `submit`, `verifikasi`, dst.) dipakai sama untuk semua tampilan kerja dalam satu project, atau setiap **board** punya status sendiri.  
  **Board** di sini artinya papan kerja/tampilan alur (mirip Kanban) tempat item proses dipindah antar status.  
  Keputusan saat ini: **global per project/organization**, supaya pelacakan proses administratif tetap konsisten.

- **Integrasi auth: tabel `users` internal vs OIDC-only?**  
  Maksudnya: login user disimpan sendiri (email/password internal) atau hanya memakai login pihak ketiga (Google/Microsoft/SSO pemerintah).  
  Keputusan saat ini: **internal saja** dengan tabel `users` internal (cocok untuk Supabase juga, bisa pakai auth internal + profil/role di tabel aplikasi).

- **PLM: satu orang bisa jadi pemilik dan kontak**  
  Maksudnya: apakah perlu satu entitas “orang” tunggal (`party`) agar tidak duplikat identitas saat orang yang sama kadang jadi pemilik, kadang jadi kontak.  
  Plus/minus:
  - **Dua entitas terpisah (`pemilik_tanah` + `kontak`)**
    - Plus: sederhana, sesuai istilah operasional harian, implementasi cepat.
    - Minus: berisiko duplikasi orang yang sama di dua tabel; deduplikasi/reporting lintas peran lebih sulit.
  - **Satu entitas `party` + tabel peran**
    - Plus: identitas tunggal, minim duplikasi, analitik lintas peran lebih rapi.
    - Minus: desain lebih kompleks, query awal lebih panjang, onboarding tim lebih lama.
  Keputusan saat ini: **dua entitas terpisah saja** (`pemilik_tanah` dan `kontak`).

- **PM: `berkas_permohonan.project_id` dipakai atau tidak?**  
  Maksudnya: berkas dikelompokkan ke project kerja (tim/program) atau cukup di level organization saja.  
  Keputusan saat ini: **dipakai**, karena akses harus dibatasi ke pihak yang terkait berkas/project tersebut.

- **Legalisasi GU: daftar file wajib per tahap**  
  Maksudnya: file mana yang harus ada agar tahap bisa lanjut (contoh: tahap 1 wajib scan berkas + scan sketsa, tahap 5 wajib GU/PBT signed).  
  Keputusan saat ini:
  - Tahap 1 wajib `scan_sketsa_gu`, `scan_berkas`, `hasil_ukur`.
  - Tahap 2 wajib `sps_download`.
  - Tahap 3 dan 4 tidak ada file internal.
  - Tahap 5 wajib `gu_signed` dan `pbt_signed`.
  - Tahap 6 tidak ada file internal.

- **Geometri: tabel `bidang_eksisting_bpn` atau cukup GeoJSON raw**  
  Maksudnya: data eksisting BPN disimpan hanya sebagai payload mentah, atau diekstrak ke tabel geometri terstruktur.  
  Keputusan saat ini: **ikuti rekomendasi** = simpan keduanya (raw + tabel geometri terstruktur).

- **Geometri: `bidang_hasil_ukur` 1:1 ke `berkas` vs 1:1 ke `legalisasi_gu` (plus/minus)**  
  - Ke `berkas`: sederhana, cocok bila satu berkas satu hasil ukur final.  
  - Ke `legalisasi_gu`: lebih fleksibel untuk daftar ulang/multi-siklus legalisasi.  
  Keputusan saat ini: **ke `berkas` saja** (1:1 ke `berkas_permohonan`).

- **Geometri: mapping draft hasil ukur ↔ bidang BPN terbit**  
  Maksudnya: cara menghubungkan geometri internal sebelum terbit dengan geometri resmi setelah terbit NIB.  
  Opsi:
  1) cukup pakai `nib_baru` di `legalisasi_gu` (paling sederhana), atau  
  2) tabel `bidang_mapping` (lebih rapi/auditable untuk riwayat perubahan).
  Contoh riwayat perubahan yang biasanya perlu audit (alasan opsi 2 kadang dipakai):
  - **Kasus koreksi geometri internal**: hasil ukur awal `A` ternyata salah orientasi, diganti ke geometri `B` sebelum upload final.
  - **Kasus split/merge di BPN**: satu draft internal saat terbit menjadi dua bidang NIB, atau dua draft digabung jadi satu NIB.
  - **Kasus daftar ulang**: legalisasi pertama gagal/tutup otomatis, legalisasi ulang menghasilkan relasi NIB yang berbeda.
  - **Kasus pembaruan batas**: setelah verifikasi BPN ada penyesuaian batas kecil; perlu jejak dari draft lama ke geometri terbit final.
  Keputusan saat ini: **opsi 1 saja** (pakai `nib_baru` di `legalisasi_gu`).

- **Spasial: aturan validasi geometri**  
  Keputusan saat ini:
  - Tipe geometri wajib **Polygon/MultiPolygon** (karena bidang tanah).
  - SRID wajib **4326 (WGS84)** agar konsisten dengan rencana tampilan peta di Leaflet.
  - Geometri wajib **valid** (invalid langsung ditolak, tidak auto-fix).
  - Luas wajib **> 0**.
  - Batas maksimum operasional saat ini mengacu konteks Kantah kab/kota: **<= 25 hektar** (jika terlampaui beri warning/flag, kebijakan blokir bisa diputuskan kemudian).
  - Overlap antarbidang **boleh**, tetapi sistem harus memberi **notifikasi/warning**.

---

*Terakhir diperbarui: §8 dikunci lagi — termasuk aturan validasi geometri final (Polygon/MultiPolygon, SRID 4326, valid wajib, overlap warning, invalid ditolak).*

## 9. Arsitektur modular (core PM + PLM opsional)

Tujuan: aplikasi tetap seperti project management umum, tetapi bisa mengaktifkan modul PLM saat dibutuhkan.

### 9.1 Prinsip modular

- **Core PM selalu aktif** untuk semua organisasi/project.
- **PLM opsional**: hanya aktif untuk organisasi yang memang menjalankan proses PLM.
- **Spasial opsional**: bisa aktif bersama PLM (atau modul lain yang butuh peta).
- **Keuangan opsional**: invoice/pembayaran bisa dipakai PLM, dan bisa dipakai use case non-PLM bila diperlukan.

### 9.2 Pemisahan skema database (PostgreSQL)

- `core_pm`  
  Tabel umum: `projects`, `issues/tasks`, `statuses`, `project_members`, `comments`, `attachments`, `activity_log`, `notifications`.

- `plm`  
  Tabel domain PLM: `berkas_permohonan`, `pemilik_tanah`, `kontak`, `berkas_pemilik`, `kontak_berkas`, `kontak_pemilik`, `penerimaan_kunjungan`, `penerimaan_berkas`, `legalisasi_gu`, `legalisasi_gu_file`, dst.

- `spatial`  
  Tabel geometri: `bidang_eksisting_bpn`, `bidang_hasil_ukur` + indeks spasial + validasi geometri.

- `finance`  
  Tabel keuangan: `invoice`, `invoice_item`, `pembayaran/kwitansi`.

### 9.3 Kontrak antar modul (FK minimal, jelas)

- `plm.berkas_permohonan.project_id` -> `core_pm.projects.id` (karena akses dibatasi per project).
- `finance.invoice` bisa menaut ke `plm.penerimaan_kunjungan` **nullable** (karena ada invoice tanpa kunjungan fisik).
- `spatial.bidang_hasil_ukur.berkas_id` -> `plm.berkas_permohonan.id`.
- `plm.legalisasi_gu.nib_baru` dipakai sebagai penghubung ke data bidang terbit BPN (opsi mapping sederhana yang sudah disepakati).

### 9.4 Aktivasi modul per organisasi

Tambahkan registry modul, misalnya:

- `core.module_registry` (master modul)
  - `module_code` (`core_pm`, `plm`, `spatial`, `finance`), `name`, `is_core`.
- `core.organization_modules` (modul aktif per organization)
  - `organization_id`, `module_code`, `is_enabled`, `enabled_at`.

*Implementasi saat ini:* kedua konsep di atas ada di schema **`core_pm`** sebagai `module_registry` dan `organization_modules` (satu schema dengan PM untuk PostgREST — lihat **§17**).

Aturan:

- `core_pm` selalu `is_enabled = true`.
- Menu UI, endpoint API, dan validasi workflow membaca status modul ini.

### 9.5 Dampak ke UI/UX

- Jika modul `plm` nonaktif: user hanya melihat PM umum (project/task/board/report standar).
- Jika `plm` aktif: muncul menu berkas, informasi spasial, pengukuran, legalisasi GU.
- Jika `spatial` aktif: halaman peta + validasi geometri ditampilkan.
- Jika `finance` aktif: halaman invoice/pembayaran tampil.

### 9.6 Dampak ke implementasi teknis

- Migrasi DB dibuat per modul (folder migration terpisah).
- Seed data dan policy akses (RLS/role) juga per modul.
- Service/API dipisah per bounded context, lalu disatukan di gateway/app layer.

---

*Terakhir diperbarui: §9 ditambahkan — desain modular agar PM umum tetap ringan dan modul PLM/spasial/keuangan bisa diaktifkan opsional per organization.*

## 10. Pemetaan tabel ke schema modul (siap migrasi)

Bagian ini menjadi acuan implementasi migration SQL per modul.

### 10.1 `core_pm` (wajib, selalu aktif)

- [ ] `organizations`
- [ ] `users`
- [ ] `organization_members`
- [ ] `projects`
- [ ] `project_members`
- [ ] `statuses` (global workflow per project/organization)
- [ ] `issues` / `tasks` (hierarki dalam)
- [ ] `comments`
- [ ] `attachments`
- [ ] `activity_log`
- [ ] `notifications`
- [x] `module_registry` — di **`core_pm`** (Fase 2 slice F2-1, migration `0007`)
- [x] `organization_modules` — di **`core_pm`** (Fase 2 slice F2-1, migration `0007`)
- [x] `audit_log` — append-only, RLS org/project; migration **`0015`** (Fase 6 **F6-1**)
- [x] `user_notifications` — per user, RLS; migration **`0016`** (Fase 6 **F6-2**)

Catatan:
- `core_pm` harus bisa berdiri sendiri tanpa tabel PLM.
- Akses data dibatasi minimal oleh `organization_id` dan/atau `project_id`.

### 10.2 `plm` (opsional)

- [x] `berkas_permohonan` — **`project_id` wajib** (FK `core_pm.projects`); migration **`0009`** (Fase 3 F3-1)
- [x] `pemilik_tanah` — per **`organization_id`**; seed demo **F3-1**
- [ ] `kontak`
- [x] `berkas_pemilik` — junction M:N; **F3-1**
- [ ] `kontak_pemilik`
- [ ] `kontak_berkas`
- [ ] `penerimaan_kunjungan`
- [ ] `penerimaan_berkas`
- [x] `permohonan_informasi_spasial` (metadata proses + `hasil_geojson`/`hasil_geom`) — migration **`0013`** (Fase 5 F5-1)
- [x] `pengukuran_lapangan` — **`0013`**
- [x] `pengukuran_surveyor` — **`0013`**
- [x] `alat_ukur` — **`0013`**
- [x] `pengukuran_alat` — **`0013`**
- [x] `pengukuran_dokumen` — **`0013`**
- [x] `legalisasi_gu` (1:N per berkas untuk daftar ulang) — **`0013`** (`bidang_hasil_ukur_id` opsional)
- [x] `legalisasi_gu_file` (file wajib tahap 1,2,5 — aturan di app) — **`0013`**
- [x] `legalisasi_gu_history` (event log) — migration **`0014`** (F5-4)
- [x] View pelaporan **`v_berkas_permohonan_summary_by_status`**, **`v_legalisasi_gu_summary_by_tahap`**, **`v_pengukuran_lapangan_summary_by_status`** — migration **`0017`** (F6-3)

Catatan:
- `legalisasi_gu` daftar ulang harus tetap menaut ke proses info spasial yang relevan.
- Nomor domain (`nomor_gu`, `nib_baru`, `nomor_pbt`) unik per tahun + kantor pertanahan.

### 10.3 `spatial` (opsional)

- [ ] `bidang_eksisting_bpn` (hasil extract data referensi BPN, queryable)
- [x] `bidang_hasil_ukur` (1:1 ke `plm.berkas_permohonan`) — migration **`0010`** (Fase 4 F4-1)
- [x] indeks spasial GiST pada kolom **`geom`** (`bidang_hasil_ukur`) — **F4-1**
- [ ] fungsi/constraint validasi geometri (tambahan: overlap **di server** / trigger notifikasi, dll.):
  - tipe `Polygon/MultiPolygon`
  - SRID `4326`
  - valid geometry wajib
  - luas `> 0`
  - overlap boleh + trigger warning/notifikasi

Catatan:
- **F4-3 (app):** peringatan tumpang tindih **di browser** (pasangan hasil–hasil + demo–hasil) memakai `@turf/boolean-intersects` — bukan pengganti trigger DB.
- Geometri invalid ditolak (tanpa auto-fix).
- Mapping draft -> terbit mengikuti keputusan opsi 1: `nib_baru` di `plm.legalisasi_gu`.

### 10.4 `finance` (opsional)

- [x] `invoice` (termasuk `berkas_id` opsional → `plm.berkas_permohonan`) — migration **`0018`**
- [x] `invoice_item` — **`0018`** (bukan tabel `invoice_berkas` terpisah; tautan berkas di header invoice)
- [x] `pembayaran` — **`0018`** (peran kwitansi ringkas: `amount`, `paid_at`, `method`, `reference`)

Catatan:
- MVP: invoice **dengan atau tanpa** `berkas_id`; indeks unik parsial menjamin **satu invoice aktif per berkas** bila `berkas_id` diisi.
- Rencana lanjutan (bila dibutuhkan): FK nullable ke `penerimaan_kunjungan` selain/alih-alih tautan langsung ke berkas.

### 10.5 Urutan migrasi yang disarankan

1. Buat `core_pm` terlebih dahulu (fondasi tenant, user, project, workflow).
2. Buat `plm` (bergantung ke `core_pm.projects`).
3. Buat `finance` (bergantung ke `plm` untuk konteks berkas/penerimaan).
4. Buat `spatial` terakhir (bergantung ke `plm.berkas_permohonan`).
5. Tambah indeks, constraint lanjutan, trigger notifikasi warning overlap.

### 10.6 Definition of Done (DoD) fase migrasi

- [ ] Semua tabel inti tiap modul sudah terbentuk.
- [ ] FK lintas modul sesuai kontrak dan tidak melingkar berlebihan.
- [ ] Unique constraint domain kritikal aktif.
- [ ] Validasi geometri aktif sesuai keputusan §8.
- [ ] Seed `module_registry` + default aktivasi modul per organization tersedia.
- [ ] Minimal 1 skenario uji: organization non-PLM (core-only) berjalan normal.
- [ ] Minimal 1 skenario uji: organization PLM + spatial + finance berjalan end-to-end.

---

*Terakhir diperbarui: §10 ditambahkan — mapping tabel per schema modul + urutan migrasi + DoD implementasi.*

## 11. Catatan UI/UX v2 (navigasi & view)

Bagian ini merangkum preferensi UI terbaru agar selaras dengan arsitektur modular dan pembatasan akses per `project`.

### 11.1 Navigasi kiri (hierarki kerja)

- Sidebar utama menampilkan **Project** sebagai node induk.
- Setiap project bisa **dropdown/expand** untuk menampilkan **Task** di bawahnya.
- Pemilihan node di sidebar menjadi **konteks aktif**:
  - pilih `Project` -> semua data pada area view hanya dari project tersebut.
  - pilih `Task` -> view fokus ke task itu (dan turunannya, jika ada hierarki).

### 11.2 Baris view di atas (mode tampilan)

Di bagian atas konten utama tersedia tab/segmented control:

- `Dashboard`
- `Tabel`
- `Map`
- `Kanban`
- `Kalender`
- `Gantt`

Aturan:

- Konten view selalu mengikuti **konteks aktif** dari navigasi kiri.
- Saat project dipilih, semua view menampilkan data milik project itu saja.
- Saat task dipilih, view menampilkan detail/filter task itu (sesuai kemampuan view).

### 11.3 Aturan filter dan sinkronisasi konteks

- State filter utama = `active_scope` (`organization` | `project` | `task`).
- Perubahan scope di sidebar harus memicu refresh seluruh view tanpa mengubah tab view aktif.
- **Implementasi URL (increment 3 + 4):** query string berisi:
  - `org` = UUID organisasi (`core_pm.organizations.id`) — increment 4; diselaraskan saat ganti project / organisasi.
  - `project` = UUID project (`core_pm.projects.id`),
  - `task` = UUID issue/task (opsional; jika ada, scope = task),
  - `view` = `dashboard` | `tabel` | `berkas` (modul **plm**) | `map` | `kanban` | `kalender` | `gantt`.
  - `berkas` = UUID **`plm.berkas_permohonan`** (opsional; detail di tab **Berkas** F3-4; pada **`view=map`** memakai sorotan bidang hasil ukur — F4-3).
- Contoh bookmark: `/?org=<uuid>&project=<uuid>&view=berkas&berkas=<uuid>` atau `/?org=<uuid>&project=<uuid>&view=map&berkas=<uuid>` atau `/?org=<uuid>&project=<uuid>&view=kanban` atau `/?project=<uuid>&task=<uuid>&view=dashboard`.
- Jadwal issue: `core_pm.issues.starts_at`, `due_at` (timestamptz, nullable) — dipakai **Kalender** & **Gantt** (increment 5).

### 11.4 Perilaku per view (saat scope = project)

- **Dashboard:** KPI dan ringkasan workflow hanya untuk project aktif.
- **Tabel:** daftar berkas/task/dokumen yang terfilter project aktif.
- **Berkas:** daftar + detail berkas PLM (`plm.berkas_permohonan`); detail lewat query **`berkas=`** + stepper status (F3-4).
- **Map:** geometri project (footprint demo + hasil ukur PLM); lapisan & peringatan overlap klien (F4-2/3).
- **Kanban:** board workflow global project aktif.
- **Kalender:** jadwal janji ukur, tenggat, dan milestone project aktif.
- **Gantt:** timeline fase kerja dalam project aktif.

### 11.5 Kesesuaian dengan modul opsional

- Jika modul nonaktif, tab view disembunyikan atau isi disesuaikan:
  - `Berkas` muncul hanya jika modul `plm` aktif untuk organisasi (Fase 2 + 3).
  - `Map` muncul hanya jika modul `spatial` aktif.
  - `Kanban/Kalender/Gantt` dari `core_pm` (modul `core_pm` selalu relevan).

### 11.6 Kriteria UX yang perlu dijaga

- Perpindahan `Project -> Task` harus cepat dan tidak “reset” tab view secara paksa.
- Breadcrumb tampil jelas: `Organization / Project / Task (opsional)`.
- Indikator filter aktif harus selalu terlihat agar user tidak salah membaca data lintas project.

---

*Terakhir diperbarui: §11 — view **Berkas** (modul plm) + penyesuaian §11.5 tab modul.*

## 12. Roadmap implementasi bertahap (langkah kecil)

Tujuan: realisasi aplikasi secara iteratif, selalu menghasilkan increment yang bisa dipakai.

### 12.1 Fase dan langkah

1. **Fase 0 — Fondasi**
   - Kunci stack final.
   - Setup repo, environment, auth internal, dan migration framework.

2. **Fase 1 — Core PM**
   - Bangun `core_pm` minimal.
   - Implement akses `organization` + `project`.
   - Implement UI dasar (sidebar project->task + top views).

3. **Fase 2 — Kerangka modul**
   - Implement `module_registry` + `organization_modules`.
   - UI dan API membaca status modul aktif.

4. **Fase 3 — PLM inti**
   - Bangun berkas/pemilik/kontak/penerimaan/invoice-pembayaran.
   - Implement detail berkas dengan stepper proses.

5. **Fase 4 — Spasial dasar**
   - Implement informasi spasial + validasi geometri final.
   - Implement map view (Leaflet) terfilter scope aktif.

6. **Fase 5 — Pengukuran & legalisasi**
   - Implement `pengukuran_*` + wizard legalisasi GU tahap 1-6.
   - Implement daftar ulang legalisasi (1:N) sesuai keputusan.
   - *Progress terinci:* **§20** (migration **`0013`**–**`0014`**; F5-2–F5-4 UI & Storage).

7. **Fase 6 — Hardening**
   - Audit log, notifikasi warning, report/materialized view.
   - Test end-to-end skenario core-only dan PLM full-flow.
   - *Progress terinci & pemecahan slice:* **§21**.

8. **Fase 7 — Go-live bertahap**
   - Pilot organization terbatas.
   - Monitoring dan rollout bertahap.
   - *Progress terinci & pemecahan slice:* **§22**.

### 12.2 Pola eksekusi

- Setiap fase dipecah menjadi task kecil yang selesai dalam hitungan hari.
- Setiap fase wajib menghasilkan demo/fitur yang benar-benar berjalan.
- Hindari paralel modul besar sebelum fondasi stabil.

## 13. Fase 0 — parameter keputusan awal (Supabase, GitHub, Vercel)

Bagian ini daftar parameter yang perlu diputuskan sebelum coding utama.

### 13.1 Arsitektur platform

- **Database & backend:** Supabase (PostgreSQL + Auth + Storage + RLS + Edge Functions opsional).
- **Frontend hosting:** Vercel.
- **Version control & CI:** GitHub.

### 13.2 Parameter Supabase yang perlu dipilih

- **Project separation:** 1 project per env (`dev`, `staging`, `prod`) atau minimal `dev` + `prod`.
- **Region:** pilih region terdekat user operasional.
- **Database version & extensions:** pastikan PostGIS aktif dari awal.
- **Schema strategy:** gunakan schema modular (`core_pm`, `plm`, `spatial`, `finance`).
- **Auth mode:** internal login (sesuai keputusan), plus role aplikasi (`admin`, `surveyor`, `drafter`, dll).
- **RLS policy baseline:** scope data minimal by `organization_id` + `project_id`.
- **Storage buckets:** pisah bucket dokumen (`legalisasi`, `pengukuran`, `lampiran_umum`) dan atur policy akses.
- **Secrets management:** service role key hanya di server, jangan di frontend.
- **Backup & PITR:** aktifkan backup harian/PITR sesuai paket.

### 13.3 Parameter GitHub yang perlu dipilih

- **Repo strategy:** mono-repo (disarankan) atau multi-repo.
- **Branching model:** `main` + `develop` (opsional) + feature branches.
- **Protected branches:** wajib PR review, status checks wajib lulus.
- **CI pipeline minimum:**
  - lint + typecheck
  - test
  - migration check (dry-run)
- **Commit convention:** format pesan commit (conventional commit opsional).
- **Issue/Project template:** bug, feature, migration task template.

### 13.4 Parameter Vercel yang perlu dipilih

- **Project split:** frontend app tunggal atau terpisah admin/public.
- **Environment mapping:** Vercel `Preview` -> Supabase `staging/dev`, `Production` -> Supabase `prod`.
- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, server secrets.
- **Preview deployments:** aktif untuk setiap PR (wajib untuk QA cepat).
- **Domain strategy:** subdomain internal (mis. `app.domain`) + staging domain.

### 13.5 Parameter keamanan & operasional (wajib dibahas)

- **Akses internal:** apakah perlu IP allowlist / VPN untuk admin panel.
- **Audit trail:** event apa saja yang wajib dicatat (login, perubahan status tahap, upload file, geometri ditolak).
- **Retention file:** masa simpan dokumen legalisasi, hasil ukur, dan file signed.
- **Observability:** error tracking + metric dasar (request latency, failed upload, failed validation).
- **SLA internal:** target uptime dan waktu recovery jika incident.

### 13.6 Keputusan awal yang direkomendasikan (baseline)

- Supabase: **3 env** (`dev`, `staging`, `prod`), PostGIS aktif, schema modular.
- GitHub: **mono-repo + PR mandatory + CI minimum**.
- Vercel: **preview per PR + production branch main**.
- Keamanan: **RLS by organization/project sejak fase 1** (jangan ditunda).

### 13.7 Keputusan final Fase 0 (siap eksekusi)

- [x] Platform utama: **Supabase + GitHub + Vercel**.
- [x] Environment: **`dev`, `staging`, `prod`**.
- [x] Database: PostgreSQL Supabase + **PostGIS aktif** dari awal.
- [x] Schema modular: `core_pm`, `plm`, `spatial`, `finance`.
- [x] Auth: **internal saja** (profil user/role disimpan internal).
- [x] Policy akses: RLS berbasis `organization_id` + `project_id`.
- [x] Repo: **mono-repo**.
- [x] Git workflow: PR wajib + branch protection + CI minimum (lint/typecheck/test/migration-check).
- [x] Deploy: Vercel preview per PR + production dari branch utama.
- [x] Storage: bucket terpisah per domain dokumen + policy akses per role.
- [x] Backup: backup/PITR aktif sesuai paket Supabase.

### 13.8 Catatan keputusan yang boleh ditunda

- **UI library** tidak wajib diputuskan di Fase 0; jadwal tegas dan kriteria ada di **§13.9**.

### 13.9 Pemilihan UI library — kapannya dan kriteria

**Kapannya keputusan diambil**

- **Batas:** stack UI library (kit / primitives / pola komponen) **wajib sudah dipilih sebelum koding Increment 6** (Kanban drag-and-drop + persistensi).
- **Momen kerja:** **sesi perencanaan/teknis tepat setelah Increment 5 selesai** (Kalender & Gantt): dokumentasikan pilihan di commit atau cuplikan ADR singkat di repo (`docs/` opsional), lalu implementasi Increment 6 memakai stack itu.
- **Alasan jadwal ini:** Increment 1–5 bisa jalan dengan **Tailwind + React** untuk prototyping; dari Increment 6 ke depan (DnD, state kartu, mungkin form edit) manfaat **primitif aksesibel + pola komponen** jelas; menunda lagi ke Increment 8 (Map) berisiko refactor Kanban/Auth.

**Status implementasi saat ini**

- Hingga **Increment 5**: **tanpa** UI kit besar (MUI/Chakra/dsb.); **Tailwind CSS** + markup React.
- **Increment 6 (keputusan):** drag Kanban memakai **`@dnd-kit/core`** + **Tailwind**; **tanpa** shadcn/Radix penuh — cukup untuk DnD + aksesibilitas dasar (handle seret, `aria-label`). Kit primitif tambahan boleh mengikuti kebutuhan **Increment 7+** tanpa mengganti `@dnd-kit` untuk board.

**Kriteria pemilihan (checklist singkat)**

- Cocok untuk **aplikasi internal data-padat** (tabel, filter, banyak baris).
- **Aksesibilitas** dan keyboard untuk kontrol interaktif (nanti DnD, dialog, menu).
- **Integrasi Leaflet** (Increment 8) tanpa bentrok styling/event — cek contoh komunitas untuk stack kandidat.
- **Next.js App Router** + TypeScript + Tailwind (boleh tetap Tailwind sebagai lapisan gaya di atas primitif).
- Ukuran bundle dan kurva belajar tim.

**Arah kandidat (bukan keputusan final)**

- Kombinasi umum: **primitives headless** (mis. Radix UI) + **Tailwind** + library **DnD** khusus (mis. `@dnd-kit`) untuk board; atau **shadcn/ui** (pola di atas Radix) jika tim setuju pola copy-paste komponen.
- Alternatif: **kit lengkap** (MUI, Chakra, dsb.) — pertimbangkan konsistensi visual dan beban bundle untuk peta + tabel besar.

---

*Terakhir diperbarui: §13 — §13.9 + keputusan stack DnD Increment 6 (`@dnd-kit/core`).*

## 14. Progress eksekusi Fase 0 (realisasi awal)

Progress aktual di workspace:

- [x] Inisialisasi repository Git lokal.
- [x] Menambahkan `.gitignore` baseline.
- [x] Menambahkan `README.md` sebagai entry point proyek.
- [x] Menambahkan template `.env.example`.
- [x] Menambahkan checklist eksekusi: `docs/fase-0-eksekusi.md`.
- [x] Menambahkan blueprint environment: `infra/environments.md`.
- [x] Menambahkan baseline migration schema modular: `supabase/migrations/0001_init_schemas.sql`.
- [x] Buat project Supabase (mode free-tier: 1 project `dev`) dan link dari lokal.
- [x] Push migration awal `0001_init_schemas.sql` ke Supabase remote.
- [x] Setup repository remote GitHub + branch protection.
- [x] Hubungkan Vercel + environment variables.

Catatan:
- UI library: **belum dipilih**; jadwal keputusan mengikuti **§13.9** (tepat sebelum **Increment 6**).

---

*Terakhir diperbarui: §14 progres Vercel selesai (project terhubung + env vars terisi).*

## 15. Penyesuaian Fase 0 untuk free tier

Keputusan sementara karena keterbatasan free tier:

- Environment database Supabase dipakai **1 project dulu** (fungsi sebagai `dev`).
- Model 3 environment (`dev/staging/prod`) tetap menjadi target jangka lanjut, tetapi belum dieksekusi sekarang.

### 15.1 Konsekuensi

- Data testing dan validasi fitur berada di database yang sama.
- Preview dan production frontend berpotensi menunjuk DB yang sama.
- Risiko perubahan schema/data lebih tinggi jika dipakai user nyata terlalu cepat.

### 15.2 Mitigasi sementara

- Gunakan prefix data uji yang jelas (misalnya `TEST-` pada nomor berkas dummy).
- Batasi merge ke branch utama (`main`) hanya saat checklist internal lulus.
- Jalankan migration hanya melalui file migration (hindari ubah schema manual langsung di dashboard).
- Catat perubahan data sensitif pada activity log/testing notes.

### 15.3 Trigger kapan wajib pindah ke multi-environment

Segera pindah ke minimal `dev + prod` jika salah satu kondisi ini terjadi:

- Sudah ada user operasional non-tim-dev yang memakai aplikasi.
- Mulai ada data real dalam volume signifikan.
- Mulai aktifkan legalisasi/keuangan untuk proses harian.
- Kebutuhan rollback/QA formal meningkat.

### 15.4 Dampak ke checklist Fase 0

- [x] Supabase 1 project (`dev`) untuk tahap awal free-tier.
- [ ] Setup `staging` dan `prod` ditunda sampai trigger pada §15.3 terpenuhi.

Status fase:

- **Fase 0 dinyatakan selesai** untuk mode free-tier (single Supabase project).
- Upgrade multi-environment tetap mengikuti trigger pada §15.3.

---

*Terakhir diperbarui: §15 ditambahkan — mode free-tier (1 Supabase project dulu) + mitigasi + trigger upgrade environment.*

## 16. Progress eksekusi Fase 1 (Core PM minimal)

### Increment 1 (selesai)

- [x] Scaffold frontend Next.js (TypeScript + ESLint + App Router) pada folder `app/`.
- [x] Tambah dependency `@supabase/supabase-js`.
- [x] Tambah util client Supabase: `app/src/lib/supabase/client.ts`.
- [x] Implement halaman awal dengan pola UI yang disepakati:
  - sidebar `Project -> Task` (dropdown/expand),
  - view tabs atas (`Dashboard`, `Tabel`, `Berkas` jika modul PLM, `Map`, `Kanban`, `Kalender`, `Gantt`),
  - area konten terikat scope aktif project.
- [x] Update metadata app.
- [x] Lint berhasil (`npm run lint`).

### Increment 2 (selesai)

- [x] Migration `supabase/migrations/0002_core_pm_initial.sql`:
  - tabel `organizations`, `projects`, `statuses`, `issues`, `profiles`, `project_members`,
  - RLS sementara untuk dev (`anon` + `authenticated`),
  - seed demo (2 project, status, issues + sub-task),
  - indeks dasar.
- [x] Helper server: `app/src/lib/supabase/server.ts`.
- [x] Halaman utama async: fetch `projects` + `issues` dari schema `core_pm`.
- [x] Komponen `app/src/app/workspace-client.tsx`: navigasi + scope project/task + tab view (data nyata).
- [x] `app/.env.example` untuk `NEXT_PUBLIC_*` saat `npm run dev`.
- [x] `npm run build` lulus.

### Increment 3 (selesai)

- [x] URL sinkron dengan navigasi: `?project=&task=&view=` (lihat §11.3).
- [x] `router.replace` tanpa scroll; kunjungan pertama tanpa `project` diisi default project pertama.
- [x] View **Tabel**: daftar issue dalam scope project (semua task + indent) atau scope task (task + sub-task).
- [x] Placeholder view **Map** (isi penuh di increment 8); **Kanban** dasar di increment 4; **Kalender / Gantt** di increment 5.
- [x] `Suspense` di `page.tsx` untuk `useSearchParams`.
- [x] Pecahan util: `workspace-views.ts`, `workspace-url.ts`.
- [x] Lint lulus.

### Increment 4 (selesai)

- [x] Fetch `core_pm.statuses` + field `status_id` pada issues; tipe UI selaras.
- [x] View **Kanban**: kolom per status project (hanya task level atas / tanpa `parent_id`); kartu bisa dipilih ke scope task.
- [x] Query **`org`**: filter project di sidebar per organisasi; sinkron URL saat ganti organisasi / project.
- [x] **RLS** tetap mode dev (longgar) — perketat pada **increment 7** (auth + policy membership).

### Rencana penutupan Fase 1 (empat increment berikut)

Urutan disepakati untuk menutup **Fase 1 — Core PM minimal** (selain pekerjaan kecil/bugfix):

| Increment | Fokus |
|-----------|--------|
| **5** | Kalender & Gantt |
| **6** | Kanban (interaksi / persistensi) |
| **7** | RLS + auth |
| **8** | Map (peta) |

*Catatan:* **Map** juga bersinggungan dengan **Fase 4 — Spasial dasar** (§12.1); increment 8 di Fase 1 = integrasi view **Map** + Leaflet + data geometri **terfilter scope** yang sudah ada; pengayaan validasi/atribut spasial bisa lanjut di fase spasial.

### Increment 5 (selesai) — Kalender & Gantt

- [x] Migration `0003_issues_schedule.sql`: kolom `starts_at`, `due_at` pada `core_pm.issues` + update seed + issue demo (`PLM-5`, `PLM-6`, `INT-3`).
- [x] **Kalender:** grid bulan (navigasi bulan); scope project = semua issue ber-jadwal; scope task = task + sub-task; klik isi `task=` di URL.
- [x] **Gantt:** timeline harian (scroll horizontal); scope project = task level atas ber-jadwal; scope task = induk + sub-task ber-jadwal; label key/judul + rentang tanggal.
- [x] View **Tabel:** kolom Mulai / Tenggat.
- [x] Util UI: `schedule-utils.ts`, `schedule-views.tsx`.
- [x] Dummy **increment 8**: migration `0004_spatial_demo_footprints.sql` + `docs/dummy-data-increment-6-8.md` (expose schema `spatial` di API).
- [x] `npm run lint` + `npm run build` lulus.

### Increment 6 (selesai) — Kanban (interaksi)

- [x] **Stack interaksi:** `@dnd-kit/core` + Tailwind (lihat **§13.9** — keputusan inc 6).
- [x] **Drag-and-drop** kartu antar kolom status + kolom **Tanpa status**; hanya task level atas; handle seret **⋮⋮** (klik judul tetap buka scope task).
- [x] **Persistensi:** `update` Supabase (sesi **`authenticated`** + schema `core_pm`) pada `status_id`, `sort_order`, `updated_at`; urutan kolom di-reindex; kolom asal ikut di-reindex jika pindah lintas status.
- [x] Optimistik UI + rollback state lokal jika error; **`router.refresh()`** setelah sukses agar server RSC selaras.
- [x] Indikator ring pada kartu saat menyimpan (`saving`).
- [x] Komponen: `app/src/app/kanban-board.tsx`; dependency `app/package.json`: `@dnd-kit/core`.
- [x] `npm run lint` + `npm run build` lulus.

### Increment 7 (selesai) — RLS + auth

- [x] **Supabase Auth:** email + sandi di **`/login`**; **`/auth/callback`** untuk konfirmasi email; session cookie lewat **`@supabase/ssr`** + **`middleware`**.
- [x] **Profil:** trigger **`core_pm.handle_new_user`** pada **`auth.users`** → **`core_pm.profiles`**.
- [x] **RLS:** migration **`0005_core_pm_rls_and_auth.sql`** + **`0006_rls_project_member_helper.sql`** (fungsi **`core_pm.is_project_member(uuid)`** agar policy tidak rekursif pada `project_members`); `authenticated` akses data tenant lewat keanggotaan; **`anon`** tanpa akses data.
- [x] **Bootstrap demo:** RPC **`core_pm.join_demo_org_projects()`** (anggota semua project seed **KJSB Demo** jika user belum punya keanggotaan); dipanggil setelah login / callback; tombol cadangan di UI jika daftar project kosong.
- [x] **Keluar:** server action **`signOut`**; header workspace menampilkan email.
- [x] Dokumentasi: **`docs/supabase-auth-increment-7.md`**, env **`NEXT_PUBLIC_SITE_URL`** opsional di **`app/.env.example`**.
- [x] `npm run lint` + `npm run build` lulus.

### Increment 8 (selesai) — Map

- [x] **Leaflet** di view **Map** (`leaflet` + OSM tiles); komponen klien `workspace-map.tsx` dimuat lewat `next/dynamic` (`ssr: false`) + CSS Leaflet.
- [x] Data **`spatial.project_demo_footprints`** di-fetch server (`page.tsx`) untuk **project id** yang user punya akses (`.in("project_id", …)`); di klien **filter** ke project aktif; scope **task** = banner + peta tetap per project (§11).
- [x] Pesan jika belum ada footprint / belum pilih project; error fetch mengenali schema **`spatial`** (expose API).
- [x] Hanya geometri project ter-scope (bukan seluruh dunia).
- [x] `npm run lint` + `npm run build` lulus.

### 16.1 Yang perlu Anda lakukan setelah increment 7

- [ ] `git pull` → `npx supabase db push` (migration sampai **`0017`** bila Fase 5–6 terkait ikut) → `cd app` → `npm install` → `npm run dev`.
  - **Penting:** jalankan `supabase link` / `db push` / `migration list` dari **akar repo** (folder yang berisi `supabase/migrations/`), **bukan** dari `app/`. Dari `app/`, CLI sering gagal dengan *Remote migration versions not found in local migrations directory* meskipun file migration ada.
- [ ] Supabase **Auth:** redirect URL **`/auth/callback`**; untuk dev pertimbangkan matikan **Confirm email** atau gunakan tautan verifikasi.
- [ ] Buka **`/login`** → daftar/masuk → workspace harus memuat project demo (atau tombol **Gabung ke project demo**).
- [ ] Vercel: set **`NEXT_PUBLIC_SITE_URL`** production URL jika konfirmasi email dipakai.
- [x] Lanjut **increment 8** (Map / Leaflet) — selesai.

### 16.2 Penutupan Fase 1

- [x] Increment **1–8** selesai (§16.1 tetap checklist operasional opsional untuk tim).
- [x] Lanjutan kerja fitur **Core PM** kecil / bugfix tetap boleh paralel; **kerangka modul** masuk **Fase 2** (**§17**).

---

## 17. Progress eksekusi Fase 2 — Kerangka modul

Tujuan selaras **§9** dan **§12.1 langkah 3**: registry modul + aktivasi per organisasi; lalu aplikasi membaca status modul untuk menyembunyikan/menampilkan area fitur (§9.5, §11.5).

### Pemecahan slice

| Slice | Fokus | Status |
|--------|--------|--------|
| **F2-1** | Migration: `module_registry`, `organization_modules`, seed demo, RLS baca (`authenticated`) | Selesai |
| **F2-2** | App: fetch modul aktif per organisasi scope workspace, props ke klien (tanpa mengubah tab dulu, atau sekalian tab) | Selesai |
| **F2-3** | UI: tab/view mengikuti flag modul (mis. **Map** hanya jika `spatial` aktif untuk org itu) | Selesai |
| **F2-4** | Admin atau RPC `security definer`: mengaktifkan/menonaktifkan modul (selain `core_pm`), audit sederhana | Selesai |

### F2-1 (selesai) — DB registry + aktivasi

- [x] Migration **`0007_core_pm_module_registry.sql`**: tabel **`core_pm.module_registry`** (`module_code` PK, `display_name`, `is_core`, `sort_order`, …) dan **`core_pm.organization_modules`** (`organization_id`, `module_code`, `is_enabled`, `enabled_at`).
- [x] Seed katalog: `core_pm`, `plm`, `spatial`, `finance` (kode modul huruf kecil + constraint nama).
- [x] Seed organisasi demo **KJSB** (`11111111-…`): `core_pm` + `plm` + `spatial` aktif; `finance` nonaktif (boleh diubah manual / slice F2-4).
- [x] Aturan data: `core_pm` tidak boleh `is_enabled = false`; baris `core_pm` tidak boleh di-**delete** (trigger `organization_modules_prevent_drop_core`).
- [x] **RLS:** `module_registry` **select** untuk semua `authenticated`; `organization_modules` **select** hanya jika user anggota minimal satu project di organisasi itu (subquery ke `projects` + **`core_pm.is_project_member`**). Tanpa policy **insert/update** untuk `authenticated` pada slice ini (kelola lewat SQL admin atau slice F2-4).
- [x] **Grant:** `select` ke `authenticated` saja (bukan `anon`), konsisten increment 7.

*Verifikasi remote:* setelah `db push` dari akar repo, migration **`0007`** harus tercatat di riwayat migrasi project Supabase.

### F2-2 (selesai) — Read path aplikasi

- [x] Fetch **`module_registry`** + **`organization_modules`** di `app/src/app/page.tsx` (filter `.in("organization_id", orgIds)`); error gabung ke **`fetchError`**.
- [x] Props ke **`WorkspaceClient`**: `moduleRegistry`, `organizationModules`.

### F2-3 (selesai) — UI mengikuti modul

- [x] Util **`app/src/app/workspace-modules.ts`**: `effectiveEnabledModuleCodes`, `viewRequiredModuleCode` / `isViewAllowedForModules`, `viewsForEnabledModules` (tab **Map** ↔ modul **`spatial`**).
- [x] Tab view memakai **`visibleViews`**; URL `view=map` tanpa `spatial` dinormalisasi ke **Dashboard** (`useEffect` + **`activeView`** memakai aturan modul).
- [x] Ringkasan modul aktif di **Dashboard** (label dari registry).

### F2-4 (selesai) — Mutasi modul

- [x] Migration **`0008_organization_modules_set_rpc.sql`**: fungsi **`core_pm.is_organization_member(uuid)`** (`SECURITY DEFINER`, cek `project_members` + `projects` di org) dan RPC **`core_pm.set_organization_module_enabled(organization_id, module_code, enabled)`** — validasi modul di **`module_registry`**, **larang menonaktifkan `core_pm`**, upsert / update baris **`organization_modules`**; `grant execute` ke **`authenticated`**.
- [x] Mutasi tabel tetap **tanpa** policy INSERT/UPDATE untuk role anon/client pada **`organization_modules`** (hanya lewat RPC).
- [x] Server action **`app/src/app/workspace-modules-actions.ts`** (`setOrganizationModuleAction`) memanggil RPC + **`revalidatePath("/", "layout")`**.
- [x] UI sidebar **`OrganizationModuleToggles`** (`organization-module-toggles.tsx`): toggle modul **non-`is_core`** untuk organisasi aktif (user terautentikasi).
- [ ] *Pengerjaan lanjutan opsional:* batasi RPC ke peran **admin org** (tabel membership peran) jika kebutuhan audit/otorisasi ketat.

---

## 18. Progress eksekusi Fase 3 — PLM inti

Tujuan selaras **§12.1 langkah 4** dan **§10.2**: entitas domain PLM di schema **`plm`**, akses terikat **project** / **organisasi**, lalu UI (slice berikutnya).

### Pemecahan slice (disepakati)

| Slice | Fokus | Status |
|--------|--------|--------|
| **F3-1** | Migration: `berkas_permohonan`, `pemilik_tanah`, `berkas_pemilik` + RLS + seed demo | Selesai |
| **F3-2** | App: fetch berkas (scoped project) + error `plm` di expose API | Selesai |
| **F3-3** | UI daftar berkas / tautan dari workspace | Selesai |
| **F3-4** | Detail berkas + stepper ringkas | Selesai |

### F3-1 (selesai) — Schema + tabel minimal + RLS + seed

- [x] Migration **`0009_plm_berkas_pemilik_core.sql`**: tabel **`plm.berkas_permohonan`** (`project_id`, `nomor_berkas`, `tanggal_berkas`, `status`, `catatan`, soft delete), **`plm.pemilik_tanah`** (`organization_id`, `nama_lengkap`, kontak ringkas), **`plm.berkas_pemilik`** (junction + `urutan`).
- [x] **RLS** `authenticated`: berkas & junction memakai **`core_pm.is_project_member(berkas.project_id)`**; pemilik memakai **anggota minimal satu project** di organisasi yang sama (`projects.organization_id`).
- [x] **Grant:** `usage` schema **`plm`** + DML tabel ke **`authenticated`** saja (bukan **`anon`**).
- [x] **Seed** demo: dua pemilik + dua berkas di project **PLM Cirebon 2026** + tautan junction.
- [x] **Supabase API:** schema **`plm`** harus ada di **Exposed schemas** (lihat **`docs/supabase-expose-schemas.md`**) agar client bisa query setelah F3-2.

### F3-2 (selesai) — Read path aplikasi

- [x] **`page.tsx`:** fetch **`plm.berkas_permohonan`** hanya jika modul **`plm`** aktif untuk salah satu organisasi user (`.in("project_id", projectIds)`); embed **`berkas_pemilik(urutan, pemilik_tanah(id, nama_lengkap))`**; error gabung ke **`fetchError`**.
- [x] **`WorkspaceClient`:** prop **`berkasPermohonan`**, ringkasan tabel **Dashboard** untuk project aktif bila modul **`plm`** aktif di org; helper **`pemilikLabelsForBerkas`**; deteksi error schema **`plm`** di pesan gagal muat.

### F3-3 (selesai) — UI daftar berkas di workspace

- [x] View tab **`Berkas`** (`view=berkas`) di **`workspace-views.ts`** / **`workspace-url.ts`**; tampil hanya jika modul **`plm`** aktif (**`viewRequiredModuleCode`** di **`workspace-modules.ts`**).
- [x] Normalisasi URL: `view=berkas` tanpa modul **`plm`** → **Dashboard** (sama pola **Map** / **spatial**).
- [x] Konten tab: daftar berkas + kolom **catatan**; banner scope **task** (daftar tetap per project).
- [x] **`BerkasListPanel`** + **`plm-berkas-types.ts`** — ringkasan di **Dashboard** tetap ada; tautan kejelasan ke tab **Berkas**.

### F3-4 (selesai) — Detail berkas + stepper status

- [x] Query **`berkas=<uuid>`** (hanya bermakna bersama **`view=berkas`**); normalisasi URL di **`workspace-client`** (hapus jika view lain / id tidak di project).
- [x] **`BerkasDetailPanel`**: ringkasan nomor/tanggal/status, daftar pemilik, catatan; **stepper** empat langkah (`draft` → `diajukan` → `diproses` → `selesai`) dengan klik untuk **`update`** (server action **`plm-berkas-actions.ts`** + **`revalidatePath`**).
- [x] Konstanta alur di **`plm-berkas-status.ts`**; daftar pemilik multi-baris di **`plm-berkas-types`** (`pemilikLinesForBerkas`).
- [x] **`BerkasListPanel`**: baris dapat difokus dan diklik / Enter untuk buka detail; tab view lain menghapus **`berkas`** dari query.

---

*Terakhir diperbarui: §18 — F3-4 selesai (detail + stepper + `berkas=` URL).*

---

## 19. Progress eksekusi Fase 4 — Spasial dasar

Tujuan selaras **§12.1 langkah 5** dan **§10.3**: geometri riil (PostGIS), validasi dasar, kaitan ke **berkas PLM**; peta Leaflet sudah ada (Fase 1 inc 8) — Fase 4 menguatkan **data** dan **aturan**.

### Pemecahan slice (disepakati)

| Slice | Fokus | Status |
|--------|--------|--------|
| **F4-1** | PostGIS + `bidang_hasil_ukur` + GiST + constraint + seed + RLS | Selesai |
| **F4-2** | App: fetch GeoJSON / geometri untuk Map (gabung dengan atau mengganti footprint demo) | Selesai |
| **F4-3** | UI: lapisan berkas / validasi UX; opsi overlap / peringatan (§10.3) | Selesai |

### F4-1 (selesai) — Migration `0010`

- [x] Migration **`0010_spatial_bidang_hasil_ukur.sql`**: **`create extension if not exists postgis`**.
- [x] Tabel **`spatial.bidang_hasil_ukur`**: **`berkas_id`** unik → **`plm.berkas_permohonan`**, **`geom geometry(MultiPolygon, 4326)`**, **`label`**, **`ST_IsValid`**, **`ST_Area(geom::geography) > 0`**.
- [x] Indeks **GiST** pada **`geom`**; indeks pada **`berkas_id`** (unik sudah mendukung lookup).
- [x] **Seed** satu poligon (koordinat selaras demo footprint) untuk berkas demo **`BKS-2026-0042`** (`66666666-6666-4666-8666-666666660001`).
- [x] **RLS** `authenticated`: **select/insert/update/delete** jika **`core_pm.is_project_member(b.project_id)`** pada berkas terkait.
- [x] **Grant:** hanya **`authenticated`** (bukan **`anon`**), konsisten data tenant.

*Catatan deploy:* jika **`create extension postgis`** ditolak di lingkungan Anda, aktifkan **PostGIS** lewat **Dashboard → Database → Extensions**, lalu jalankan ulang / perbaiki migration sesuai kebijakan host.

### F4-2 (selesai) — Migration `0011` + Map

- [x] View **`spatial.v_bidang_hasil_ukur_map`**: **`id`**, **`project_id`**, **`label`**, **`geojson`** (`jsonb` dari **`ST_AsGeoJSON(geom)`**), join **`plm.berkas_permohonan`** ( **`deleted_at is null`** ).
- [x] **Grant** `select` untuk **`authenticated`** saja pada view; **`anon`** di-**revoke**.
- [x] **`page.tsx`**: query view bila modul **`plm`** aktif di salah satu org project; prop **`bidangHasilUkurMap`** ke **`WorkspaceClient`**.
- [x] **`WorkspaceClient`**: gabung footprint demo + bidang hasil ukur per project; legenda warna; pesan kosong memuat **`0010`/`0011`**.
- [x] **`workspace-map`**: **`layerKind`** (`demo` vs **`bidang_hasil_ukur`**) untuk gaya dan popup.

### F4-3 (selesai) — Migration `0012` + UX peta / berkas

- [x] View **`spatial.v_bidang_hasil_ukur_map`** di-**recreate** dengan kolom **`berkas_id`** (tautan sorotan & daftar).
- [x] **Map:** checkbox lapisan (footprint demo / bidang hasil ukur); banner **tumpang tindih** klien (`map-spatial-overlap.ts` + **`@turf/boolean-intersects`**); sorotan poligon lewat **`berkas=`** pada **`view=map`**; legenda sorotan.
- [x] **URL:** parameter **`berkas`** dipertahankan untuk **Map** dan **Berkas**; validasi anggota project.
- [x] **Berkas:** **`BerkasDetailPanel`** — tombol **Lihat di peta**; **`BerkasListPanel`** — kolom **Peta** bila modul **plm** + **spatial** aktif.

---

*Terakhir diperbarui: §19 — Fase 4 F4-1–F4-3 (migration `0010`–`0012`).*

---

## 20. Progress eksekusi Fase 5 — Pengukuran & legalisasi

Tujuan selaras **§12.1 langkah 6** dan **§3.9–§3.11**: data permohonan informasi spasial, rantai pengukuran, legalisasi GU (multi-baris per berkas), lalu UI wizard (slice berikutnya).

### Pemecahan slice (disepakati)

| Slice | Fokus | Status |
|--------|--------|--------|
| **F5-1** | Migration: `permohonan_informasi_spasial`, `alat_ukur`, `pengukuran_*`, `legalisasi_gu` + `legalisasi_gu_file`, RLS, seed demo | Selesai |
| **F5-2** | App: wizard tahap legalisasi (1–6), validasi file wajib, gating tahap | Selesai |
| **F5-3** | App: CRUD pengukuran + surveyor/alat/dokumen; integrasi tab Berkas | Selesai |
| **F5-4** | `legalisasi_gu_history`, unik domain `nomor_gu`/`nib_baru` per tahun+Kantah, bucket Storage + UI unggah/unduh | Selesai |

### F5-1 (selesai) — Migration `0013`

- [x] **`plm.permohonan_informasi_spasial`**: satu baris per **`berkas_id`** (unik); **`hasil_geom`** + GiST opsional; **`status_hasil`** terbatasi check.
- [x] **`plm.alat_ukur`**: master per **`organization_id`**; unik **`(organization_id, kode_aset)`**.
- [x] **`plm.pengukuran_lapangan`** + **`pengukuran_surveyor`** + **`pengukuran_alat`** + **`pengukuran_dokumen`**.
- [x] **`plm.legalisasi_gu`**: **1:N** **`berkas_id`**; FK opsional ke **`permohonan`**, **`pengukuran`**, **`spatial.bidang_hasil_ukur`**; kolom tahap §3.11.
- [x] **`plm.legalisasi_gu_file`**: **`tipe_file`** sesuai §3.11.
- [x] **RLS** `authenticated` via **`core_pm.is_project_member`** (berkas / proyek); alat via organisasi proyek; **`pengukuran_alat`** memastikan organisasi alat = organisasi project berkas.
- [x] **Seed** konsisten berkas demo **BKS-2026-0042** + alat GNSS org KJSB + satu pengukuran + satu legalisasi **draft**.

*Catatan:* gating bisnis (mis. pengukuran hanya jika **`layak_lanjut`**, jumlah GNSS 1–2) belum di-enforce di DB — F5-3+ di aplikasi atau constraint lanjutan.

### F5-2 (selesai) — Wizard legalisasi GU

- [x] Modul **`plm-legalisasi-wizard.ts`**: urutan **`status_tahap`**, label tahap, **`canAdvanceLegalisasi`** (gating §3.11 + file wajib tahap 1, 2, 5).
- [x] **`plm-legalisasi-actions.ts`**: **`patchLegalisasiGuAction`**, **`advanceLegalisasiGuAction`**, **`createLegalisasiGuDraftAction`**, **`addLegalisasiGuFileAction`** (metadata lampiran; **`storage_key`** unggah nyata di F5-4 atau placeholder **`pending:`**).
- [x] **`legalisasi-gu-wizard.tsx`**: stepper 7 status, form kolom §3.11, multi-proses per berkas, **Simpan** / **Lanjut**, catat lampiran per **`tipe_file`**.
- [x] **`page.tsx`** + **`WorkspaceClient`**: fetch **`legalisasi_gu`** + **`legalisasi_gu_file`**; **`BerkasDetailPanel`** menanamkan wizard.

### F5-3 (selesai) — Panel pengukuran di Berkas

- [x] **`plm-pengukuran-types.ts`**: tipe baris permohonan informasi spasial, pengukuran, surveyor, alat, dokumen.
- [x] **`plm-pengukuran-actions.ts`**: **`patchPengukuranLapanganAction`** (whitelist; gating surveyor untuk **`diukur`** / **`olah_cad`** / **`selesai`**; **`hasil_cad`** wajib untuk **`selesai`**), **`createPengukuranLapanganAction`** (hanya jika permohonan **`layak_lanjut`**), CRUD surveyor/alat (maks. 2 alat) / tambah dokumen (metadata + **`storage_key`** placeholder).
- [x] **`pengukuran-panel.tsx`**: ringkasan permohonan, kegiatan baru, form status/header, surveyor ±, alat dari master org proyek, dokumen **`gu_referensi`** / **`hasil_cad`**.
- [x] **`BerkasDetailPanel`**: **`PengukuranPanel`** di atas wizard legalisasi (alur pengukuran → legalisasi).
- [x] **`page.tsx`**: fetch permohonan, pengukuran, relasi, **`alat_ukur`** ter-scope; **`WorkspaceClient`**: **`organizationId`** untuk filter alat.

### F5-4 (selesai) — Riwayat, unik domain, Storage

- [x] **Migration `0014`**: tabel **`plm.legalisasi_gu_history`** ( **`patch` / `advance` / `file_added` / `draft_created`** + **`payload` jsonb** ) + RLS anggota project; indeks unik parsial **`uq_plm_leg_nomor_gu_kantor_tahun`** dan **`uq_plm_leg_nib_baru_kantor_tahun`** ( **`lower(trim(kantor))`**, tahun dari **`tanggal_gu`** / **`tanggal_nib`** ); bucket **`plm-legalisasi`** & **`plm-pengukuran`** + policy **`storage.objects`** (path **`{legalisasi_gu_id}/…`** / **`{pengukuran_id}/…`** ).
- [x] **`plm-legalisasi-actions.ts`**: tulis riwayat setelah patch / naik tahap / lampiran / draft; pesan ramah untuk bentrok **`23505`**; validasi **`storage_key`** ( **`pending:`** atau prefix ID proses ).
- [x] **`plm-pengukuran-actions.ts`**: validasi **`storage_key`** untuk dokumen.
- [x] **`plm-storage.ts`**: konstanta bucket, sanitasi nama file, helper path unggah.
- [x] **`legalisasi-gu-wizard.tsx`**: panel **Riwayat**, unggah file ke Storage lalu metadata; tautan **Unduh** (signed URL).
- [x] **`pengukuran-panel.tsx`**: unggah dokumen ke **`plm-pengukuran`** + **Unduh**.
- [x] **`page.tsx`** + **`WorkspaceClient`** + **`BerkasDetailPanel`**: fetch & oper **`legalisasiGuHistory`**.

---

*Terakhir diperbarui: §20 — Fase 5 F5-1–F5-4 (migration `0013`–`0014`, wizard + pengukuran + Storage).*

---

## 21. Progress eksekusi Fase 6 — Hardening

Tujuan selaras **§12.1 langkah 7**: sistem lebih terawasi (audit), pengguna mendapat peringatan yang konsisten, ringkasan data untuk operasional (view/MV), dan jaminan regresi lewat tes alur utama.

*Prasyarat:* Fase 5 selesai (**§20**). Jejak domain legalisasi sudah ada di **`plm.legalisasi_gu_history`**; Fase 6 bisa melengkapi dengan **audit lintas-domain** dan **polishing operasional**.

### Pemecahan slice (disepakati)

| Slice | Fokus | Status |
|--------|--------|--------|
| **F6-1** | **Audit trail generik:** `core_pm.audit_log` — `actor_user_id`, `action`, `entity`, `entity_id`, `payload` jsonb, `organization_id` / `project_id`; RLS; penulisan dari server actions (status berkas, modul org, legalisasi patch/advance/draft/file); *lanjutan opsional:* login, pengukuran, aksi lain | Selesai |
| **F6-2** | **Notifikasi in-app:** `user_notifications` + sinkron overlap spasial **server** (selaras Turf/F4-3) + bell/dropdown; *lanjutan:* trigger DB, preferensi user, legalisasi “macet” | Selesai |
| **F6-3** | **Laporan:** view SQL ringkas (berkas / legalisasi / pengukuran per project) + tab **Laporan** + CSV klien; *lanjutan:* MV + refresh terjadwal | Selesai |
| **F6-4** | **QA & CI:** Playwright — smoke **login** + root; **PLM** berkas (opsional, butuh **`E2E_EMAIL`** / **`E2E_PASSWORD`** di CI); **`npm run typecheck`**; workflow **lint + typecheck + E2E** (`chromium`, tanpa unit runner terpisah) | Selesai |

### F6-1 (selesai) — Audit trail generik

- [x] **Migration `0015`**: tabel **`core_pm.audit_log`** (append-only: tanpa grant **update**/**delete** ke **`authenticated`**); RLS **baca** per anggota project (baris berisi **`project_id`**) atau anggota org (baris **`project_id` null**); **insert** jika **`actor_user_id = auth.uid()`** dan anggota org + konsistensi org↔project.
- [x] **`app/src/lib/audit-log.ts`**: **`fetchOrgProjectForBerkasId`**, **`fetchOrgProjectForLegalisasiGuId`**, **`insertAuditLogRow`** (pemendekan JSON **`payload`** ~12k karakter).
- [x] **`plm-berkas-actions.ts`**: audit **`plm.berkas_permohonan.status_update`** (`from` / `to`).
- [x] **`workspace-modules-actions.ts`**: audit **`core_pm.organization_modules.set`**.
- [x] **`plm-legalisasi-actions.ts`**: audit **`plm.legalisasi_gu.patch`** (daftar field), **`advance`**, **`draft_created`**, **`plm.legalisasi_gu_file.insert`** (tanpa log panjang **`storage_key`**; flag **`pending_storage`**).
- [ ] *Lanjutan opsional:* audit login, mutasi pengukuran, aksi PLM lain — pola sama.

### F6-2 (selesai) — Notifikasi & peringatan

- [x] **Migration `0016`**: **`core_pm.user_notifications`** (`kind` **`spatial_overlap`** | **`system`**, `severity`, judul, isi, `payload`, `read_at`); RLS milik **`user_id = auth.uid()`** + insert dengan anggota project/org konsisten.
- [x] **`spatial-overlap-notifications-sync.ts`**: per project (modul **plm** + **spatial** aktif) hitung **`findMapOverlapWarnings`** lalu hapus unread **`spatial_overlap`** lama per project dan sisip satu baris peringatan bila masih ada tumpang tindih.
- [x] **`page.tsx`**: panggil sinkron lalu fetch notifikasi untuk user; prop ke **`WorkspaceClient`**.
- [x] **`notifications-bell.tsx`** + **`user-notifications-actions.ts`**: bell, daftar, **Dibaca** / **Tandai semua dibaca**, tautan ke tab **Map**.
- [ ] *Lanjutan opsional:* notifikasi dari trigger PostGIS overlap, legalisasi idle, preferensi channel.

### F6-3 (selesai) — View laporan + UI

- [x] **Migration `0017`**: view **`plm.v_berkas_permohonan_summary_by_status`**, **`plm.v_legalisasi_gu_summary_by_tahap`**, **`plm.v_pengukuran_lapangan_summary_by_status`** dengan **`(security_invoker = true)`** agar RLS tabel dasar tetap dipakai; grant **select** ke **`authenticated`**.
- [x] **`page.tsx`**: fetch tiga view untuk **`project_id`** di scope sidebar; prop ke **`WorkspaceClient`**.
- [x] **`laporan-panel.tsx`**: tiga tabel ringkas + tombol **Unduh CSV** per bagian.
- [x] Tab **Laporan** (`view=laporan`): **`workspace-views`**, **`workspace-url`**, **`workspace-modules`** (syarat modul **plm**), **`workspace-client`** + normalisasi URL bila modul nonaktif.
- [ ] *Lanjutan opsional:* **materialized view** + `REFRESH` terjadwal / manual, laporan tambahan (invoice, dll.).

### F6-4 (selesai) — E2E & pipeline

- [x] **`@playwright/test`**, **`playwright.config.ts`** (`webServer`: prod di CI dengan env Supabase kosong untuk smoke; dev lokal dengan **`reuseExistingServer`**).
- [x] **`e2e/smoke.spec.ts`**: halaman login + root (redirect / pesan env / scope).
- [x] **`e2e/plm-authenticated.spec.ts`**: alur berkas bila **`E2E_EMAIL`** / **`E2E_PASSWORD`** diset; dilewati jika tidak.
- [x] **`package.json`**: skrip **`typecheck`**, **`test:e2e`**, **`test:e2e:ui`**, **`test:e2e:install`**.
- [x] **`.github/workflows/ci.yml`**: job **lint-typecheck** + **e2e** ( **`playwright install --with-deps chromium`** ); rahasia opsional untuk tes terautentikasi.
- [ ] *Lanjutan opsional:* skenario task board / org switch; **Vitest** (unit) bila ingin job “unit” eksplisit.

### Catatan dependensi

- **F6-1** bisa berjalan paralel parsial dengan **F6-4** (smoke test dulu tanpa audit DB).
- **F6-3** mengandalkan data Fase 3–5 sudah stabil; hindari MV yang mengunci kolom yang masih sering berubah tanpa versi skema.
- **F6-2** overlap server: selaras **§10.3** (constraint/trigger) — koordinasikan dengan keputusan “overlap boleh + warning”.

---

*Terakhir diperbarui: §21 — Fase 6: F6-1–F6-4 (`0015`–`0017` + Playwright/CI).*

---

## 22. Progress eksekusi Fase 7 — Go-live bertahap

Tujuan selaras **§12.1 langkah 8**: satu atau beberapa **organisasi pilot** memakai sistem dengan **satu jalur deploy** (**Vercel Production** + **satu project Supabase** — lihat **`DEPLOY.md`** termasuk bagian *minus*). **Migrasi skema** dan **cadangan** terdokumentasi, serta **monitoring** dan **runbook** operasional agar rollout bisa diperlebar bertahap. Perlu isolasi Preview/DB kedua adalah **opsional** ke depan, bukan syarat dokumen ini.

*Prasyarat:* Fase 6 selesai (**§21**). Parameter platform awal sudah dirangkum di **§13** (Supabase, GitHub, Vercel); Fase 7 mengeksekusi keputusan itu untuk jalur **non-dev**.

### Pemecahan slice (disepakati)

| Slice | Fokus | Status |
|--------|--------|--------|
| **F7-1** | **Lingkungan & deploy:** **`DEPLOY.md`** — **satu** Vercel Production + **satu** Supabase, minus dokumentasi; **`infra/environments.md`**; **`.env.example`**; Root **`app`**; smoke + **`PLAYWRIGHT_BASE_URL`** | Selesai |
| **F7-2** | **Pilot & kontrol akses:** **`docs/PILOT.md`** (daftar org + SQL modul); **`AUTH_SIGNUP_MODE`** / domain; banner **`NEXT_PUBLIC_SHOW_PILOT_BANNER`**; UI login + **`pilot-config`** + banner workspace | Selesai |
| **F7-3** | **Migrasi DB & cadangan:** **`docs/MIGRASI-DAN-CADANGAN.md`** (satu DB, `db push`, backup/PITR, `reload schema`); CI **`scripts/verify-migration-files.mjs`**; dry-run SQL ke Postgres tetap manual / tool terpisah | Selesai |
| **F7-4** | **Monitoring & rollout:** **`docs/MONITORING.md`** (Vercel/Supabase, Sentry opsional + catatan Next 16); **`docs/RUNBOOK-OPERASI.md`**; **`docs/KRITERIA-KELUAR-PILOT.md`**; tautan dari **`DEPLOY.md`** / **`README.md`** | Selesai |

### F7-1 (selesai) — Lingkungan & deploy

- [x] **`DEPLOY.md`** (root): satu jalur Vercel Production + satu Supabase; tabel env; **Auth**; **minus** setup; opsi mematikan Preview; smoke.
- [x] **`infra/environments.md`**: tautan ke **`DEPLOY.md`**.
- [x] **`README.md`**: rujukan deploy + **Root Directory** Vercel **`app`**.
- [x] **`app/.env.example`** + **`/.env.example`**: **`NEXT_PUBLIC_SITE_URL`** + catatan **`SUPABASE_SERVICE_ROLE_KEY`** (server-only).
- [x] **`playwright.config.ts`**: jika **`PLAYWRIGHT_BASE_URL`** diset, E2E memakai URL deployment (tanpa **`webServer`** lokal).
- [ ] *Operator:* checklist akhir **`DEPLOY.md`** (Vercel Production + Supabase + Auth).

### F7-2 (selesai) — Pilot & kontrol akses

- [x] **`docs/PILOT.md`**: template daftar org pilot + contoh SQL **`organization_modules`** + rujukan env.
- [x] **`app/src/lib/pilot-config.ts`**: **`AUTH_SIGNUP_MODE`** (`open` / `closed` / `email_domain`), **`AUTH_SIGNUP_ALLOWED_EMAIL_DOMAIN`**.
- [x] **`auth/actions.ts`** **`signup`**: penolakan server selaras mode/domain.
- [x] **`login/page.tsx`**: sembunyikan form daftar jika **`closed`**; teks bantuan domain.
- [x] **`workspace-client.tsx`**: banner opsional **`NEXT_PUBLIC_SHOW_PILOT_BANNER`** + **`NEXT_PUBLIC_PILOT_BANNER_TEXT`**.
- [x] **`app/.env.example`**, **`/.env.example`**, **`DEPLOY.md`**, **`README.md`**: variabel pilot terdokumentasi.
- [ ] *Operator:* isi tabel pilot di **`docs/PILOT.md`**, set env di Vercel, atur baris **`organization_modules`** sesuai matriks.

### F7-3 (selesai) — Migrasi & cadangan

- [x] **`docs/MIGRASI-DAN-CADANGAN.md`**: prasyarat, **`supabase db push`** vs SQL manual, pasca-migration (**`notify pgrst`**), rollback, satu jalur production.
- [x] **`scripts/verify-migration-files.mjs`** + job CI **`migration-verify`** (nama `NNNN_*.sql`, tanpa duplikat awalan).
- [x] **`docs/supabase-expose-schemas.md`**: rujukan **`reload schema`** setelah view baru.
- [ ] *Operator:* aktifkan/cek **backup & PITR** di dashboard Supabase; jalankan **`db push`** (atau SQL terurut) saat rilis.

### F7-4 (selesai) — Monitoring & rollout

- [x] **`docs/MONITORING.md`**: Vercel Logs/Observability, Supabase logs & backup, smoke Playwright; **Sentry** — langkah wizard + catatan **peer Next 16** (SDK tidak dipasang di repo agar hindari konflik npm).
- [x] **`docs/RUNBOOK-OPERASI.md`**: kontak template, rollback production, runtime error, migration freeze, auth.
- [x] **`docs/KRITERIA-KELUAR-PILOT.md`**: checklist keluar pilot (stabil, feedback, operasi, go/no-go).
- [x] **`DEPLOY.md`**, **`README.md`**, **`docs/PILOT.md`**: rujukan F7-4.
- [ ] *Operator:* isi tabel kontak di runbook; aktifkan Sentry bila versi SDK mendukung Next 16 atau setelah uji `--legacy-peer-deps`.

### Catatan dependensi

- **F7-1** menjadi fondasi untuk smoke **F7-4** di URL production (satu jalur).
- **F7-2** dan **F7-3** bisa berjalan paralel setelah deploy production hidup; keputusan pilot sering mengunci konfig modul sebelum data penuh.
- **F7-3** dengan satu DB: migration langsung ke project yang dipakai — hindari migrasi besar tanpa review/backup; jika nanti ada DB staging terpisah, prosedur “staging dulu” bisa dihidupkan lagi.

---

*Terakhir diperbarui: §10.4 — tabel inti **finance** (invoice / item / pembayaran) lewat migration **`0018`**; §22 — Fase 7: **F7-1**–**F7-4** selesai.*
