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
- Dev: `cd app` lalu `npm run dev`
- Migration DB: dari root, `npx supabase db push`
- Jika error **Invalid schema: core_pm**: expose schema di Supabase (lihat `docs/supabase-expose-schemas.md`)

