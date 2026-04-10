# Data dummy untuk increment 6–8

Ringkasan apa yang sudah disiapkan di migration (selain `0002` seed Core PM).

## Increment 5 (Kalender & Gantt)

- Migration **`0003_issues_schedule.sql`**
  - Kolom `core_pm.issues.starts_at`, `due_at` (timestamptz, nullable).
  - Update tanggal pada issue seed yang ada + **tiga issue baru**: `PLM-5`, `PLM-6`, `INT-3`.

## Increment 6 (Kanban drag)

- Tidak ada tabel baru. Cukup pakai `status_id` + `sort_order` yang sudah ada.
- Setelah `db push`, kartu Kanban punya rentang tanggal untuk konteks visual opsional nanti.

## Increment 7 (RLS + auth)

- Tidak ada user dummy di migration (bergantung Supabase Auth + alamat email nyata).
- `core_pm.profiles` / `project_members` siap diisi setelah login pertama.

## Increment 8 (Map)

- Migration **`0004_spatial_demo_footprints.sql`**
  - Tabel `spatial.project_demo_footprints` (`project_id`, `label`, `geojson` Feature Polygon 4326).
  - **Expose schema `spatial`** di Supabase **Exposed schemas** (sama seperti `core_pm`), lihat `docs/supabase-expose-schemas.md`.

GeoJSON ini hanya untuk demo UI; model spasial penuh mengikuti catatan domain (`bidang_*`, dll.).
