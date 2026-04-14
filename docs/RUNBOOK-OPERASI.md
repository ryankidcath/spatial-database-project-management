# Runbook operasi (F7-4)

Dokumen singkat saat **insiden** atau **rilis bermasalah**. Sesuaikan nama tim, saluran chat, dan nomor telepon di bagian **Kontak**.

## Checklist cepat operator (isi manual)

- [ ] Isi tabel **Kontak & eskalasi** dengan nama/tim yang benar-benar on-call.
- [ ] Pastikan semua saluran kontak valid (uji ping singkat di Slack/WA/email).
- [ ] Tentukan PIC keputusan go/no-go pilot.
- [ ] Simpan tanggal review berkala runbook (mis. tiap 2 minggu selama pilot).

## Kontak & eskalasi

| Peran | Nama / tim | Saluran | Catatan |
|--------|------------|---------|---------|
| Pemilik produk | *(isi)* | *(Slack / WA)* | Keputusan bisnis, komunikasi pengguna pilot |
| Teknis (app) | *(isi)* | *(GitHub / email)* | Vercel, repo, env |
| Basis data | *(isi)* | *(Supabase project)* | Migration, backup, RLS |

---

## 1. Situs tidak bisa diakses / 404 Vercel

1. **Vercel → Deployments**: deployment **Production** terakhir status **Ready**?
2. **Settings → Domains**: domain production **Valid**?
3. **Rollback cepat**: Deployments → deployment **Ready** sebelumnya yang sehat → **⋯** → **Promote to Production** (atau **Redeploy** commit hash yang diketahui baik).
4. Cek **Build Logs** deployment gagal (error compile / env hilang).

Rujukan: **`DEPLOY.md`**.

---

## 2. Aplikasi error setelah deploy (runtime)

1. **Vercel → Logs / Observability** (filter **Production**, waktu insiden).
2. **Supabase → Logs** (API, Postgres, Auth) untuk error 5xx / query / RLS.
3. Bandingkan dengan **perubahan terakhir**: merge PR, env baru, migration.

Jika perlu **kembalikan hanya aplikasi** (bukan DB): rollback Vercel seperti §1. **Data/schema DB tidak ikut kembali.**

---

## 3. Migration bermasalah / ingin “beku” sementara

1. **Jangan** merge PR yang berisi migration besar sampai direview dan diuji lokal / salinan DB.
2. Di **GitHub**: aktifkan **branch protection** pada `main` (wajib PR + review) bila belum — mengurangi push langsung ke production.
3. Jika migration sudah terlanjur merusak data: **backup / PITR** Supabase (**`docs/MIGRASI-DAN-CADANGAN.md`**, §13.2 di catatan).

---

## 4. Autentikasi / login gagal massal

1. **Supabase → Authentication → URL**: **Site URL** dan **Redirect URLs** cocok dengan **`NEXT_PUBLIC_SITE_URL`** production.
2. **Vercel → Environment Variables**: `NEXT_PUBLIC_SUPABASE_*` benar untuk project yang dipakai.
3. Cek **status Supabase** (status page vendor) bila error tidak jelas.

---

## 5. Monitoring rutin (bukan insiden)

Lihat **`docs/MONITORING.md`**: log Vercel/Supabase, opsi error tracking (Sentry), dan kriteria pilot di **`docs/KRITERIA-KELUAR-PILOT.md`**.

---

## Rujukan cepat

| Topik | Dokumen |
|--------|---------|
| Deploy & env | `DEPLOY.md` |
| Migrasi & backup | `docs/MIGRASI-DAN-CADANGAN.md` |
| Pilot & akses | `docs/PILOT.md` |
| Schema API | `docs/supabase-expose-schemas.md` |
