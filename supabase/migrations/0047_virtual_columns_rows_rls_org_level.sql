-- Fix RLS policies pada virtual_columns dan virtual_rows
-- agar support org-level virtual tables (organization_id not null, project_id null).

-- =========================================================================
-- virtual_columns: drop & recreate semua policies
-- =========================================================================

drop policy if exists "virtual_columns_select_member" on core_pm.virtual_columns;
drop policy if exists "virtual_columns_insert_member" on core_pm.virtual_columns;
drop policy if exists "virtual_columns_update_member" on core_pm.virtual_columns;
drop policy if exists "virtual_columns_delete_member" on core_pm.virtual_columns;

create policy "virtual_columns_select_member"
  on core_pm.virtual_columns for select to authenticated
  using (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_columns.table_id
        and vt.deleted_at is null
        and (
          (vt.project_id is not null and core_pm.is_project_member(vt.project_id))
          or
          (vt.organization_id is not null and core_pm.is_org_member(vt.organization_id))
        )
    )
  );

create policy "virtual_columns_insert_member"
  on core_pm.virtual_columns for insert to authenticated
  with check (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_columns.table_id
        and vt.deleted_at is null
        and (
          (vt.project_id is not null and core_pm.is_project_member(vt.project_id))
          or
          (vt.organization_id is not null and core_pm.is_org_member(vt.organization_id))
        )
    )
  );

create policy "virtual_columns_update_member"
  on core_pm.virtual_columns for update to authenticated
  using (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_columns.table_id
        and vt.deleted_at is null
        and (
          (vt.project_id is not null and core_pm.is_project_member(vt.project_id))
          or
          (vt.organization_id is not null and core_pm.is_org_member(vt.organization_id))
        )
    )
  )
  with check (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_columns.table_id
        and vt.deleted_at is null
        and (
          (vt.project_id is not null and core_pm.is_project_member(vt.project_id))
          or
          (vt.organization_id is not null and core_pm.is_org_member(vt.organization_id))
        )
    )
  );

create policy "virtual_columns_delete_member"
  on core_pm.virtual_columns for delete to authenticated
  using (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_columns.table_id
        and vt.deleted_at is null
        and (
          (vt.project_id is not null and core_pm.is_project_member(vt.project_id))
          or
          (vt.organization_id is not null and core_pm.is_org_member(vt.organization_id))
        )
    )
  );

-- =========================================================================
-- virtual_rows: drop & recreate semua policies
-- =========================================================================

drop policy if exists "virtual_rows_select_member" on core_pm.virtual_rows;
drop policy if exists "virtual_rows_insert_member" on core_pm.virtual_rows;
drop policy if exists "virtual_rows_update_member" on core_pm.virtual_rows;
drop policy if exists "virtual_rows_delete_member" on core_pm.virtual_rows;

create policy "virtual_rows_select_member"
  on core_pm.virtual_rows for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_rows.table_id
        and vt.deleted_at is null
        and (
          (vt.project_id is not null and core_pm.is_project_member(vt.project_id))
          or
          (vt.organization_id is not null and core_pm.is_org_member(vt.organization_id))
        )
    )
  );

create policy "virtual_rows_insert_member"
  on core_pm.virtual_rows for insert to authenticated
  with check (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_rows.table_id
        and vt.deleted_at is null
        and (
          (vt.project_id is not null and core_pm.is_project_member(vt.project_id))
          or
          (vt.organization_id is not null and core_pm.is_org_member(vt.organization_id))
        )
    )
  );

create policy "virtual_rows_update_member"
  on core_pm.virtual_rows for update to authenticated
  using (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_rows.table_id
        and vt.deleted_at is null
        and (
          (vt.project_id is not null and core_pm.is_project_member(vt.project_id))
          or
          (vt.organization_id is not null and core_pm.is_org_member(vt.organization_id))
        )
    )
  )
  with check (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_rows.table_id
        and vt.deleted_at is null
        and (
          (vt.project_id is not null and core_pm.is_project_member(vt.project_id))
          or
          (vt.organization_id is not null and core_pm.is_org_member(vt.organization_id))
        )
    )
  );

create policy "virtual_rows_delete_member"
  on core_pm.virtual_rows for delete to authenticated
  using (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_rows.table_id
        and vt.deleted_at is null
        and (
          (vt.project_id is not null and core_pm.is_project_member(vt.project_id))
          or
          (vt.organization_id is not null and core_pm.is_org_member(vt.organization_id))
        )
    )
  );

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
