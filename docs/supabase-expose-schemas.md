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
5. Tambahkan schema berikut (minimal untuk Fase 1 saat ini):
   - `core_pm`
6. Simpan.

Untuk modul nanti, tambahkan juga: `plm`, `spatial`, `finance` (boleh sekalian sekarang agar tidak lupa).

## Setelah itu

- Refresh aplikasi (`npm run dev` / reload browser).
- Tidak perlu migration baru hanya untuk expose schema ini.

## Referensi

- [Supabase: Exposing schemas in the API](https://supabase.com/docs/guides/api/using-custom-schemas)
