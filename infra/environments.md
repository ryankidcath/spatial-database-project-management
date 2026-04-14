# Environment Blueprint

## Model disepakati (satu jalur)

- **Lokal:** `dev` — `npm run dev` + `app/.env.local`.
- **Cloud:** satu deployment **Vercel Production** + satu **project Supabase** (tanpa jalur Preview/DB kedua wajib).

Detail, checklist, dan **daftar kekurangan (minus)** setup ini: **[`DEPLOY.md`](../DEPLOY.md)**.

## Mapping (ringkas)

- Branch **`main`** → **Vercel Production** → **satu** Supabase.

## Notes

- Perubahan schema lewat migration di repo; dampak langsung ke project Supabase yang dipakai production.
- Backup / PITR Supabase tetap disarankan untuk data nyata.
