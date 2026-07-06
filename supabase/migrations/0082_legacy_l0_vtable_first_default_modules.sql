-- L0 legacy sunset: org baru vtable-first (core_pm + spatial); blok aktivasi plm/finance baru.

create or replace function core_pm.set_organization_module_enabled(
  p_organization_id uuid,
  p_module_code text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not core_pm.is_organization_member(p_organization_id) then
    raise exception 'Bukan anggota organisasi ini';
  end if;

  v_code := lower(trim(p_module_code));
  if v_code is null or v_code = '' then
    raise exception 'module_code tidak valid';
  end if;

  if v_code = 'core_pm' then
    if p_enabled is distinct from true then
      raise exception 'Modul core_pm tidak boleh dinonaktifkan';
    end if;
    return;
  end if;

  if not exists (select 1 from core_pm.module_registry r where r.module_code = v_code) then
    raise exception 'Modul tidak dikenal: %', v_code;
  end if;

  -- L0: modul legacy tidak boleh diaktifkan untuk org yang belum pernah mengaktifkannya.
  if v_code in ('plm', 'finance') and p_enabled then
    if not exists (
      select 1
      from core_pm.organization_modules om
      where om.organization_id = p_organization_id
        and om.module_code = v_code
        and om.is_enabled = true
    ) then
      raise exception
        'Modul % sudah tidak tersedia untuk organisasi baru (sunset legacy). Nonaktifkan saja; untuk migrasi data hubungi admin.',
        v_code;
    end if;
  end if;

  if p_enabled then
    insert into core_pm.organization_modules (organization_id, module_code, is_enabled, enabled_at)
    values (p_organization_id, v_code, true, now())
    on conflict (organization_id, module_code)
    do update set is_enabled = true, enabled_at = now();
  else
    update core_pm.organization_modules
    set is_enabled = false, enabled_at = null
    where organization_id = p_organization_id
      and module_code = v_code;
  end if;
end;
$$;

comment on function core_pm.set_organization_module_enabled(uuid, text, boolean) is
  'Aktif/nonaktif modul opsional; plm/finance tidak bisa diaktifkan ulang untuk org baru (L0 sunset).';

-- Bootstrap org baru: hanya core_pm + spatial (tanpa plm/finance).
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
    (r.module_code in ('core_pm', 'spatial')) as is_enabled,
    case when r.module_code in ('core_pm', 'spatial') then now() else null end as enabled_at
  from core_pm.module_registry r
  on conflict (organization_id, module_code)
  do update
    set is_enabled = excluded.is_enabled,
        enabled_at = excluded.enabled_at;

  perform core_pm.sync_org_staff_to_all_projects(v_org_id);

  return v_project_id;
end;
$$;

comment on function core_pm.create_organization_project_bootstrap(text, text, text, text, text) is
  'Bootstrap org + project; default aktif: core_pm dan spatial (vtable-first, L0).';

update core_pm.module_registry
set description = case module_code
  when 'plm' then 'Sunset — berkas & pengukuran legacy. Tidak untuk org baru.'
  when 'finance' then 'Sunset — invoice legacy. Tidak untuk org baru.'
  else description
end
where module_code in ('plm', 'finance');
