-- Tim inti organisasi vs hire project-only.
-- Staff org: organization_members → otomatis project_members (member) di semua project org.
-- Hire: hanya project_members; tabel org & master pemilik/alat hanya untuk staff.

-- ---------------------------------------------------------------------------
-- Tabel keanggotaan organisasi
-- ---------------------------------------------------------------------------
create table core_pm.organization_members (
  organization_id uuid not null
    references core_pm.organizations (id) on delete cascade,
  user_id uuid not null
    references core_pm.profiles (id) on delete cascade,
  role text not null
    check (role in ('owner', 'admin', 'staff')),
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index idx_organization_members_user
  on core_pm.organization_members (user_id);

comment on table core_pm.organization_members is
  'Karyawan inti organisasi; akses tabel org + otomatis anggota semua project (role member).';

comment on column core_pm.organization_members.role is
  'owner | admin | staff — bukan role project.';

-- ---------------------------------------------------------------------------
-- Helper akses
-- ---------------------------------------------------------------------------
create or replace function core_pm.has_org_staff_access(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core_pm, public
as $$
  select exists (
    select 1
    from core_pm.organization_members om
    where om.organization_id = p_org_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'staff')
  );
$$;

comment on function core_pm.has_org_staff_access(uuid) is
  'Karyawan inti (owner/admin/staff organisasi), bukan hire project-only.';

revoke all on function core_pm.has_org_staff_access(uuid) from public;
grant execute on function core_pm.has_org_staff_access(uuid) to authenticated;

-- Ganti definisi lama (anggota project mana pun di org dianggap org member).
create or replace function core_pm.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core_pm, public
as $$
  select core_pm.has_org_staff_access(p_org_id);
$$;

-- Sinkronkan semua staff org → project_members (member) di setiap project aktif.
create or replace function core_pm.sync_org_staff_to_all_projects(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
begin
  if p_org_id is null then
    return;
  end if;

  insert into core_pm.project_members (project_id, user_id, role)
  select p.id, om.user_id, 'member'
  from core_pm.projects p
  inner join core_pm.organization_members om
    on om.organization_id = p.organization_id
  where p.organization_id = p_org_id
    and p.deleted_at is null
    and om.role in ('owner', 'admin', 'staff')
  on conflict (project_id, user_id) do nothing;
end;
$$;

revoke all on function core_pm.sync_org_staff_to_all_projects(uuid) from public;
grant execute on function core_pm.sync_org_staff_to_all_projects(uuid) to authenticated;

create or replace function core_pm.trg_organization_members_sync_projects()
returns trigger
language plpgsql
security definer
set search_path = core_pm, public
as $$
begin
  perform core_pm.sync_org_staff_to_all_projects(
    coalesce(new.organization_id, old.organization_id)
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_organization_members_sync_projects on core_pm.organization_members;
create trigger trg_organization_members_sync_projects
  after insert or update of role, organization_id, user_id
  on core_pm.organization_members
  for each row
  execute procedure core_pm.trg_organization_members_sync_projects();

create or replace function core_pm.trg_projects_sync_org_staff()
returns trigger
language plpgsql
security definer
set search_path = core_pm, public
as $$
begin
  if new.organization_id is not null and new.deleted_at is null then
    perform core_pm.sync_org_staff_to_all_projects(new.organization_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_projects_sync_org_staff on core_pm.projects;
create trigger trg_projects_sync_org_staff
  after insert
  on core_pm.projects
  for each row
  execute procedure core_pm.trg_projects_sync_org_staff();

-- ---------------------------------------------------------------------------
-- RLS organization_members
-- ---------------------------------------------------------------------------
alter table core_pm.organization_members enable row level security;

create policy "organization_members_select"
  on core_pm.organization_members for select to authenticated
  using (
    user_id = auth.uid()
    or core_pm.has_org_staff_access(organization_id)
  );

-- Mutasi hanya lewat RPC security definer.

-- ---------------------------------------------------------------------------
-- RPC: tambah tim inti berdasarkan email
-- ---------------------------------------------------------------------------
create or replace function core_pm.add_organization_staff_by_email(
  p_organization_id uuid,
  p_email text,
  p_role text default 'staff'
)
returns uuid
language plpgsql
security definer
set search_path = core_pm, public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_target_user_id uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role text := lower(trim(coalesce(p_role, 'staff')));
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_organization_id is null then
    raise exception 'organization_id wajib diisi';
  end if;
  if v_email = '' then
    raise exception 'Email wajib diisi';
  end if;
  if v_role not in ('owner', 'admin', 'staff') then
    raise exception 'Role organisasi tidak valid';
  end if;

  if not exists (
    select 1
    from core_pm.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = v_uid
      and om.role in ('owner', 'admin')
  ) then
    raise exception 'Akses ditolak: hanya owner/admin organisasi yang dapat mengelola tim inti';
  end if;

  select u.id
    into v_target_user_id
  from auth.users u
  where lower(u.email) = v_email
  order by u.created_at asc
  limit 1;

  if v_target_user_id is null then
    raise exception 'User dengan email % tidak ditemukan', v_email;
  end if;

  insert into core_pm.organization_members (organization_id, user_id, role)
  values (p_organization_id, v_target_user_id, v_role)
  on conflict (organization_id, user_id)
  do update set role = excluded.role;

  perform core_pm.sync_org_staff_to_all_projects(p_organization_id);

  return v_target_user_id;
end;
$$;

comment on function core_pm.add_organization_staff_by_email(uuid, text, text) is
  'Tambah/ubah karyawan inti organisasi; sinkron ke semua project sebagai member.';

revoke all on function core_pm.add_organization_staff_by_email(uuid, text, text) from public;
grant execute on function core_pm.add_organization_staff_by_email(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap org: pembuat jadi owner organisasi + owner project (trigger project)
-- ---------------------------------------------------------------------------
create or replace function core_pm.create_organization_project_bootstrap(
  p_org_name text,
  p_org_slug text default null,
  p_project_name text default null,
  p_project_key text default null,
  p_project_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_org_id uuid;
  v_project_id uuid;
  v_slug_base text;
  v_slug text;
  v_key text;
  v_counter int := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if trim(coalesce(p_org_name, '')) = '' then
    raise exception 'Nama organisasi wajib diisi';
  end if;
  if trim(coalesce(p_project_name, '')) = '' then
    raise exception 'Nama project wajib diisi';
  end if;

  v_slug_base := lower(
    regexp_replace(
      coalesce(nullif(trim(p_org_slug), ''), trim(p_org_name)),
      '[^a-z0-9]+',
      '-',
      'g'
    )
  );
  v_slug_base := regexp_replace(v_slug_base, '(^-+|-+$)', '', 'g');
  if v_slug_base = '' then
    v_slug_base := 'org';
  end if;
  v_slug := left(v_slug_base, 48);
  loop
    exit when not exists (
      select 1 from core_pm.organizations o where o.slug = v_slug
    );
    v_counter := v_counter + 1;
    v_slug := left(v_slug_base, 48) || '-' || v_counter::text;
  end loop;

  v_key := upper(
    regexp_replace(
      coalesce(nullif(trim(p_project_key), ''), trim(p_project_name)),
      '[^A-Za-z0-9]+',
      '',
      'g'
    )
  );
  if v_key = '' then
    v_key := 'PRJ';
  end if;
  v_key := left(v_key, 12);

  insert into core_pm.organizations (name, slug)
  values (trim(p_org_name), v_slug)
  returning id into v_org_id;

  insert into core_pm.organization_members (organization_id, user_id, role)
  values (v_org_id, auth.uid(), 'owner')
  on conflict (organization_id, user_id) do update set role = excluded.role;

  insert into core_pm.projects (
    organization_id, name, key, description
  )
  values (
    v_org_id, trim(p_project_name), v_key, nullif(trim(coalesce(p_project_description, '')), '')
  )
  returning id into v_project_id;

  insert into core_pm.statuses (project_id, name, category, position, is_default)
  values
    (v_project_id, 'To Do', 'todo', 0, true),
    (v_project_id, 'Doing', 'in_progress', 1, false),
    (v_project_id, 'Done', 'done', 2, false);

  insert into core_pm.project_members (project_id, user_id, role)
  values (v_project_id, auth.uid(), 'owner')
  on conflict (project_id, user_id) do update set role = excluded.role;

  insert into core_pm.organization_modules (organization_id, module_code, is_enabled, enabled_at)
  select
    v_org_id,
    r.module_code,
    (r.module_code = 'core_pm') as is_enabled,
    case when r.module_code = 'core_pm' then now() else null end as enabled_at
  from core_pm.module_registry r
  on conflict (organization_id, module_code)
  do update
    set is_enabled = excluded.is_enabled,
        enabled_at = excluded.enabled_at;

  perform core_pm.sync_org_staff_to_all_projects(v_org_id);

  return v_project_id;
end;
$$;

-- Project baru di org: hanya tim inti; trigger sync staff + creator owner tetap di RPC.
create or replace function core_pm.create_project_in_organization(
  p_organization_id uuid,
  p_project_name text,
  p_project_key text default null,
  p_project_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_project_id uuid;
  v_key text;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_organization_id is null then
    raise exception 'organization_id wajib diisi';
  end if;
  if trim(coalesce(p_project_name, '')) = '' then
    raise exception 'Nama project wajib diisi';
  end if;

  if not core_pm.has_org_staff_access(p_organization_id) then
    raise exception 'Akses ditolak: hanya tim inti organisasi yang dapat membuat project';
  end if;

  v_key := upper(
    regexp_replace(
      coalesce(nullif(trim(p_project_key), ''), trim(p_project_name)),
      '[^A-Za-z0-9]+',
      '',
      'g'
    )
  );
  if v_key = '' then
    v_key := 'PRJ';
  end if;
  v_key := left(v_key, 12);

  insert into core_pm.projects (organization_id, name, key, description)
  values (
    p_organization_id,
    trim(p_project_name),
    v_key,
    nullif(trim(coalesce(p_project_description, '')), '')
  )
  returning id into v_project_id;

  insert into core_pm.statuses (project_id, name, category, position, is_default)
  values
    (v_project_id, 'To Do', 'todo', 0, true),
    (v_project_id, 'Doing', 'in_progress', 1, false),
    (v_project_id, 'Done', 'done', 2, false);

  insert into core_pm.project_members (project_id, user_id, role)
  values (v_project_id, v_uid, 'owner')
  on conflict (project_id, user_id) do update set role = excluded.role;

  perform core_pm.sync_org_staff_to_all_projects(p_organization_id);

  return v_project_id;
end;
$$;

-- Demo join: tim inti staff (bukan hire project-only).
create or replace function core_pm.join_demo_org_projects()
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_demo_org uuid := '11111111-1111-4111-8111-111111111111';
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if exists (select 1 from core_pm.project_members where user_id = auth.uid()) then
    return;
  end if;
  if exists (select 1 from core_pm.organization_members where user_id = auth.uid()) then
    return;
  end if;

  insert into core_pm.organization_members (organization_id, user_id, role)
  values (v_demo_org, auth.uid(), 'staff')
  on conflict (organization_id, user_id) do update set role = excluded.role;

  perform core_pm.sync_org_staff_to_all_projects(v_demo_org);
end;
$$;

-- Hire project-only (hanya project_members) tidak di-backfill ke organization_members.
-- Tambahkan tim inti lewat add_organization_staff_by_email atau join_demo (user baru).

-- ---------------------------------------------------------------------------
-- PLM master data: hanya tim inti organisasi
-- ---------------------------------------------------------------------------
drop policy if exists "plm_pemilik_select_member" on plm.pemilik_tanah;
create policy "plm_pemilik_select_member"
  on plm.pemilik_tanah for select to authenticated
  using (
    deleted_at is null
    and core_pm.has_org_staff_access(pemilik_tanah.organization_id)
  );

drop policy if exists "plm_pemilik_insert_member" on plm.pemilik_tanah;
create policy "plm_pemilik_insert_member"
  on plm.pemilik_tanah for insert to authenticated
  with check (core_pm.has_org_staff_access(pemilik_tanah.organization_id));

drop policy if exists "plm_pemilik_update_member" on plm.pemilik_tanah;
create policy "plm_pemilik_update_member"
  on plm.pemilik_tanah for update to authenticated
  using (
    deleted_at is null
    and core_pm.has_org_staff_access(pemilik_tanah.organization_id)
  )
  with check (core_pm.has_org_staff_access(pemilik_tanah.organization_id));

drop policy if exists "plm_pemilik_delete_member" on plm.pemilik_tanah;
create policy "plm_pemilik_delete_member"
  on plm.pemilik_tanah for delete to authenticated
  using (core_pm.has_org_staff_access(pemilik_tanah.organization_id));

drop policy if exists "plm_alat_select_member" on plm.alat_ukur;
create policy "plm_alat_select_member"
  on plm.alat_ukur for select to authenticated
  using (
    deleted_at is null
    and core_pm.has_org_staff_access(alat_ukur.organization_id)
  );

drop policy if exists "plm_alat_insert_member" on plm.alat_ukur;
create policy "plm_alat_insert_member"
  on plm.alat_ukur for insert to authenticated
  with check (core_pm.has_org_staff_access(alat_ukur.organization_id));

drop policy if exists "plm_alat_update_member" on plm.alat_ukur;
create policy "plm_alat_update_member"
  on plm.alat_ukur for update to authenticated
  using (
    deleted_at is null
    and core_pm.has_org_staff_access(alat_ukur.organization_id)
  )
  with check (core_pm.has_org_staff_access(alat_ukur.organization_id));

drop policy if exists "plm_alat_delete_member" on plm.alat_ukur;
create policy "plm_alat_delete_member"
  on plm.alat_ukur for delete to authenticated
  using (core_pm.has_org_staff_access(alat_ukur.organization_id));
