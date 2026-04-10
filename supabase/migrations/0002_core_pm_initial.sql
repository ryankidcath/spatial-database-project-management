-- Fase 1 increment 2: core_pm tables + seed + dev RLS (longgar; perketat sebelum produksi)

-- --- Tables ---

create table core_pm.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table core_pm.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core_pm.organizations (id) on delete cascade,
  name text not null,
  key text not null,
  description text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, key)
);

create table core_pm.statuses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references core_pm.projects (id) on delete cascade,
  name text not null,
  category text not null check (category in ('todo', 'in_progress', 'done')),
  position int not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table core_pm.issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references core_pm.projects (id) on delete cascade,
  parent_id uuid references core_pm.issues (id) on delete cascade,
  status_id uuid references core_pm.statuses (id) on delete set null,
  key_display text,
  title text not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_core_pm_issues_project on core_pm.issues (project_id);
create index idx_core_pm_issues_parent on core_pm.issues (parent_id);
create index idx_core_pm_statuses_project on core_pm.statuses (project_id);

-- Profil internal (sinkron dengan auth.users nanti)
create table core_pm.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table core_pm.project_members (
  project_id uuid not null references core_pm.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- --- Grants (Supabase: anon/authenticated perlu akses schema) ---

grant usage on schema core_pm to anon, authenticated;
grant select, insert, update, delete on all tables in schema core_pm to anon, authenticated;
alter default privileges in schema core_pm grant select, insert, update, delete on tables to anon, authenticated;

-- --- RLS (sementara: baca/tulis untuk anon+authenticated — ganti sebelum produksi) ---

alter table core_pm.organizations enable row level security;
alter table core_pm.projects enable row level security;
alter table core_pm.statuses enable row level security;
alter table core_pm.issues enable row level security;
alter table core_pm.profiles enable row level security;
alter table core_pm.project_members enable row level security;

create policy "core_pm_dev_all_organizations"
  on core_pm.organizations for all to anon, authenticated using (true) with check (true);

create policy "core_pm_dev_all_projects"
  on core_pm.projects for all to anon, authenticated using (true) with check (true);

create policy "core_pm_dev_all_statuses"
  on core_pm.statuses for all to anon, authenticated using (true) with check (true);

create policy "core_pm_dev_all_issues"
  on core_pm.issues for all to anon, authenticated using (true) with check (true);

create policy "core_pm_dev_all_profiles"
  on core_pm.profiles for all to anon, authenticated using (true) with check (true);

create policy "core_pm_dev_all_project_members"
  on core_pm.project_members for all to anon, authenticated using (true) with check (true);

-- --- Seed demo (satu organisasi, dua project, status, issues bertingkat) ---

insert into core_pm.organizations (id, name, slug)
values (
  '11111111-1111-4111-8111-111111111111',
  'KJSB Demo',
  'kjsb-demo'
);

insert into core_pm.projects (id, organization_id, name, key, description)
values
  (
    '22222222-2222-4222-8222-222222222221',
    '11111111-1111-4111-8111-111111111111',
    'PLM Cirebon 2026',
    'PLM',
    'Proyek layanan PLM'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'PM Internal',
    'INT',
    'Proyek manajemen internal'
  );

insert into core_pm.statuses (id, project_id, name, category, position, is_default)
values
  ('33333333-3333-4333-8333-333333333301', '22222222-2222-4222-8222-222222222221', 'To Do', 'todo', 0, true),
  ('33333333-3333-4333-8333-333333333302', '22222222-2222-4222-8222-222222222221', 'Doing', 'in_progress', 1, false),
  ('33333333-3333-4333-8333-333333333303', '22222222-2222-4222-8222-222222222221', 'Done', 'done', 2, false),
  ('33333333-3333-4333-8333-333333333311', '22222222-2222-4222-8222-222222222222', 'To Do', 'todo', 0, true),
  ('33333333-3333-4333-8333-333333333312', '22222222-2222-4222-8222-222222222222', 'Doing', 'in_progress', 1, false),
  ('33333333-3333-4333-8333-333333333313', '22222222-2222-4222-8222-222222222222', 'Done', 'done', 2, false);

-- Issues PLM: induk + satu sub-task (hierarki)
insert into core_pm.issues (id, project_id, status_id, parent_id, key_display, title, sort_order)
values
  (
    '44444444-4444-4444-8444-444444444401',
    '22222222-2222-4222-8222-222222222221',
    '33333333-3333-4333-8333-333333333301',
    null,
    'PLM-1',
    'Berkas Intake',
    1
  ),
  (
    '44444444-4444-4444-8444-444444444402',
    '22222222-2222-4222-8222-222222222221',
    '33333333-3333-4333-8333-333333333301',
    null,
    'PLM-2',
    'Informasi Spasial',
    2
  ),
  (
    '44444444-4444-4444-8444-444444444403',
    '22222222-2222-4222-8222-222222222221',
    '33333333-3333-4333-8333-333333333302',
    null,
    'PLM-3',
    'Legalisasi GU',
    3
  ),
  (
    '44444444-4444-4444-8444-444444444411',
    '22222222-2222-4222-8222-222222222221',
    '33333333-3333-4333-8333-333333333301',
    '44444444-4444-4444-8444-444444444401',
    'PLM-1.1',
    'Verifikasi kelengkapan berkas',
    1
  );

-- Issues PM Internal
insert into core_pm.issues (id, project_id, status_id, parent_id, key_display, title, sort_order)
values
  (
    '44444444-4444-4444-8444-444444444501',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333311',
    null,
    'INT-1',
    'Setup backlog',
    1
  ),
  (
    '44444444-4444-4444-8444-444444444502',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333311',
    null,
    'INT-2',
    'Review sprint',
    2
  );
