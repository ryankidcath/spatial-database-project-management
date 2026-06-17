-- Unread room organisasi / proyek (untuk badge tab Obrolan).

create or replace function core_pm.get_chat_static_rooms_unread_count(
  p_organization_id uuid,
  p_project_id uuid default null
)
returns table (
  organization_unread bigint,
  project_unread bigint
)
language sql
stable
security definer
set search_path = core_pm, public
as $$
  with v_uid as (
    select auth.uid() as id
  ),
  org_room as (
    select cr.id as room_id
    from core_pm.chat_rooms cr
    cross join v_uid
    where v_uid.id is not null
      and p_organization_id is not null
      and cr.scope_type = 'organization'
      and cr.organization_id = p_organization_id
      and core_pm.user_can_access_chat_room(v_uid.id, cr.id)
  ),
  project_room as (
    select cr.id as room_id
    from core_pm.chat_rooms cr
    cross join v_uid
    where v_uid.id is not null
      and p_project_id is not null
      and cr.scope_type = 'project'
      and cr.project_id = p_project_id
      and core_pm.user_can_access_chat_room(v_uid.id, cr.id)
  ),
  org_unread as (
    select count(*)::bigint as n
    from core_pm.chat_messages m
    cross join v_uid
    inner join org_room r on r.room_id = m.room_id
    left join core_pm.chat_room_reads crr
      on crr.room_id = m.room_id and crr.user_id = v_uid.id
    where m.author_id <> v_uid.id
      and m.created_at > coalesce(crr.last_read_at, '-infinity'::timestamptz)
  ),
  project_unread as (
    select count(*)::bigint as n
    from core_pm.chat_messages m
    cross join v_uid
    inner join project_room r on r.room_id = m.room_id
    left join core_pm.chat_room_reads crr
      on crr.room_id = m.room_id and crr.user_id = v_uid.id
    where m.author_id <> v_uid.id
      and m.created_at > coalesce(crr.last_read_at, '-infinity'::timestamptz)
  )
  select
    coalesce((select n from org_unread), 0)::bigint as organization_unread,
    coalesce((select n from project_unread), 0)::bigint as project_unread;
$$;

revoke all on function core_pm.get_chat_static_rooms_unread_count(uuid, uuid) from public;
grant execute on function core_pm.get_chat_static_rooms_unread_count(uuid, uuid) to authenticated;
