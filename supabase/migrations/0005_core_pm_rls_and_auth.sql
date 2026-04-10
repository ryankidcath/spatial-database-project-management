-- Fase 1 increment 7: RLS by project membership + profil dari auth.users + bootstrap demo

-- --- Profil otomatis saat user terdaftar ---
create or replace function core_pm.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = core_pm, public
as $$
begin
  insert into core_pm.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure core_pm.handle_new_user();

-- --- Bootstrap: user pertama kali → anggota semua project di org demo (tanpa policy INSERT umum) ---
create or replace function core_pm.join_demo_org_projects()
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if exists (select 1 from core_pm.project_members where user_id = auth.uid()) then
    return;
  end if;
  insert into core_pm.project_members (project_id, user_id, role)
  select p.id, auth.uid(), 'member'
  from core_pm.projects p
  where p.organization_id = '11111111-1111-4111-8111-111111111111'
    and p.deleted_at is null
  on conflict (project_id, user_id) do nothing;
end;
$$;

revoke all on function core_pm.join_demo_org_projects() from public;
grant execute on function core_pm.join_demo_org_projects() to authenticated;

-- --- Cabut akses anon ke data tenant (RLS tanpa policy untuk anon = ditolak) ---
revoke select, insert, update, delete on all tables in schema core_pm from anon;
revoke select, insert, update, delete on spatial.project_demo_footprints from anon;

-- --- Hapus policy dev ---
drop policy if exists "core_pm_dev_all_organizations" on core_pm.organizations;
drop policy if exists "core_pm_dev_all_projects" on core_pm.projects;
drop policy if exists "core_pm_dev_all_statuses" on core_pm.statuses;
drop policy if exists "core_pm_dev_all_issues" on core_pm.issues;
drop policy if exists "core_pm_dev_all_profiles" on core_pm.profiles;
drop policy if exists "core_pm_dev_all_project_members" on core_pm.project_members;
drop policy if exists "spatial_dev_all_project_demo_footprints" on spatial.project_demo_footprints;

-- --- RLS: authenticated + keanggotaan project ---

-- organizations: terlihat jika user anggota minimal satu project di org itu
create policy "core_pm_org_select_member"
  on core_pm.organizations for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from core_pm.projects p
      inner join core_pm.project_members m on m.project_id = p.id
      where p.organization_id = organizations.id
        and m.user_id = (select auth.uid())
        and p.deleted_at is null
    )
  );

-- projects
create policy "core_pm_projects_select_member"
  on core_pm.projects for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from core_pm.project_members m
      where m.project_id = projects.id
        and m.user_id = (select auth.uid())
    )
  );

-- statuses: baca jika anggota project
create policy "core_pm_statuses_select_member"
  on core_pm.statuses for select to authenticated
  using (
    exists (
      select 1 from core_pm.project_members m
      where m.project_id = statuses.project_id
        and m.user_id = (select auth.uid())
    )
  );

-- issues: CRUD dalam project yang sama
create policy "core_pm_issues_select_member"
  on core_pm.issues for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from core_pm.project_members m
      where m.project_id = issues.project_id
        and m.user_id = (select auth.uid())
    )
  );

create policy "core_pm_issues_insert_member"
  on core_pm.issues for insert to authenticated
  with check (
    exists (
      select 1 from core_pm.project_members m
      where m.project_id = issues.project_id
        and m.user_id = (select auth.uid())
    )
  );

create policy "core_pm_issues_update_member"
  on core_pm.issues for update to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from core_pm.project_members m
      where m.project_id = issues.project_id
        and m.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from core_pm.project_members m
      where m.project_id = issues.project_id
        and m.user_id = (select auth.uid())
    )
  );

create policy "core_pm_issues_delete_member"
  on core_pm.issues for delete to authenticated
  using (
    exists (
      select 1 from core_pm.project_members m
      where m.project_id = issues.project_id
        and m.user_id = (select auth.uid())
    )
  );

-- profiles
create policy "core_pm_profiles_select_own"
  on core_pm.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "core_pm_profiles_insert_own"
  on core_pm.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "core_pm_profiles_update_own"
  on core_pm.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- project_members: lihat baris di project tempat user ikut
create policy "core_pm_project_members_select_member"
  on core_pm.project_members for select to authenticated
  using (
    exists (
      select 1 from core_pm.project_members m
      where m.project_id = project_members.project_id
        and m.user_id = (select auth.uid())
    )
  );

-- spatial demo: baca jika anggota project footprint
create policy "spatial_demo_footprints_select_member"
  on spatial.project_demo_footprints for select to authenticated
  using (
    exists (
      select 1 from core_pm.project_members m
      where m.project_id = project_demo_footprints.project_id
        and m.user_id = (select auth.uid())
    )
  );
