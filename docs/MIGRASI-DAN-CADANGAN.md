# Migrasi DB & cadangan (F7-3)

Selaras **satu project Supabase** (**`DEPLOY.md`**): tidak ada DB staging terpisah di dokumen ini — setiap migration diterapkan ke **project production** yang dipakai aplikasi. Koordinasikan jendela maintenance bila migration berat.

## 1. Sebelum migration baru

1. **Review** file SQL di `supabase/migrations/` (diff di PR).
2. **Backup**: Supabase Dashboard → **Project Settings → Database** — cek jadwal backup / aktifkan **PITR** jika paket Anda mendukung (**§13.2** di `catatan-skema-database.md`).
3. Pastikan **Exposed schemas** tetap mencakup `core_pm`, `plm`, `spatial`, … setelah perubahan (**`docs/supabase-expose-schemas.md`**).
4. Uji aplikasi di **lokal** dengan DB yang sudah di-push migration yang sama (`npx supabase db reset` di dev lokal bila perlu).

## 2. Menerapkan migration ke Supabase production

**Opsi A — Supabase CLI (disarankan)**

Dari root repo (setelah `npx supabase login` dan `npx supabase link` ke project target):

```bash
npx supabase db push
```

Hanya menjalankan file migration yang **belum** pernah tercatat di remote.

**Opsi B — SQL manual**

Jalankan isi file `.sql` **berurutan** nama file (`0001_…`, `0002_…`, …) di **SQL Editor** Supabase. Risiko: melewatkan dependency atau duplikasi jika tidak disiplin.

## 3. Setelah migration

1. Di **SQL Editor**: `notify pgrst, 'reload schema';` agar PostgREST memuat ulang view/tabel baru.
2. Verifikasi cepat: contoh `select to_regclass('plm.v_berkas_permohonan_summary_by_status');` untuk view F6-3 bila relevan.
3. **Redeploy** atau reload aplikasi Vercel; smoke `/login` dan satu alur workspace.

## 4. Rollback

- **Skema:** migration di repo bersifat **maju**; tidak ada “undo” otomatis. Perbaiki dengan migration **baru** yang membatalkan perubahan, atau restore dari **backup/PITR** (langkah operasional di dashboard).
- **Aplikasi:** Vercel bisa redeploy commit lama; itu tidak mengembalikan isi DB.

## 5. CI repositori

Workflow **CI** menjalankan **`node scripts/verify-migration-files.mjs`**: pola nama `NNNN_*.sql`, tidak ada nama duplikat, tidak ada awalan empat digit duplikat. Ini **bukan** pengujian SQL terhadap Postgres — tetap wajib review manusia + backup sebelum `db push` production.

Lokal (dari root repo): `node scripts/verify-migration-files.mjs`

## Rujukan

- `DEPLOY.md` — lingkungan tunggal  
- `catatan-skema-database.md` §22 — F7-3  
- Folder migration: `supabase/migrations/`
- Insiden & rollback: **`docs/RUNBOOK-OPERASI.md`** (F7-4)
