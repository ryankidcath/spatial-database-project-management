# Monitoring (F7-4)

Ringkasa **di mana melihat kesehatan** sistem tanpa menambah beban wajib di kode.

## Vercel (aplikasi Next.js)

- **Deployments**: status build; **Promote / Redeploy** untuk rollback cepat.
- **Logs / Observability** (sesuai paket): request error, fungsi server, edge.
- **Speed Insights / Analytics** (opsional, dari dashboard Vercel) untuk metrik performa.

Pastikan **Environment** yang Anda lihat = **Production** saat men-debug live.

## Supabase (API & database)

- **Logs → API / Postgres / Auth**: query error, timeout, RLS `permission denied`.
- **Reports → Database**: koneksi, cache hit (sesuai UI terbaru).
- **Database → Backups**: jadwal backup; **Point-in-Time Recovery** jika paket mendukung.

Setelah migration baru, ingat **`notify pgrst, 'reload schema';`** bila objek API tidak terbaca — lihat **`docs/MIGRASI-DAN-CADANGAN.md`**.

## Error tracking terpusat (opsional: Sentry)

Untuk **exception** browser dan server ke satu dashboard:

1. Buat project di [sentry.io](https://sentry.io) (atau self-hosted).
2. Ikuti **Sentry Wizard** untuk Next.js: `npx @sentry/wizard@latest -i nextjs` (dari folder `app/`), atau [manual setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/).
3. Set **DSN** di Vercel sebagai env (biasanya `SENTRY_DSN` / variabel yang dihasilkan wizard).

**Catatan repo (2026-04):** paket resmi `@sentry/nextjs` saat ini mendeklarasikan peer **`next` hingga 15**; proyek ini memakai **Next 16**. Jangan memaksa `npm install` dengan `--legacy-peer-deps` kecuali Anda sudah uji build. Pantau rilis Sentry yang mendukung Next 16, atau gunakan hanya **log Vercel + Supabase** sampai SDK kompatibel.

## Smoke otomatis

- **CI**: GitHub Actions (lint, typecheck, migration verify, Playwright).
- **Production**: dari folder `app/`, set `PLAYWRIGHT_BASE_URL` ke URL production — lihat **`DEPLOY.md`**.

## Rujukan

- **Insiden & rollback**: `docs/RUNBOOK-OPERASI.md`
- **Keluar pilot**: `docs/KRITERIA-KELUAR-PILOT.md`
