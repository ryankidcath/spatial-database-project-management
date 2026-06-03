-- Owner/admin organisasi boleh mengelola semua project di org itu (anggota, hapus, rename).
-- Hire project-only tetap terbatas pada project mereka.

create or replace function core_pm.is_org_admin(p_org_id uuid)
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
      and om.role in ('owner', 'admin')
  );
$$;

comment on function core_pm.is_org_admin(uuid) is
  'True jika user adalah owner atau admin organisasi.';

revoke all on function core_pm.is_org_admin(uuid) from public;
grant execute on function core_pm.is_org_admin(uuid) to authenticated;

create or replace function core_pm.can_administer_project(p_project_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_has_project_owner boolean;
begin
  if v_uid is null or p_project_id is null then
    return false;
  end if;

  if exists (
    select 1
    from core_pm.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = v_uid
      and pm.role = 'owner'
  ) then
    return true;
  end if;

  select p.organization_id into v_org_id
  from core_pm.projects p
  where p.id = p_project_id
    and p.deleted_at is null;

  if v_org_id is not null and core_pm.is_org_admin(v_org_id) then
    return true;
  end if;

  select core_pm.project_has_owner(p_project_id) into v_has_project_owner;

  if not v_has_project_owner and exists (
    select 1
    from core_pm.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = v_uid
  ) then
    return true;
  end if;

  return false;
end;
$$;

comment on function core_pm.can_administer_project(uuid) is
  'Owner project, owner/admin org, atau recovery project tanpa owner.';

revoke all on function core_pm.can_administer_project(uuid) from public;
grant execute on function core_pm.can_administer_project(uuid) to authenticated;

create or replace function core_pm.add_project_member_by_email(
  p_project_id uuid,
  p_email text,
  p_role text default 'member'
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
  v_role text := lower(trim(coalesce(p_role, 'member')));
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_project_id is null then
    raise exception 'project_id wajib diisi';
  end if;
  if v_email = '' then
    raise exception 'Email wajib diisi';
  end if;
  if v_role not in ('owner', 'member') then
    raise exception 'Role tidak valid';
  end if;

  if not core_pm.can_administer_project(p_project_id) then
    raise exception 'Akses ditolak: hanya owner project atau admin organisasi yang dapat mengelola anggota';
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

  insert into core_pm.project_members (project_id, user_id, role)
  values (p_project_id, v_target_user_id, v_role)
  on conflict (project_id, user_id)
  do update set role = excluded.role;

  return v_target_user_id;
end;
$$;

create or replace function core_pm.delete_project_soft(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not core_pm.can_administer_project(p_project_id) then
    raise exception 'Hanya owner project yang bisa menghapus project.';
  end if;

  update core_pm.projects
  set deleted_at = now()
  where id = p_project_id
    and deleted_at is null;
end;
$$;

create or replace function core_pm.update_project_properties(
  p_project_id uuid,
  p_name text,
  p_description text,
  p_hierarchy_labels jsonb
)
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid := auth.uid();
  v_old_name text;
  v_old_desc text;
  v_can_admin boolean;
  v_name text;
  v_desc text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not core_pm.is_project_member(p_project_id) then
    raise exception 'Tidak punya akses project';
  end if;

  select p.name, p.description
  into v_old_name, v_old_desc
  from core_pm.projects p
  where p.id = p_project_id
    and p.deleted_at is null;

  if not found then
    raise exception 'Project tidak ditemukan atau sudah dihapus';
  end if;

  v_name := trim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'Nama project tidak boleh kosong';
  end if;

  v_desc := nullif(trim(coalesce(p_description, '')), '');

  v_can_admin := core_pm.can_administer_project(p_project_id);

  if (v_old_name is distinct from v_name) or (v_old_desc is distinct from v_desc) then
    if not v_can_admin then
      raise exception 'Hanya owner project atau admin organisasi yang bisa mengubah nama atau deskripsi.';
    end if;
  end if;

  if p_hierarchy_labels is null or jsonb_typeof(p_hierarchy_labels) <> 'object' then
    raise exception 'hierarchy_labels harus objek JSON';
  end if;

  update core_pm.projects
  set
    name = v_name,
    description = v_desc,
    hierarchy_labels = p_hierarchy_labels,
    updated_at = now()
  where id = p_project_id
    and deleted_at is null;
end;
$$;

-- rizki@kjsbbenning.id: owner semua project (termasuk yang dibuat setelah 0053)
do $$
declare
  v_uid uuid;
  v_org record;
  v_email text := 'rizki@kjsbbenning.id';
begin
  select u.id into v_uid
  from auth.users u
  where lower(u.email) = lower(v_email)
  order by u.created_at asc
  limit 1;

  if v_uid is null then
    raise notice 'Skip: user % not in auth.users', v_email;
    return;
  end if;

  for v_org in
    select o.id from core_pm.organizations o where o.deleted_at is null
  loop
    insert into core_pm.organization_members (organization_id, user_id, role)
    values (v_org.id, v_uid, 'owner')
    on conflict (organization_id, user_id) do update set role = excluded.role;

    perform core_pm.sync_org_staff_to_all_projects(v_org.id);

    insert into core_pm.project_members (project_id, user_id, role)
    select p.id, v_uid, 'owner'
    from core_pm.projects p
    where p.organization_id = v_org.id
      and p.deleted_at is null
    on conflict (project_id, user_id) do update set role = 'owner';
  end loop;
end;
$$;
