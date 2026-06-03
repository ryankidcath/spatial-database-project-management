-- Beri rizki@kjsbbenning.id akses penuh organisasi KJSB Demo (superseded by 0053 untuk semua org).

do $$
declare
  v_uid uuid;
  v_org_id uuid := '11111111-1111-4111-8111-111111111111';
  v_email text := 'rizki@kjsbbenning.id';
begin
  select u.id into v_uid
  from auth.users u
  where lower(u.email) = lower(v_email)
  order by u.created_at asc
  limit 1;

  if v_uid is null then
    raise exception
      'User % belum ada di auth.users — login/daftar sekali dulu, lalu jalankan ulang migration ini.',
      v_email;
  end if;

  insert into core_pm.organization_members (organization_id, user_id, role)
  values (v_org_id, v_uid, 'owner')
  on conflict (organization_id, user_id)
  do update set role = excluded.role;

  perform core_pm.sync_org_staff_to_all_projects(v_org_id);

  update core_pm.project_members pm
  set role = 'owner'
  from core_pm.projects p
  where pm.project_id = p.id
    and p.organization_id = v_org_id
    and p.deleted_at is null
    and pm.user_id = v_uid;

  insert into core_pm.project_members (project_id, user_id, role)
  select p.id, v_uid, 'owner'
  from core_pm.projects p
  where p.organization_id = v_org_id
    and p.deleted_at is null
  on conflict (project_id, user_id)
  do update set role = 'owner';
end;
$$;
