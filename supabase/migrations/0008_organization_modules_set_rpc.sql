-- Fase 2 slice F2-4: mutasi organization_modules lewat RPC (anggota org saja); lindungi core_pm

create or replace function core_pm.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core_pm, public
as $$
  select exists (
    select 1
    from core_pm.projects p
    inner join core_pm.project_members pm on pm.project_id = p.id
    where p.organization_id = p_organization_id
      and p.deleted_at is null
      and pm.user_id = (select auth.uid())
  );
$$;

comment on function core_pm.is_organization_member(uuid) is
  'True jika user anggota minimal satu project di organisasi (untuk RPC modul).';

revoke all on function core_pm.is_organization_member(uuid) from public;
grant execute on function core_pm.is_organization_member(uuid) to authenticated;

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
  'Aktif/nonaktif modul opsional per organisasi; hanya anggota project di org tersebut.';

revoke all on function core_pm.set_organization_module_enabled(uuid, text, boolean) from public;
grant execute on function core_pm.set_organization_module_enabled(uuid, text, boolean) to authenticated;
