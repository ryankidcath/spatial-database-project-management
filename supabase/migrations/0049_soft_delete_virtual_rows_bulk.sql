-- Bulk soft-delete virtual rows (filter-based delete from UI)

create or replace function core_pm.soft_delete_virtual_rows(
  p_table_id uuid,
  p_row_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid;
  v_project_id uuid;
  v_org_id uuid;
  v_deleted integer;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Belum masuk';
  end if;

  if p_table_id is null then
    raise exception 'table_id kosong';
  end if;

  if p_row_ids is null or cardinality(p_row_ids) = 0 then
    raise exception 'Tidak ada baris yang dipilih';
  end if;

  select vt.project_id, vt.organization_id
    into v_project_id, v_org_id
  from core_pm.virtual_tables vt
  where vt.id = p_table_id
    and vt.deleted_at is null;

  if not found then
    raise exception 'Tabel tidak ditemukan';
  end if;

  if v_project_id is not null and not core_pm.is_project_member(v_project_id) then
    raise exception 'Tidak punya akses ke project ini';
  end if;

  if v_org_id is not null and not core_pm.is_org_member(v_org_id) then
    raise exception 'Tidak punya akses ke organisasi ini';
  end if;

  update core_pm.virtual_rows vr
  set deleted_at = now(),
      updated_at = now()
  from core_pm.virtual_tables vt
  where vr.id = any (p_row_ids)
    and vr.table_id = p_table_id
    and vr.table_id = vt.id
    and vr.deleted_at is null
    and vt.deleted_at is null
    and (
      (vt.project_id is not null and core_pm.is_project_member(vt.project_id))
      or (vt.organization_id is not null and core_pm.is_org_member(vt.organization_id))
    );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function core_pm.soft_delete_virtual_rows(uuid, uuid[]) to authenticated;
