-- Fase 7 operasional: owner project bisa menambah member berdasarkan email.

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

  -- Hanya owner project yang boleh menambah/mengubah anggota project.
  if not exists (
    select 1
    from core_pm.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = v_uid
      and pm.role = 'owner'
  ) then
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

comment on function core_pm.add_project_member_by_email(uuid, text, text) is
  'Tambah atau ubah role anggota project berdasarkan email; hanya owner project.';

revoke all on function core_pm.add_project_member_by_email(uuid, text, text) from public;
grant execute on function core_pm.add_project_member_by_email(uuid, text, text) to authenticated;
