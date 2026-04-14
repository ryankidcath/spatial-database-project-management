-- Fase 3 slice F3-1: schema plm — berkas permohonan + pemilik + junction (MVP; §10.2 catatan)

-- --- Berkas (per project; akses lewat keanggotaan project) ---

create table plm.berkas_permohonan (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references core_pm.projects (id) on delete cascade,
  nomor_berkas text not null,
  tanggal_berkas date not null default (current_date),
  status text not null default 'draft',
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (project_id, nomor_berkas)
);

create index idx_plm_berkas_project on plm.berkas_permohonan (project_id);
create index idx_plm_berkas_deleted on plm.berkas_permohonan (deleted_at) where deleted_at is null;

comment on table plm.berkas_permohonan is
  'Berkas permohonan PLM; scope akses = project (FK core_pm.projects).';

-- --- Pemilik (master per organisasi) ---

create table plm.pemilik_tanah (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core_pm.organizations (id) on delete cascade,
  nama_lengkap text not null,
  nik text,
  telepon text,
  alamat text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_plm_pemilik_org on plm.pemilik_tanah (organization_id);

comment on table plm.pemilik_tanah is
  'Master pemilik tanah per organisasi; dihubungkan ke berkas lewat berkas_pemilik.';

-- --- Junction berkas ↔ pemilik ---

create table plm.berkas_pemilik (
  berkas_id uuid not null references plm.berkas_permohonan (id) on delete cascade,
  pemilik_id uuid not null references plm.pemilik_tanah (id) on delete cascade,
  urutan smallint not null default 0,
  primary key (berkas_id, pemilik_id)
);

create index idx_plm_berkas_pemilik_pemilik on plm.berkas_pemilik (pemilik_id);

comment on table plm.berkas_pemilik is
  'M:N berkas permohonan ↔ pemilik tanah.';

-- --- Seed demo (project PLM Cirebon 2026, org KJSB) ---

insert into plm.pemilik_tanah (id, organization_id, nama_lengkap, nik, telepon, alamat)
values
  (
    '55555555-5555-4555-8555-555555550001',
    '11111111-1111-4111-8111-111111111111',
    'Budi Santoso',
    null,
    '081234567890',
    'Cirebon'
  ),
  (
    '55555555-5555-4555-8555-555555550002',
    '11111111-1111-4111-8111-111111111111',
    'Ani Wijaya',
    null,
    null,
    'Cirebon'
  );

insert into plm.berkas_permohonan (id, project_id, nomor_berkas, tanggal_berkas, status, catatan)
values
  (
    '66666666-6666-4666-8666-666666660001',
    '22222222-2222-4222-8222-222222222221',
    'BKS-2026-0042',
    '2026-01-15',
    'draft',
    'Seed demo F3-1'
  ),
  (
    '66666666-6666-4666-8666-666666660002',
    '22222222-2222-4222-8222-222222222221',
    'BKS-2026-0043',
    '2026-02-01',
    'draft',
    null
  );

insert into plm.berkas_pemilik (berkas_id, pemilik_id, urutan)
values
  ('66666666-6666-4666-8666-666666660001', '55555555-5555-4555-8555-555555550001', 0),
  ('66666666-6666-4666-8666-666666660001', '55555555-5555-4555-8555-555555550002', 1),
  ('66666666-6666-4666-8666-666666660002', '55555555-5555-4555-8555-555555550001', 0);

-- --- Grants (authenticated saja; anon tidak akses data tenant) ---

revoke all on schema plm from public;
grant usage on schema plm to authenticated;

revoke all on table plm.berkas_permohonan from public;
revoke all on table plm.pemilik_tanah from public;
revoke all on table plm.berkas_pemilik from public;

grant select, insert, update, delete on table plm.berkas_permohonan to authenticated;
grant select, insert, update, delete on table plm.pemilik_tanah to authenticated;
grant select, insert, update, delete on table plm.berkas_pemilik to authenticated;

-- --- RLS ---

alter table plm.berkas_permohonan enable row level security;
alter table plm.pemilik_tanah enable row level security;
alter table plm.berkas_pemilik enable row level security;

create policy "plm_berkas_select_member"
  on plm.berkas_permohonan for select to authenticated
  using (
    deleted_at is null
    and core_pm.is_project_member(berkas_permohonan.project_id)
  );

create policy "plm_berkas_insert_member"
  on plm.berkas_permohonan for insert to authenticated
  with check (core_pm.is_project_member(berkas_permohonan.project_id));

create policy "plm_berkas_update_member"
  on plm.berkas_permohonan for update to authenticated
  using (
    deleted_at is null
    and core_pm.is_project_member(berkas_permohonan.project_id)
  )
  with check (core_pm.is_project_member(berkas_permohonan.project_id));

create policy "plm_berkas_delete_member"
  on plm.berkas_permohonan for delete to authenticated
  using (core_pm.is_project_member(berkas_permohonan.project_id));

create policy "plm_pemilik_select_member"
  on plm.pemilik_tanah for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from core_pm.projects p
      where p.organization_id = pemilik_tanah.organization_id
        and p.deleted_at is null
        and core_pm.is_project_member(p.id)
    )
  );

create policy "plm_pemilik_insert_member"
  on plm.pemilik_tanah for insert to authenticated
  with check (
    exists (
      select 1
      from core_pm.projects p
      where p.organization_id = pemilik_tanah.organization_id
        and p.deleted_at is null
        and core_pm.is_project_member(p.id)
    )
  );

create policy "plm_pemilik_update_member"
  on plm.pemilik_tanah for update to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from core_pm.projects p
      where p.organization_id = pemilik_tanah.organization_id
        and p.deleted_at is null
        and core_pm.is_project_member(p.id)
    )
  )
  with check (
    exists (
      select 1
      from core_pm.projects p
      where p.organization_id = pemilik_tanah.organization_id
        and p.deleted_at is null
        and core_pm.is_project_member(p.id)
    )
  );

create policy "plm_pemilik_delete_member"
  on plm.pemilik_tanah for delete to authenticated
  using (
    exists (
      select 1
      from core_pm.projects p
      where p.organization_id = pemilik_tanah.organization_id
        and p.deleted_at is null
        and core_pm.is_project_member(p.id)
    )
  );

create policy "plm_berkas_pemilik_select_member"
  on plm.berkas_pemilik for select to authenticated
  using (
    exists (
      select 1
      from plm.berkas_permohonan b
      where b.id = berkas_pemilik.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_berkas_pemilik_insert_member"
  on plm.berkas_pemilik for insert to authenticated
  with check (
    exists (
      select 1
      from plm.berkas_permohonan b
      where b.id = berkas_pemilik.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
    and exists (
      select 1
      from plm.pemilik_tanah pt
      where pt.id = berkas_pemilik.pemilik_id
        and pt.deleted_at is null
        and exists (
          select 1
          from core_pm.projects p
          where p.organization_id = pt.organization_id
            and p.deleted_at is null
            and core_pm.is_project_member(p.id)
        )
    )
  );

create policy "plm_berkas_pemilik_update_member"
  on plm.berkas_pemilik for update to authenticated
  using (
    exists (
      select 1
      from plm.berkas_permohonan b
      where b.id = berkas_pemilik.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  )
  with check (
    exists (
      select 1
      from plm.berkas_permohonan b
      where b.id = berkas_pemilik.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_berkas_pemilik_delete_member"
  on plm.berkas_pemilik for delete to authenticated
  using (
    exists (
      select 1
      from plm.berkas_permohonan b
      where b.id = berkas_pemilik.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );
