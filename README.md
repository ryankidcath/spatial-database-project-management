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

