-- Soft delete issue + seluruh turunan via SECURITY DEFINER
-- agar tidak mentok RLS update table issues.

create or replace function core_pm.delete_issue_soft(
  p_project_id uuid,
  p_issue_id uuid
)
returns integer
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_member boolean := false;
  v_deleted_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1
    from core_pm.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = v_uid
  )
  into v_is_member;

  if not v_is_member then
    raise exception 'Anda bukan anggota project ini.';
  end if;

  with recursive issue_tree as (
    select i.id
    from core_pm.issues i
    where i.project_id = p_project_id
      and i.id = p_issue_id
      and i.deleted_at is null
    union all
    select c.id
    from core_pm.issues c
    join issue_tree t on c.parent_id = t.id
    where c.project_id = p_project_id
      and c.deleted_at is null
  ),
  upd as (
    update core_pm.issues i
    set deleted_at = now()
    where i.project_id = p_project_id
      and i.deleted_at is null
      and i.id in (select id from issue_tree)
    returning i.id
  )
  select count(*)::integer into v_deleted_count from upd;

  return v_deleted_count;
end;
$$;

revoke all on function core_pm.delete_issue_soft(uuid, uuid) from public;
grant execute on function core_pm.delete_issue_soft(uuid, uuid) to authenticated;
