# Panduan pengguna: impor geometri & atribut spasial

Ringkasan operasional untuk tim lapangan dan admin. Detail teknis dan status fitur ada di [`spatial-import-roadmap.md`](./spatial-import-roadmap.md).

---

## 1. `feature_key` — kunci penghubung

- Setiap bidang / fitur di **satu unit kerja** punya string **`feature_key`** yang Anda tentukan (atau yang dihasilkan pola impor).
- **Geometri** (tab Map) dan **atribut tabular** (tab Tabel) disambungkan lewat **`issue_id` + `feature_key` yang sama persis** (huruf besar/kecil dan spasi ikut dihitung).
- Anda boleh mengisi **atribut dulu** (CSV) lalu geometri menyusul, atau sebaliknya — tidak ada kunci asing otomatis; data hanya “nyambung” jika kunci cocok.

---

## 2. CRS / SRID sumber (EPSG)

Di dialog simpan geometri (GeoJSON, shapefile hasil konversi, DXF), pilih **EPSG/SRID sumber** yang sesuai dengan koordinat di file:

| Pilihan di aplikasi | Kapan dipakai |
|---------------------|----------------|
| **EPSG:4326** (WGS84 lon/lat) | GeoJSON sudah lon/lat; atau shapefile dengan **`.prj`** yang setelah dibaca parser menghasilkan koordinat derajat (umumnya pilih ini). |
| **EPSG:32748 / 32749** | UTM zona 48S / 49S (meter), jika koordinat file Anda di proyeksi tersebut **tanpa** konversi otomatis ke lon/lat. |
| **EPSG:23833–23836** | Grid TM-3 Indonesia yang tersedia di form. |

Jika SRID salah, geometri bisa tersimpan di lokasi salah atau gagal di basis data. **Ragukan CRS?** Tanyakan surveyor / sumber data, atau uji dengan satu fitur kecil dulu.

---

## 3. Tab Map — GeoJSON

1. Pilih file **`.geojson` / `.json`**.
2. Aplikasi mendeteksi:
   - **Satu fitur** (Polygon / MultiPolygon / Feature tunggal): isi **Feature key** (wajib) dan label opsional.
   - **FeatureCollection** (banyak fitur): isi **Prefix key** (opsional) — default key diisi seperti server (prefix + properti `feature_key` / `id` / `ID` / `Id`, atau nomor urut fitur di file). Tabel **Feature key** dan **Label** per poligon bisa **diedit**; mengubah prefix mengatur ulang tabel dari properti file. Hanya **Polygon / MultiPolygon** yang muncul di tabel (urutan = proses batch).
3. **Batas ukuran teks** ke server sekitar **12 MB** (sama untuk batch GeoJSON dan DXF).

---

## 4. Tab Map — ZIP shapefile

1. Siapkan **ZIP** berisi set shapefile: minimal **`.shp` + `.dbf`**, disarankan **`.shx` + `.prj`**.
2. Hanya **Polygon / MultiPolygon** yang diimpor; titik dan garis diabaikan.
3. Jika ZIP berisi **beberapa layer** `.shp` berpoligon, pilih layer di **dropdown**.
4. **`.prj`**: jika parser mengenali proyeksi, koordinat sering sudah **lon/lat** — pilih **EPSG:4326**. Tanpa `.prj`, pilih SRID yang cocok dengan angka di `.shp`.
5. **Batas ZIP** di browser sekitar **36 MB**; hasil teks GeoJSON batch tetap dibatasi **~12 MB** sebelum dikirim ke server.

---

## 5. Tab Map — DXF

1. Unggah **`.dxf`** (teks), pilih **layer** yang berisi poligon tertutup (LW/PL, INSERT blok pada layer yang sama, HATCH — sesuai batasan di roadmap).
2. Isi **prefix** `feature_key` atau sunting tabel **Feature key / Label** per baris; bisa **tempel daftar key**, **saran key** dari atribut yang belum punya geometri, dan **pratinjau peta** (klik poligon ↔ baris).
3. Gunakan **Unduh template CSV** (`feature_key`, `label`) jika ingin mengisi key di spreadsheet lalu menempel kembali.
4. **SRID** sama seperti GeoJSON — harus cocok dengan koordinat di DXF.

---

## 6. Tab Tabel — atribut (CSV)

1. Kolom kunci default: **`feature_key`** (boleh diubah di dialog jika nama kolom lain).
2. **Unduh template CSV** berisi contoh kolom `feature_key` untuk diisi tim lapangan.
3. Impor CSV melakukan **upsert** per `feature_key` pada unit kerja yang dipilih.

---

## 7. Setelah impor

- Periksa peta workspace dan daftar fitur di dialog **kelola geometri** bila perlu hapus / impor ulang.
- Jika atribut “tidak muncul di peta”, periksa apakah **`feature_key`** atribut sama persis dengan geometri.

---

**Di aplikasi (tanpa repositori):** buka route **`/help/spatial-import`** pada host aplikasi Anda (halaman bantuan ini dapat diakses tanpa login).

---

*Dokumen ini diselaraskan dengan perilaku aplikasi; untuk perubahan versi terbaru lihat juga [`spatial-import-roadmap.md`](./spatial-import-roadmap.md).*
