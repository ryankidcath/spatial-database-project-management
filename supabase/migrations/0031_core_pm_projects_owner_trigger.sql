-- Pembuat project harus selalu punya baris owner di project_members.
-- Trigger SECURITY DEFINER memastikan insert ke project_members jalan meski
-- RLS / urutan statement di RPC bermasalah (kasus: project ada, members kosong,
-- lalu + Anggota gagal karena caller bukan owner di DB).

drop trigger if exists trg_projects_assign_creator_owner on core_pm.projects;

create or replace function core_pm.trg_projects_assign_creator_owner()
returns trigger
language plpgsql
security definer
set search_path = core_pm, public, auth
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if (select auth.uid()) is not null then
    insert into core_pm.project_members (project_id, user_id, role)
    values (new.id, (select auth.uid()), 'owner')
    on conflict (project_id, user_id)
    do update set role = excluded.role;
  end if;
  return new;
end;
$$;

comment on function core_pm.trg_projects_assign_creator_owner() is
  'Setelah insert project: pastikan auth.uid() jadi owner di project_members.';

create trigger trg_projects_assign_creator_owner
  after insert on core_pm.projects
  for each row
  execute procedure core_pm.trg_projects_assign_creator_owner();

-- RPC: sisipkan project saja; owner diurus trigger. Hapus set_config agar tidak
-- bergantung pada hak superuser untuk row_security.

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

  return v_project_id;
end;
$$;

comment on function core_pm.create_project_in_organization(uuid, text, text, text) is
  'Tambah project + status default; owner membership via trigger trg_projects_assign_creator_owner.';

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

  return v_project_id;
end;
$$;

comment on function core_pm.create_organization_project_bootstrap(text, text, text, text, text) is
  'Bootstrap org + project + status + modul; owner membership via trigger.';
