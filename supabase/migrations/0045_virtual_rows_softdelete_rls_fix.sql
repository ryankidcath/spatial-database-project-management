-- Fix: soft-delete via UPDATE pada virtual_rows diblokir oleh RLS WITH CHECK.
-- Solusi: RPC SECURITY DEFINER yang bypass RLS tapi tetap validasi akses.

-- 1. RPC untuk soft-delete virtual_row
create or replace function core_pm.soft_delete_virtual_row(p_row_id uuid)
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid;
  v_project_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Belum masuk';
  end if;

  select vt.project_id into v_project_id
  from core_pm.virtual_rows vr
  join core_pm.virtual_tables vt on vt.id = vr.table_id
  where vr.id = p_row_id
    and vr.deleted_at is null
    and vt.deleted_at is null;

  if v_project_id is null then
    raise exception 'Baris tidak ditemukan';
  end if;

  if not core_pm.is_project_member(v_project_id) then
    raise exception 'Tidak punya akses ke project ini';
  end if;

  update core_pm.virtual_rows
  set deleted_at = now(), updated_at = now()
  where id = p_row_id
    and deleted_at is null;
end;
$$;

revoke all on function core_pm.soft_delete_virtual_row(uuid) from public;
grant execute on function core_pm.soft_delete_virtual_row(uuid) to authenticated;

-- 2. RPC untuk soft-delete virtual_table (beserta rows-nya)
create or replace function core_pm.soft_delete_virtual_table(p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid;
  v_project_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Belum masuk';
  end if;

  select project_id into v_project_id
  from core_pm.virtual_tables
  where id = p_table_id
    and deleted_at is null;

  if v_project_id is null then
    raise exception 'Tabel tidak ditemukan';
  end if;

  if not core_pm.is_project_member(v_project_id) then
    raise exception 'Tidak punya akses ke project ini';
  end if;

  update core_pm.virtual_rows
  set deleted_at = now(), updated_at = now()
  where table_id = p_table_id
    and deleted_at is null;

  update core_pm.virtual_tables
  set deleted_at = now(), updated_at = now()
  where id = p_table_id
    and deleted_at is null;
end;
$$;

revoke all on function core_pm.soft_delete_virtual_table(uuid) from public;
grant execute on function core_pm.soft_delete_virtual_table(uuid) to authenticated;

-- Reload PostgREST schema cache agar function baru langsung tersedia
notify pgrst, 'reload schema';
