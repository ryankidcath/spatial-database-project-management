-- Owner project: perbaikan seed demo, join demo, hapus project, kelola anggota.
-- Recovery: project tanpa owner → anggota boleh hapus / kelola anggota; join demo → owner jika belum ada.

create or replace function core_pm.project_has_owner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core_pm, public
as $$
  select exists (
    select 1
    from core_pm.project_members pm
    where pm.project_id = p_project_id
      and pm.role = 'owner'
  );
$$;

comment on function core_pm.project_has_owner(uuid) is
  'True jika project punya minimal satu baris project_members dengan role owner.';

revoke all on function core_pm.project_has_owner(uuid) from public;
grant execute on function core_pm.project_has_owner(uuid) to authenticated;

-- User baru tanpa keanggotaan: masuk ke project KJSB Demo.
-- Per project: owner jika belum ada owner; selain itu member.
create or replace function core_pm.join_demo_org_projects()
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  r record;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if exists (select 1 from core_pm.project_members where user_id = auth.uid()) then
    return;
  end if;

  for r in
    select p.id as project_id
    from core_pm.projects p
    where p.organization_id = '11111111-1111-4111-8111-111111111111'
      and p.deleted_at is null
  loop
    if core_pm.project_has_owner(r.project_id) then
      v_role := 'member';
    else
      v_role := 'owner';
    end if;

    insert into core_pm.project_members (project_id, user_id, role)
    values (r.project_id, auth.uid(), v_role)
    on conflict (project_id, user_id) do update set role = excluded.role;
  end loop;
end;
$$;

-- Backfill: project demo yang punya anggota tapi tanpa owner → angkat anggota terlama jadi owner.
with orphan_projects as (
  select p.id as project_id
  from core_pm.projects p
  where p.organization_id = '11111111-1111-4111-8111-111111111111'
    and p.deleted_at is null
    and not core_pm.project_has_owner(p.id)
    and exists (
      select 1 from core_pm.project_members pm where pm.project_id = p.id
    )
),
first_member as (
  select distinct on (op.project_id)
    op.project_id,
    pm.user_id
  from orphan_projects op
  inner join core_pm.project_members pm on pm.project_id = op.project_id
  order by op.project_id, pm.joined_at asc nulls last, pm.user_id
)
update core_pm.project_members pm
set role = 'owner'
from first_member fm
where pm.project_id = fm.project_id
  and pm.user_id = fm.user_id
  and pm.role is distinct from 'owner';

create or replace function core_pm.delete_project_soft(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_owner boolean := false;
  v_is_member boolean := false;
  v_has_owner boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select core_pm.project_has_owner(p_project_id) into v_has_owner;

  select exists (
    select 1
    from core_pm.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = v_uid
      and pm.role = 'owner'
  )
  into v_is_owner;

  select exists (
    select 1
    from core_pm.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = v_uid
  )
  into v_is_member;

  if v_is_owner then
    null;
  elsif not v_has_owner and v_is_member then
    null;
  else
    raise exception 'Hanya owner project yang bisa menghapus project.';
  end if;

  update core_pm.projects
  set deleted_at = now()
  where id = p_project_id
    and deleted_at is null;
end;
$$;

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
  v_has_owner boolean;
  v_is_owner boolean;
  v_is_member boolean;
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

  select core_pm.project_has_owner(p_project_id) into v_has_owner;

  select exists (
    select 1
    from core_pm.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = v_uid
      and pm.role = 'owner'
  )
  into v_is_owner;

  select exists (
    select 1
    from core_pm.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = v_uid
  )
  into v_is_member;

  if v_is_owner then
    null;
  elsif not v_has_owner and v_is_member then
    null;
  else
    raise exception 'Akses ditolak: hanya owner project yang dapat mengelola anggota';
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
