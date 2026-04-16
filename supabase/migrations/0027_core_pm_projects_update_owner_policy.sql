-- Izinkan owner project melakukan update (termasuk soft delete via deleted_at).

create policy "core_pm_projects_update_owner"
  on core_pm.projects
  for update
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from core_pm.project_members m
      where m.project_id = projects.id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from core_pm.project_members m
      where m.project_id = projects.id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  );
