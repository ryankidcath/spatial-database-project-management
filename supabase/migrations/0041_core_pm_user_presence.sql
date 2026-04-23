create table if not exists core_pm.user_presence (
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references core_pm.projects (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

create index if not exists idx_core_pm_user_presence_project_seen
  on core_pm.user_presence (project_id, last_seen_at desc);

revoke all on table core_pm.user_presence from public;
revoke all on table core_pm.user_presence from anon;
grant select, insert, update on table core_pm.user_presence to authenticated;

alter table core_pm.user_presence enable row level security;

create policy "core_pm_user_presence_select_scoped"
  on core_pm.user_presence for select to authenticated
  using (
    core_pm.is_project_member(project_id)
  );

create policy "core_pm_user_presence_upsert_self"
  on core_pm.user_presence for insert to authenticated
  with check (
    user_id = auth.uid() and core_pm.is_project_member(project_id)
  );

create policy "core_pm_user_presence_update_self"
  on core_pm.user_presence for update to authenticated
  using (
    user_id = auth.uid() and core_pm.is_project_member(project_id)
  )
  with check (
    user_id = auth.uid() and core_pm.is_project_member(project_id)
  );
