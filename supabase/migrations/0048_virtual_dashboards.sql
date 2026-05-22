-- Custom dashboards per project (widget layout + config stored as JSON).

create table core_pm.virtual_dashboards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references core_pm.projects (id) on delete cascade,
  name text not null default 'Dashboard',
  widgets jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint virtual_dashboards_name_not_blank check (length(trim(name)) > 0),
  constraint virtual_dashboards_widgets_array check (jsonb_typeof(widgets) = 'array')
);

create unique index uq_virtual_dashboards_project
  on core_pm.virtual_dashboards (project_id);

create index idx_virtual_dashboards_project
  on core_pm.virtual_dashboards (project_id);

comment on table core_pm.virtual_dashboards is
  'Per-project customizable dashboard: widgets array with type, title, config, layout width.';

comment on column core_pm.virtual_dashboards.widgets is
  'JSON array: [{ id, type, title, w, config }] — types: stat, status_pie, bar_by_group, table_preview, header';

revoke all on table core_pm.virtual_dashboards from public;
revoke all on table core_pm.virtual_dashboards from anon;
grant select, insert, update, delete on table core_pm.virtual_dashboards to authenticated;

alter table core_pm.virtual_dashboards enable row level security;

create policy "virtual_dashboards_select_member"
  on core_pm.virtual_dashboards for select to authenticated
  using (core_pm.is_project_member(project_id));

create policy "virtual_dashboards_insert_member"
  on core_pm.virtual_dashboards for insert to authenticated
  with check (core_pm.is_project_member(project_id));

create policy "virtual_dashboards_update_member"
  on core_pm.virtual_dashboards for update to authenticated
  using (core_pm.is_project_member(project_id))
  with check (core_pm.is_project_member(project_id));

create policy "virtual_dashboards_delete_member"
  on core_pm.virtual_dashboards for delete to authenticated
  using (core_pm.is_project_member(project_id));

notify pgrst, 'reload schema';
