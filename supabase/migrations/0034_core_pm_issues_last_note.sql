-- Catatan terakhir operasional per unit kerja (snapshot sederhana untuk PM).

alter table core_pm.issues
  add column if not exists last_note text,
  add column if not exists last_note_at timestamptz,
  add column if not exists last_note_by uuid references auth.users (id) on delete set null;

comment on column core_pm.issues.last_note is
  'Catatan operasional terakhir pada unit kerja (overwrite).';
comment on column core_pm.issues.last_note_at is
  'Waktu update catatan terakhir.';
comment on column core_pm.issues.last_note_by is
  'User yang terakhir memperbarui catatan.';

