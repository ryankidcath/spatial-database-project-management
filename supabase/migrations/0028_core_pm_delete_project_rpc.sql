-- Soft delete project via SECURITY DEFINER agar tidak mentok RLS update table.

create or replace function core_pm.delete_project_soft(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_owner boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1
    from core_pm.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = v_uid
      and pm.role = 'owner'
  )
  into v_is_owner;

  if not v_is_owner then
    raise exception 'Hanya owner project yang bisa menghapus project.';
  end if;

  update core_pm.projects
  set deleted_at = now()
  where id = p_project_id
    and deleted_at is null;
end;
$$;

revoke all on function core_pm.delete_project_soft(uuid) from public;
grant execute on function core_pm.delete_project_soft(uuid) to authenticated;
