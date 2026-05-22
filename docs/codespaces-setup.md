# GitHub Codespaces — branch `dev`

Panduan kerja di tablet/browser dengan terminal + `npm run dev`, tanpa mengganggu deploy production (`main`).

## Yang sudah disiapkan di repo

- `.devcontainer/devcontainer.json` — Node 22, port **3000**, terminal default di folder `app/`
- `.devcontainer/post-create.sh` — `npm install` + buat `app/.env.local` dari secrets (jika ada)

## Yang harus Anda lakukan (manual, sekali)

### 1. Codespaces secrets (disarankan)

GitHub → repo → **Settings** → **Secrets and variables** → **Codespaces** → **New repository secret**

| Nama secret | Nilai |
|-------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | sama seperti PC `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sama seperti PC |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` (cukup untuk dev di Codespace) |

Tanpa secrets, setelah Codespace dibuat Anda isi `app/.env.local` manual (copy dari PC).

### 2. Buat Codespace

1. GitHub → branch **`dev`**
2. **Code** → **Codespaces** → **Create codespace on dev**
3. Tunggu build devcontainer selesai (pertama kali ~3–5 menit)

### 3. Jalankan dev server

Terminal (sudah di `app/`):

```bash
npm run dev
```

Tab **Ports** → port **3000** → **Open in Browser**.

### 4. Supabase Auth (login)

Setiap Codespace punya URL port forwarding yang **berbeda**. Di Supabase Dashboard → **Authentication** → **Redirect URLs**, tambahkan:

```text
https://<host-dari-tab-ports-3000>/auth/callback
```

Contoh bentuk: `https://xxxx-3000.app.github.dev/auth/callback`

Tetap pertahankan `http://localhost:3000/auth/callback` dan URL Vercel Preview yang sudah dipakai.

### 5. Push ke `dev`

```bash
git pull origin dev
# ... edit ...
git add -A
git commit -m "pesan"
git push origin dev
```

Vercel Preview (branch `dev`) akan rebuild otomatis.

## Perbandingan singkat

| | Codespaces | Vercel Preview | Cursor Cloud Agent |
|--|------------|----------------|---------------------|
| `npm run dev` | ✅ | ❌ | kadang |
| Terminal penuh | ✅ | ❌ | terbatas |
| Uji di tablet | ✅ (URL port) | ✅ | — |
| Env rahasia | secrets / `.env.local` | Vercel env | jarang |

## Troubleshooting

- **Login gagal** → cek Redirect URL Supabase untuk host port 3000 Codespace ini.
- **Build Next gagal** → pastikan perintah di folder `app/`: `npm run build`
- **Migration DB baru** → dari root repo: `npx supabase login` → `npx supabase link` → `npx supabase db push` (koordinasi dengan admin)

Lihat juga: `DEPLOY.md`, `docs/MIGRASI-DAN-CADANGAN.md`.
