-- Org-level virtual tables: tabel custom yang bisa diakses lintas project
-- dalam satu organisasi (misal: Klien, Surveyor, Invoice).
--
-- Perubahan:
-- 1. Tambah kolom organization_id (nullable) di virtual_tables
-- 2. Buat project_id nullable (org-level table punya org_id tapi tidak project_id)
-- 3. Constraint: harus punya salah satu (organization_id XOR project_id)
-- 4. Update unique index slug agar terpisah per scope
-- 5. Update RLS policies

-- 1. Tambah organization_id
alter table core_pm.virtual_tables
  add column organization_id uuid references core_pm.organizations (id) on delete cascade;

-- 2. Buat project_id nullable
alter table core_pm.virtual_tables
  alter column project_id drop not null;

-- 3. Constraint: harus punya tepat salah satu scope
alter table core_pm.virtual_tables
  add constraint virtual_tables_scope_check
    check (
      (project_id is not null and organization_id is null)
      or
      (project_id is null and organization_id is not null)
    );

-- 4. Update unique indexes untuk slug
-- Drop old index dan buat 2 baru (per scope)
drop index if exists core_pm.uq_virtual_tables_project_slug;

create unique index uq_virtual_tables_project_slug
  on core_pm.virtual_tables (project_id, slug)
  where deleted_at is null and project_id is not null;

create unique index uq_virtual_tables_org_slug
  on core_pm.virtual_tables (organization_id, slug)
  where deleted_at is null and organization_id is not null;

-- Index untuk query org-level tables
create index idx_virtual_tables_organization
  on core_pm.virtual_tables (organization_id)
  where deleted_at is null and organization_id is not null;

-- 5. Update RLS policies
-- Drop existing policies
drop policy if exists "virtual_tables_select_member" on core_pm.virtual_tables;
drop policy if exists "virtual_tables_insert_member" on core_pm.virtual_tables;
drop policy if exists "virtual_tables_update_member" on core_pm.virtual_tables;
drop policy if exists "virtual_tables_delete_member" on core_pm.virtual_tables;

-- Helper: check if user is member of the organization
-- (user belongs to org if they are member of ANY project in that org)
create or replace function core_pm.is_org_member(p_org_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return false;
  end if;

  return exists (
    select 1
    from core_pm.project_members pm
    join core_pm.projects p on p.id = pm.project_id
    where p.organization_id = p_org_id
      and pm.user_id = v_uid
  );
end;
$$;

revoke all on function core_pm.is_org_member(uuid) from public;
grant execute on function core_pm.is_org_member(uuid) to authenticated;

-- Recreate policies: support both org-level and project-level
create policy "virtual_tables_select_member"
  on core_pm.virtual_tables for select to authenticated
  using (
    deleted_at is null
    and (
      (project_id is not null and core_pm.is_project_member(project_id))
      or
      (organization_id is not null and core_pm.is_org_member(organization_id))
    )
  );

create policy "virtual_tables_insert_member"
  on core_pm.virtual_tables for insert to authenticated
  with check (
    (project_id is not null and core_pm.is_project_member(project_id))
    or
    (organization_id is not null and core_pm.is_org_member(organization_id))
  );

create policy "virtual_tables_update_member"
  on core_pm.virtual_tables for update to authenticated
  using (
    (project_id is not null and core_pm.is_project_member(project_id))
    or
    (organization_id is not null and core_pm.is_org_member(organization_id))
  )
  with check (
    (project_id is not null and core_pm.is_project_member(project_id))
    or
    (organization_id is not null and core_pm.is_org_member(organization_id))
  );

create policy "virtual_tables_delete_member"
  on core_pm.virtual_tables for delete to authenticated
  using (
    (project_id is not null and core_pm.is_project_member(project_id))
    or
    (organization_id is not null and core_pm.is_org_member(organization_id))
  );

-- Update virtual_rows & virtual_columns policies to also handle org-level tables
-- (The existing policies join to virtual_tables which now handles both scopes,
--  so they should continue to work. But we also update the soft-delete RPC.)

-- Update soft_delete_virtual_row to support org-level tables
create or replace function core_pm.soft_delete_virtual_row(p_row_id uuid)
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid;
  v_project_id uuid;
  v_org_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Belum masuk';
  end if;

  select vt.project_id, vt.organization_id into v_project_id, v_org_id
  from core_pm.virtual_rows vr
  join core_pm.virtual_tables vt on vt.id = vr.table_id
  where vr.id = p_row_id
    and vr.deleted_at is null
    and vt.deleted_at is null;

  if v_project_id is null and v_org_id is null then
    raise exception 'Baris tidak ditemukan';
  end if;

  if v_project_id is not null and not core_pm.is_project_member(v_project_id) then
    raise exception 'Tidak punya akses ke project ini';
  end if;

  if v_org_id is not null and not core_pm.is_org_member(v_org_id) then
    raise exception 'Tidak punya akses ke organisasi ini';
  end if;

  update core_pm.virtual_rows
  set deleted_at = now(), updated_at = now()
  where id = p_row_id
    and deleted_at is null;
end;
$$;

-- Update soft_delete_virtual_table to support org-level tables
create or replace function core_pm.soft_delete_virtual_table(p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid;
  v_project_id uuid;
  v_org_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Belum masuk';
  end if;

  select project_id, organization_id into v_project_id, v_org_id
  from core_pm.virtual_tables
  where id = p_table_id
    and deleted_at is null;

  if v_project_id is null and v_org_id is null then
    raise exception 'Tabel tidak ditemukan';
  end if;

  if v_project_id is not null and not core_pm.is_project_member(v_project_id) then
    raise exception 'Tidak punya akses ke project ini';
  end if;

  if v_org_id is not null and not core_pm.is_org_member(v_org_id) then
    raise exception 'Tidak punya akses ke organisasi ini';
  end if;

  update core_pm.virtual_rows
  set deleted_at = now(), updated_at = now()
  where table_id = p_table_id
    and deleted_at is null;

  update core_pm.virtual_tables
  set deleted_at = now(), updated_at = now()
  where id = p_table_id
    and deleted_at is null;
end;
$$;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
