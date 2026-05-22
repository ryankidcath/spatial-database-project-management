-- Virtual Views: saved view configurations per virtual table.
-- Stores filter, sort, group-by, and column visibility settings.

create table core_pm.virtual_views (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references core_pm.virtual_tables (id) on delete cascade,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint virtual_views_name_not_blank
    check (length(trim(name)) > 0),
  constraint virtual_views_config_object
    check (jsonb_typeof(config) = 'object')
);

create index idx_virtual_views_table
  on core_pm.virtual_views (table_id);

comment on table core_pm.virtual_views is
  'Saved view configurations (filters, sorts, groupBy, column visibility) per virtual table.';

comment on column core_pm.virtual_views.config is
  'JSON: { filters: [{column, operator, value}], sorts: [{column, direction}], groupBy: string|null, visibleColumns: string[], columnWidths: {} }';

-- Grants
revoke all on table core_pm.virtual_views from public;
revoke all on table core_pm.virtual_views from anon;
grant select, insert, update, delete on table core_pm.virtual_views to authenticated;

-- RLS (access via parent virtual_table → project membership)
alter table core_pm.virtual_views enable row level security;

create policy "virtual_views_select_member"
  on core_pm.virtual_views for select to authenticated
  using (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_views.table_id
        and vt.deleted_at is null
        and core_pm.is_project_member(vt.project_id)
    )
  );

create policy "virtual_views_insert_member"
  on core_pm.virtual_views for insert to authenticated
  with check (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_views.table_id
        and vt.deleted_at is null
        and core_pm.is_project_member(vt.project_id)
    )
  );

create policy "virtual_views_update_member"
  on core_pm.virtual_views for update to authenticated
  using (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_views.table_id
        and vt.deleted_at is null
        and core_pm.is_project_member(vt.project_id)
    )
  )
  with check (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_views.table_id
        and vt.deleted_at is null
        and core_pm.is_project_member(vt.project_id)
    )
  );

create policy "virtual_views_delete_member"
  on core_pm.virtual_views for delete to authenticated
  using (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_views.table_id
        and vt.deleted_at is null
        and core_pm.is_project_member(vt.project_id)
    )
  );
