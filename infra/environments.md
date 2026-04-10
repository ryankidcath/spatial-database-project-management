# Environment Blueprint

## Environments

- `dev` - untuk pengembangan harian
- `staging` - untuk QA/UAT
- `prod` - untuk produksi

## Mapping

- Git branch `main` -> Vercel Production -> Supabase `prod`
- Pull Request Preview -> Vercel Preview -> Supabase `staging` (atau `dev`)

## Notes

- Jangan gunakan database production untuk testing manual.
- Semua perubahan schema masuk lewat migration.

