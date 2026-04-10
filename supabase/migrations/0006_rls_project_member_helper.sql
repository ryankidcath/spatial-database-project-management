-- Perbaikan: policy yang subquery ke project_members memicu infinite recursion pada relasi yang sama.
-- Helper SECURITY DEFINER membaca project_members di luar RLS (owner/superuser).

create or replace function core_pm.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core_pm, public
as $$
  select exists (
    select 1
    from core_pm.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = (select auth.uid())
  );
$$;

comment on function core_pm.is_project_member(uuid) is
  'Cek keanggotaan project; dipakai policy RLS agar tidak rekursif ke project_members.';

revoke all on function core_pm.is_project_member(uuid) from public;
grant execute on function core_pm.is_project_member(uuid) to authenticated;

-- Ganti policy yang memakai EXISTS ke project_members
drop policy if exists "core_pm_org_select_member" on core_pm.organizations;
create policy "core_pm_org_select_member"
  on core_pm.organizations for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from core_pm.projects p
      where p.organization_id = organizations.id
        and p.deleted_at is null
        and core_pm.is_project_member(p.id)
    )
  );

drop policy if exists "core_pm_projects_select_member" on core_pm.projects;
create policy "core_pm_projects_select_member"
  on core_pm.projects for select to authenticated
  using (
    deleted_at is null
    and core_pm.is_project_member(projects.id)
  );

drop policy if exists "core_pm_statuses_select_member" on core_pm.statuses;
create policy "core_pm_statuses_select_member"
  on core_pm.statuses for select to authenticated
  using (core_pm.is_project_member(statuses.project_id));

drop policy if exists "core_pm_issues_select_member" on core_pm.issues;
drop policy if exists "core_pm_issues_insert_member" on core_pm.issues;
drop policy if exists "core_pm_issues_update_member" on core_pm.issues;
drop policy if exists "core_pm_issues_delete_member" on core_pm.issues;

create policy "core_pm_issues_select_member"
  on core_pm.issues for select to authenticated
  using (
    deleted_at is null
    and core_pm.is_project_member(issues.project_id)
  );

create policy "core_pm_issues_insert_member"
  on core_pm.issues for insert to authenticated
  with check (core_pm.is_project_member(issues.project_id));

create policy "core_pm_issues_update_member"
  on core_pm.issues for update to authenticated
  using (
    deleted_at is null
    and core_pm.is_project_member(issues.project_id)
  )
  with check (core_pm.is_project_member(issues.project_id));

create policy "core_pm_issues_delete_member"
  on core_pm.issues for delete to authenticated
  using (core_pm.is_project_member(issues.project_id));

drop policy if exists "core_pm_project_members_select_member" on core_pm.project_members;
create policy "core_pm_project_members_select_member"
  on core_pm.project_members for select to authenticated
  using (core_pm.is_project_member(project_members.project_id));

drop policy if exists "spatial_demo_footprints_select_member" on spatial.project_demo_footprints;
create policy "spatial_demo_footprints_select_member"
  on spatial.project_demo_footprints for select to authenticated
  using (core_pm.is_project_member(project_demo_footprints.project_id));
