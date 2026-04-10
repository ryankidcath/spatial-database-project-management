-- Fase 1 increment 5: jadwal issue (Kalender/Gantt) + seed tanggal & task demo tambahan

alter table core_pm.issues
  add column if not exists starts_at timestamptz,
  add column if not exists due_at timestamptz;

comment on column core_pm.issues.starts_at is 'Awal rentang kerja / milestone (Kalender, Gantt)';
comment on column core_pm.issues.due_at is 'Tenggat (Kalender, Gantt)';

-- Tanggal demo (April–Mei 2026, timezone +7)
update core_pm.issues
set
  starts_at = '2026-04-01T08:00:00+07:00',
  due_at = '2026-04-12T17:00:00+07:00'
where id = '44444444-4444-4444-8444-444444444401';

update core_pm.issues
set
  starts_at = '2026-04-05T09:00:00+07:00',
  due_at = '2026-04-09T18:00:00+07:00'
where id = '44444444-4444-4444-8444-444444444411';

update core_pm.issues
set
  starts_at = '2026-04-14T08:00:00+07:00',
  due_at = '2026-04-24T17:00:00+07:00'
where id = '44444444-4444-4444-8444-444444444402';

update core_pm.issues
set
  starts_at = '2026-04-18T08:00:00+07:00',
  due_at = '2026-05-02T17:00:00+07:00'
where id = '44444444-4444-4444-8444-444444444403';

update core_pm.issues
set
  starts_at = '2026-04-03T08:00:00+07:00',
  due_at = '2026-04-18T17:00:00+07:00'
where id = '44444444-4444-4444-8444-444444444501';

update core_pm.issues
set
  starts_at = '2026-04-20T08:00:00+07:00',
  due_at = '2026-04-28T17:00:00+07:00'
where id = '44444444-4444-4444-8444-444444444502';

-- Task tambahan (kalender lebih padat; cocok untuk uji Gantt/Kanban inc 6)
insert into core_pm.issues (
  id,
  project_id,
  status_id,
  parent_id,
  key_display,
  title,
  sort_order,
  starts_at,
  due_at
)
values
  (
    '44444444-4444-4444-8444-444444444421',
    '22222222-2222-4222-8222-222222222221',
    '33333333-3333-4333-8333-333333333301',
    null,
    'PLM-5',
    'Kunjungan lapangan',
    5,
    '2026-04-16T07:00:00+07:00',
    '2026-04-18T16:00:00+07:00'
  ),
  (
    '44444444-4444-4444-8444-444444444422',
    '22222222-2222-4222-8222-222222222221',
    '33333333-3333-4333-8333-333333333301',
    null,
    'PLM-6',
    'Review klien & revisi dokumen',
    6,
    '2026-04-22T08:00:00+07:00',
    '2026-04-29T17:00:00+07:00'
  ),
  (
    '44444444-4444-4444-8444-444444444503',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333311',
    null,
    'INT-3',
    'Perencanaan Q2',
    3,
    '2026-05-02T08:00:00+07:00',
    '2026-05-08T17:00:00+07:00'
  );
