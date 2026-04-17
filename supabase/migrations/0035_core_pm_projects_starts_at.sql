alter table core_pm.projects
  add column if not exists starts_at timestamptz;

comment on column core_pm.projects.starts_at is
  'Tanggal mulai project (otomatis: tanggal terawal dari semua unit kerja aktif).';

