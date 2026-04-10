# Spatial Database Project Management

Fondasi implementasi aplikasi Project Management modular dengan dukungan domain PLM, spasial, dan keuangan.

## Status

- Fase aktif: **Fase 0 (Fondasi)**
- Dokumen utama analisis: `catatan-skema-database.md`

## Struktur awal

- `docs/` - dokumentasi implementasi dan keputusan teknis.
- `infra/` - blueprint infrastruktur per environment.
- `supabase/` - tempat konfigurasi/migration SQL Supabase.
- `app/` - frontend (akan diisi pada Fase 1).

## Keputusan baseline Fase 0

- Stack: Supabase + GitHub + Vercel
- Environment: `dev`, `staging`, `prod`
- Auth: internal
- RLS: berbasis `organization_id` + `project_id`
- Schema modular: `core_pm`, `plm`, `spatial`, `finance`

## Langkah berikutnya

Lihat `docs/fase-0-eksekusi.md` untuk checklist detail eksekusi Fase 0.

## Frontend (Fase 1)

- Kode app: folder `app/`
- Env lokal: salin `app/.env.example` → `app/.env.local` (isi `NEXT_PUBLIC_SUPABASE_*`)
- Dev: `cd app` lalu `npm install` lalu `npm run dev`
- Kanban (inc 6): drag memakai `@dnd-kit/core` — pastikan dependency terpasang setelah `git pull`
- Auth + RLS (inc 7): wajib login di `/login`; migration `0005` + `0006_rls_project_member_helper.sql` (hindari rekursi policy) + panduan `docs/supabase-auth-increment-7.md`
- Migration DB: dari root, `npx supabase db push` (termasuk jadwal issue `0003_issues_schedule` + demo peta `0004_spatial_demo_footprints`)
- Jika error **Invalid schema: core_pm** (atau **`spatial`** setelah `0004`): expose schema di Supabase (lihat `docs/supabase-expose-schemas.md`)
- Data dummy untuk inc berikut: `docs/dummy-data-increment-6-8.md`
- URL workspace: `/?org=<uuid>&project=<uuid>&task=<uuid>&view=dashboard|tabel|map|kanban|…` (bookmark / share)

