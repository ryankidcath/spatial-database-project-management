# Supabase Auth + RLS (Increment 7)

## Yang berubah

- **Migration `0006_rls_project_member_helper.sql`** — menghindari **infinite recursion** pada policy `project_members` (helper `core_pm.is_project_member(uuid)` ber-`SECURITY DEFINER`). Wajib di-push setelah `0005`.
- **Migration `0005_core_pm_rls_and_auth.sql`**
  - Policy dev “buka lebar” untuk **`anon`** dicabut; **`authenticated`** hanya melihat/mengubah data lewat **`project_members`**.
  - Trigger **`core_pm.handle_new_user`** → baris **`core_pm.profiles`** saat user baru di **`auth.users`**.
  - RPC **`core_pm.join_demo_org_projects()`** — menambahkan user login ke semua project seed organisasi **KJSB Demo** (hanya jika belum punya keanggotaan apa pun).
- **Next.js:** `@supabase/ssr`, **`middleware`** (refresh cookie + redirect), **`/login`**, **`/auth/callback`**, server actions **`auth/actions.ts`**.

## Langkah Anda

1. **`npx supabase db push`** (migration `0005`).
2. **Authentication → Providers** di Dashboard: aktifkan **Email**; untuk lokal, di **Auth → Sign in / Providers** nonaktifkan **Confirm email** atau gunakan tautan konfirmasi dari inbox.
3. **URL redirect:** di **Auth → URL configuration**, tambahkan:
   - `http://localhost:3000/auth/callback`
   - (production) `https://<domain-anda>/auth/callback`
4. Env app (mis. `app/.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Opsional: `NEXT_PUBLIC_SITE_URL=https://...` (untuk `emailRedirectTo` saat daftar).
5. Daftar akun di **`/login`** → masuk → workspace memuat project demo (RPC bootstrap otomatis setelah login).
6. Jika daftar kosong: tombol **Gabung ke project demo** atau tambahkan manual baris di **`core_pm.project_members`**.

## Catatan

- **Service role** tidak dipakai di browser; hanya **anon key** + JWT user.
- Tanpa login, **`/`** diarahkan ke **`/login`**.
- **Spatial** demo: policy select mengikuti keanggotaan project yang sama.
