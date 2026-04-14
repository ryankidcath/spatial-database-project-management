# Pilot & akses (F7-2)

Panduan operasional melengkapi fitur di aplikasi: **kontrol pendaftaran**, **banner pilot**, dan **matriks modul** per organisasi.

## Checklist cepat operator (isi manual)

- [ ] Isi tabel organisasi pilot di bagian 1 (nama, UUID, kontak admin).
- [ ] Tetapkan kebijakan signup (`AUTH_SIGNUP_MODE`, opsional domain) di Vercel.
- [ ] Putuskan banner pilot aktif/tidak dan isi teksnya bila perlu.
- [ ] Tetapkan matriks modul per organisasi (minimal `core_pm`; aktifkan `plm`/`spatial`/`finance` sesuai pilot).
- [ ] Simpan bukti perubahan (screenshot env + SQL editor history) untuk audit rollout.

## 1. Daftar organisasi pilot

Isi tabel di bawah (salin dari Supabase → **Table Editor** → `core_pm.organizations` atau query `select id, name, slug from core_pm.organizations`).

| Organisasi (nama) | `id` (UUID) | Kontak admin |
|-------------------|-------------|--------------|
|                   |             |              |

UUID ini dipakai saat mengatur **`organization_modules`** (langkah 4).

## 2. Kebijakan pendaftaran (Auth)

Di **Vercel** / `app/.env.local` (server — tanpa prefix `NEXT_PUBLIC_`):

| Variabel | Nilai | Efek |
|----------|--------|------|
| `AUTH_SIGNUP_MODE` | *(kosong)* atau `open` | Form **Daftar** di `/login` aktif (default). |
| `AUTH_SIGNUP_MODE` | `closed` | Form daftar disembunyikan; `signup` server menolak. |
| `AUTH_SIGNUP_MODE` | `email_domain` | Hanya email yang cocok suffix; set juga domain di bawah. |
| `AUTH_SIGNUP_ALLOWED_EMAIL_DOMAIN` | mis. `@contoh.go.id` atau `contoh.go.id` | Dipakai jika mode `email_domain`. |

Selaras dengan **Supabase Dashboard → Authentication → Providers**: Anda juga bisa menonaktifkan sign-up di sisi Supabase; variabel di atas mengontrol **UI + server action** aplikasi.

## 3. Banner “pilot / beta”

Variabel **publik** (boleh `NEXT_PUBLIC_*`):

| Variabel | Nilai |
|----------|--------|
| `NEXT_PUBLIC_SHOW_PILOT_BANNER` | `1` atau `true` — tampilkan bar kuning tipis di atas workspace. |
| `NEXT_PUBLIC_PILOT_BANNER_TEXT` | *(opsional)* Teks kustom; default sudah ramah pengguna. |

## 4. Matriks modul per organisasi pilot

Modul diaktifkan per organisasi lewat tabel **`core_pm.organization_modules`** (RLS + RPC `set_organization_module_enabled` sudah ada di migration).

Contoh: hanya **`core_pm`** + **`plm`** untuk satu org (ganti `:org_id`):

```sql
-- Contoh: aktifkan plm untuk organisasi pilot (ganti UUID; jalankan sebagai service role / SQL editor)
insert into core_pm.organization_modules (organization_id, module_code, is_enabled, enabled_at)
values ('00000000-0000-0000-0000-000000000001', 'plm', true, now())
on conflict (organization_id, module_code)
do update set is_enabled = excluded.is_enabled, enabled_at = excluded.enabled_at;
```

Kode modul tersedia di **`core_pm.module_registry`**. UI **Organisasi → toggle modul** (workspace) memanggil aksi yang sama.

Template matriks yang direkomendasikan:

| Organisasi | `core_pm` | `plm` | `spatial` | `finance` | Catatan |
|------------|-----------|-------|-----------|-----------|---------|
| *(isi nama org)* | on | on/off | on/off | on/off | *(scope pilot)* |

## 5. Rujukan

- Deploy satu jalur: **`DEPLOY.md`**
- Progress fase: **`catatan-skema-database.md`** §22 (F7-2)
- Monitoring & keluar pilot: **`docs/MONITORING.md`**, **`docs/RUNBOOK-OPERASI.md`**, **`docs/KRITERIA-KELUAR-PILOT.md`** (F7-4)
