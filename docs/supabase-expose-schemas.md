# Supabase: expose schema `core_pm` (wajib untuk API)

PostgREST (REST API Supabase) **hanya melayani tabel di schema yang diizinkan**.  
Tabel di `core_pm.*` tidak akan bisa di-`select` dari client sampai schema itu di-expose.

## Gejala

- Error dari aplikasi: `Invalid schema: core_pm`
- Atau error serupa dari PostgREST terkait schema

## Langkah (Dashboard)

1. Buka project Supabase Anda.
2. Buka **Project Settings** (ikon roda gigi).
3. Buka bagian **Data API** atau **API** (nama menu bisa sedikit berbeda antar versi UI).
4. Cari **Exposed schemas** / **Schema** yang bisa diakses API.
5. Tambahkan schema berikut:
   - `core_pm` (wajib)
   - `plm` (setelah migration Fase 3 F3-1, jika memakai berkas PLM dari API)
   - `spatial` / `finance` sesuai kebutuhan
6. Simpan.

Tabel **Fase 2** (`module_registry`, `organization_modules`) ikut di schema **`core_pm`** — tidak perlu menambah schema baru di expose list hanya untuk modul.

Tambahkan juga: **`plm`** (wajib setelah migration **Fase 3 F3-1** / `0009_plm_berkas_pemilik_core.sql`), **`spatial`**, **`finance`** (boleh sekalian agar tidak lupa).

Setelah migration **`0004_spatial_demo_footprints`**, tabel demo Map membaca schema **`spatial`** — pastikan **`spatial`** ikut di **Exposed schemas** (selain `core_pm`).  
Setelah **`0011_spatial_v_bidang_hasil_ukur_map.sql`** / **`0012_spatial_v_bidang_map_berkas_id.sql`**, aplikasi mem-**select** view **`spatial.v_bidang_hasil_ukur_map`** (kolom termasuk **`berkas_id`** setelah `0012`; masih schema **`spatial`** yang sama).

## Setelah itu

- Refresh aplikasi (`npm run dev` / reload browser).
- Tidak perlu migration baru hanya untuk expose schema ini.

## Referensi

- [Supabase: Exposing schemas in the API](https://supabase.com/docs/guides/api/using-custom-schemas)
