# Panduan deploy — Spatial PM

Setup **satu jalur**: satu deployment **Vercel (Production)** + satu **project Supabase** (bisa yang sudah ada). Tidak mengandalkan **Preview** terpisah atau project DB kedua.

Blueprint singkat: [`infra/environments.md`](infra/environments.md).

## Arsitektur repo

- Next.js di folder **`app/`**.
- **Vercel → Root Directory** = `app`.
- **Rilis:** merge ke **`main`** (atau `master`) → deploy **Production** saja.

### Menonaktifkan Preview (disarankan agar konsisten)

Jika tidak akan memakai env untuk PR: **Vercel → Project → Settings → Git →** matikan *Automatic Preview Deployments* (atau setara), supaya tidak ada URL deployment kedua yang membingungkan atau kehabisan env. QA fitur tetap lewat **lokal** (`npm run dev`) + **CI** (GitHub Actions).

## Supabase — satu project

- Salin **URL** dan **anon key** dari dashboard Supabase ke Vercel (scope **Production** saja untuk variabel publik).
- Migration dari folder `supabase/` diterapkan ke **project ini** — prosedur lengkap: **`docs/MIGRASI-DAN-CADANGAN.md`** (F7-3).

## Kekurangan (minus) setup “1 Vercel Production + 1 Supabase”

| Minus | Penjelasan |
|--------|------------|
| **Tidak ada URL cloud per PR** | Reviewer/stakeholder tidak mendapat tautan otomatis “versi branch ini” di infrastruktur sama dengan prod. Uji di **lokal** atau andalkan **CI**. |
| **Setiap merge = langsung ke pengguna** | Bug/regresi yang lolos review bisa langsung ke deployment production; tidak ada gate deploy staging terpisah. |
| **DB = satu tempat** | Uji manual yang mengubah data memakai DB yang sama dengan operasional; tidak ada salinan DB staging bawaan. |
| **Migration tidak ada “dry run” di DB kedua** | Skema berubah langsung di project yang dipakai app; kesalahan migration berdampak langsung (mitigasi: review SQL, backup, CI). |
| **Rollback asimetris** | Vercel bisa redeploy commit lama; **data/schema** tidak otomatis kembali seperti semula. |

**Kapan tetap cukup:** tim kecil, satu pilot, ritme rilis terkontrol, dan Anda sadar trade-off di atas.

**Kapan perlu memecah lagi:** beberapa tim, data regulasi/kritis, atau butuh QA mandiri sebelum menyentuh prod — pertimbangkan lagi **Preview** atau **project Supabase kedua** (dokumen ini tidak mewajibkannya).

## Variabel lingkungan (Vercel)

Isi di **Settings → Environment Variables**, scope **Production** (cukup untuk model satu jalur).

| Variabel | Nilai |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key project tersebut |
| `NEXT_PUBLIC_SITE_URL` | URL publik situs (tanpa slash akhir), mis. `https://app.contoh.com` |

Lokal: salin `app/.env.example` → `app/.env.local`.

### Rahasia server-only (opsional)

| Variabel | Catatan |
|----------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Tanpa prefix `NEXT_PUBLIC_`. Hanya jika server membutuhkannya. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push (Fase B). Pasangan dari `npx web-push generate-vapid-keys`. |

Referensi nama variabel: **`/.env.example`**, **`app/.env.example`**.

## Web Push (Fase B notifikasi)

Panduan lengkap: **`docs/mobile-notifications-sound-push.md`**.

1. **Migration** `0069_push_subscriptions.sql` (`npx supabase db push`).
2. **Vercel Production:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (public key).
3. **Supabase Edge Function** `send-web-push`:
   ```bash
   npx supabase functions deploy send-web-push --no-verify-jwt
   npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:admin@contoh.com PUSH_WEBHOOK_SECRET=...
   ```
   (`SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` biasanya sudah tersedia di secrets project.)
4. **Trigger pg_net** — di SQL Editor (ganti project ref & secret):
   ```sql
   alter database postgres set core_pm.push_function_url = 'https://<PROJECT_REF>.supabase.co/functions/v1/send-web-push';
   alter database postgres set core_pm.push_function_secret = '<PUSH_WEBHOOK_SECRET>';
   ```
5. **Uji:** install PWA → buka workspace → tap sekali (izin notifikasi) → kill app → kirim pesan chat dari akun lain.

## Supabase Auth — URL redirect

**Authentication → URL configuration**

- **Site URL** = `NEXT_PUBLIC_SITE_URL` production.
- **Redirect URLs** = sertakan `{SITE_URL}/auth/callback` (dan varian domain jika pakai alias).

Tanpa ini, login / email konfirmasi bisa gagal.

## Alur rilis (ringkas)

1. Kembangkan di lokal / CI hijau.
2. Merge ke **`main`** → Vercel build **Production**.
3. Smoke (di bawah).

## Smoke pasca-deploy

**Manual:** `/login` tampil; env lengkap → alur login nyata.

**Playwright** ke URL production (tanpa `webServer` lokal):

```bash
cd app
npx playwright install chromium
# PowerShell:
$env:PLAYWRIGHT_BASE_URL="https://your-production-url.example.com"
npm run test:e2e
```

CI di GitHub tetap membangun app lokal (`CI=true`).

## Pilot & pendaftaran (F7-2)

Kebijakan undangan / domain email / banner beta: variabel env di **`app/.env.example`** dan panduan operasional **`docs/PILOT.md`**.

## Monitoring & insiden (F7-4)

- **`docs/MONITORING.md`** — log Vercel/Supabase, opsi Sentry.  
- **`docs/RUNBOOK-OPERASI.md`** — rollback, migration freeze, auth.  
- **`docs/KRITERIA-KELUAR-PILOT.md`** — sebelum menambah organisasi.

## Checklist operator

- [ ] Satu project Supabase; PostGIS aktif; migration sudah diterapkan sesuai kebutuhan.
- [ ] Vercel: Root Directory **`app`**; variabel **`NEXT_PUBLIC_*`** di scope **Production**.
- [ ] Auth Supabase: **Site URL** + **Redirect URLs** cocok dengan production.
- [ ] (Opsional) Preview deployment dimatikan bila tidak dipakai.
- [ ] Smoke setelah deploy pertama.
