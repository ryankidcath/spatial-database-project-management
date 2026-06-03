-- rizki@kjsbbenning.id: owner semua organisasi aktif + owner semua project di dalamnya.

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
    raise exception
      'User % belum ada di auth.users — login/daftar sekali dulu, lalu jalankan ulang migration ini.',
      v_email;
  end if;

  for v_org in
    select o.id
    from core_pm.organizations o
    where o.deleted_at is null
    order by o.name
  loop
    insert into core_pm.organization_members (organization_id, user_id, role)
    values (v_org.id, v_uid, 'owner')
    on conflict (organization_id, user_id)
    do update set role = excluded.role;

    perform core_pm.sync_org_staff_to_all_projects(v_org.id);

    update core_pm.project_members pm
    set role = 'owner'
    from core_pm.projects p
    where pm.project_id = p.id
      and p.organization_id = v_org.id
      and p.deleted_at is null
      and pm.user_id = v_uid;

    insert into core_pm.project_members (project_id, user_id, role)
    select p.id, v_uid, 'owner'
    from core_pm.projects p
    where p.organization_id = v_org.id
      and p.deleted_at is null
    on conflict (project_id, user_id)
    do update set role = 'owner';
  end loop;
end;
$$;
