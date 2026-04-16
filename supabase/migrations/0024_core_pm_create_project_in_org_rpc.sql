-- Fase 7 operasional: tambah project baru pada organisasi yang sudah diakses user.

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

  -- User harus sudah anggota minimal satu project di organisasi tsb.
  if not exists (
    select 1
    from core_pm.projects p
    join core_pm.project_members pm on pm.project_id = p.id
    where p.organization_id = p_organization_id
      and pm.user_id = v_uid
  ) then
    raise exception 'Akses ditolak: Anda bukan anggota organisasi ini';
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

  return v_project_id;
end;
$$;

comment on function core_pm.create_project_in_organization(uuid, text, text, text) is
  'Tambah project baru di organisasi yang sudah diakses user; auto-seed status + owner membership.';

revoke all on function core_pm.create_project_in_organization(uuid, text, text, text) from public;
grant execute on function core_pm.create_project_in_organization(uuid, text, text, text) to authenticated;
