-- Pastikan tab Map tidak hilang untuk org baru:
-- spatial diaktifkan default bersama core_pm.
-- Juga backfill org existing yang sudah punya module row spatial.

update core_pm.organization_modules
set
  is_enabled = true,
  enabled_at = coalesce(enabled_at, now())
where module_code = 'spatial'
  and is_enabled = false;

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
    (r.module_code in ('core_pm', 'spatial')) as is_enabled,
    case when r.module_code in ('core_pm', 'spatial') then now() else null end as enabled_at
  from core_pm.module_registry r
  on conflict (organization_id, module_code)
  do update
    set is_enabled = excluded.is_enabled,
        enabled_at = excluded.enabled_at;

  return v_project_id;
end;
$$;

comment on function core_pm.create_organization_project_bootstrap(text, text, text, text, text) is
  'Bootstrap org + project + status + modul; default aktif: core_pm dan spatial.';

