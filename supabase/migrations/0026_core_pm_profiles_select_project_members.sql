-- Izinkan user membaca display_name anggota lain yang berada
-- di project yang sama (tetap scoped by membership).

create policy "core_pm_profiles_select_project_member"
  on core_pm.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from core_pm.project_members me
      join core_pm.project_members other
        on other.project_id = me.project_id
      where me.user_id = (select auth.uid())
        and other.user_id = profiles.id
    )
  );
