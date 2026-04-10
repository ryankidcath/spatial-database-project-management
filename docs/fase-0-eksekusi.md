# Fase 0 - Eksekusi Fondasi

Dokumen ini adalah checklist teknis untuk menjalankan Fase 0 berdasarkan keputusan di `catatan-skema-database.md`.

## 1) Supabase

- [ ] Buat 3 project Supabase: `dev`, `staging`, `prod`
- [ ] Pilih region terdekat operasional tim
- [ ] Aktifkan extension PostGIS
- [ ] Konfigurasi schema: `core_pm`, `plm`, `spatial`, `finance`
- [ ] **Expose schema ke Data API:** Settings → Data API / API → Exposed schemas → tambahkan `core_pm` (dan `plm`, `spatial`, `finance` jika sudah dipakai). Lihat `docs/supabase-expose-schemas.md`.
- [ ] Siapkan baseline SQL: schema creation + permissions awal
- [ ] Aktifkan backup/PITR sesuai paket
- [ ] Definisikan bucket storage:
  - `legalisasi-files`
  - `pengukuran-files`
  - `general-attachments`

## 2) GitHub

- [ ] Buat repository remote
- [ ] Push repository lokal
- [ ] Aktifkan branch protection untuk `main`
- [ ] Wajibkan pull request review
- [ ] Tambahkan status checks minimum (lint/typecheck/test/migration check)

## 3) Vercel

- [ ] Buat 1 project Vercel
- [ ] Hubungkan dengan repository GitHub
- [ ] Mapping environment:
  - Preview -> Supabase `staging` (atau `dev`)
  - Production -> Supabase `prod`
- [ ] Set environment variables dari `.env.example`

## 4) Security baseline

- [ ] Pastikan `SUPABASE_SERVICE_ROLE_KEY` hanya di server
- [ ] Implement RLS baseline di tabel yang memiliki `organization_id`/`project_id`
- [ ] Definisikan role internal minimal:
  - `admin`
  - `finance`
  - `surveyor`
  - `drafter`
  - `viewer`

## 5) Done criteria Fase 0

- [ ] Repo, Supabase, dan Vercel sudah terhubung
- [ ] 3 environment berjalan
- [ ] Schema modular siap dipakai migration
- [ ] Secrets aman
- [ ] Dokumen keputusan Fase 0 sudah sinkron

