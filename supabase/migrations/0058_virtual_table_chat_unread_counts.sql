-- Agregat unread chat per virtual_table (semua room virtual_row di tabel).

create or replace function core_pm.get_virtual_table_chat_unread_counts(
  p_table_ids uuid[]
)
returns table (
  virtual_table_id uuid,
  unread_count bigint
)
language sql
stable
security definer
set search_path = core_pm, public
as $$
  with v_uid as (
    select auth.uid() as id
  )
  select
    vr.table_id as virtual_table_id,
    count(*)::bigint as unread_count
  from core_pm.chat_messages m
  cross join v_uid
  inner join core_pm.chat_rooms cr on cr.id = m.room_id
  inner join core_pm.virtual_rows vr on vr.id = cr.virtual_row_id
  inner join core_pm.virtual_tables vt on vt.id = vr.table_id
  left join core_pm.chat_room_reads crr
    on crr.room_id = cr.id and crr.user_id = v_uid.id
  where v_uid.id is not null
    and cr.scope_type = 'virtual_row'
    and vr.deleted_at is null
    and vt.deleted_at is null
    and vt.id = any (coalesce(p_table_ids, array[]::uuid[]))
    and m.author_id <> v_uid.id
    and m.created_at > coalesce(crr.last_read_at, '-infinity'::timestamptz)
    and core_pm.user_can_access_chat_room(v_uid.id, cr.id)
  group by vr.table_id
  having count(*) > 0;
$$;

revoke all on function core_pm.get_virtual_table_chat_unread_counts(uuid[]) from public;
grant execute on function core_pm.get_virtual_table_chat_unread_counts(uuid[]) to authenticated;
