-- Denormalisasi preview pesan terakhir per room (inbox obrolan).

alter table core_pm.chat_rooms
  add column if not exists last_message_body text,
  add column if not exists last_message_author_id uuid references auth.users (id) on delete set null;

update core_pm.chat_rooms cr
set
  last_message_at = sub.created_at,
  last_message_body = sub.body,
  last_message_author_id = sub.author_id
from (
  select distinct on (room_id)
    room_id,
    created_at,
    body,
    author_id
  from core_pm.chat_messages
  order by room_id, created_at desc
) sub
where cr.id = sub.room_id;

create or replace function core_pm.sync_chat_room_last_message(p_room_id uuid)
returns void
language sql
security definer
set search_path = core_pm, public
as $$
  update core_pm.chat_rooms cr
  set
    last_message_at = lm.created_at,
    last_message_body = lm.body,
    last_message_author_id = lm.author_id
  from (
    select m.created_at, m.body, m.author_id
    from core_pm.chat_messages m
    where m.room_id = p_room_id
    order by m.created_at desc
    limit 1
  ) lm
  where cr.id = p_room_id;

  update core_pm.chat_rooms cr
  set
    last_message_at = null,
    last_message_body = null,
    last_message_author_id = null
  where cr.id = p_room_id
    and not exists (
      select 1 from core_pm.chat_messages m where m.room_id = p_room_id
    );
$$;

revoke all on function core_pm.sync_chat_room_last_message(uuid) from public;
grant execute on function core_pm.sync_chat_room_last_message(uuid) to authenticated;

-- Alias lama tetap memanggil sync lengkap.
create or replace function core_pm.sync_chat_room_last_message_at(p_room_id uuid)
returns void
language sql
security definer
set search_path = core_pm, public
as $$
  select core_pm.sync_chat_room_last_message(p_room_id);
$$;

create or replace function core_pm.trg_chat_messages_bump_room_activity()
returns trigger
language plpgsql
security definer
set search_path = core_pm, public
as $$
begin
  update core_pm.chat_rooms
  set
    last_message_at = new.created_at,
    last_message_body = new.body,
    last_message_author_id = new.author_id
  where id = new.room_id
    and (last_message_at is null or last_message_at <= new.created_at);
  return new;
end;
$$;

create or replace function core_pm.trg_chat_messages_sync_room_on_delete()
returns trigger
language plpgsql
security definer
set search_path = core_pm, public
as $$
begin
  perform core_pm.sync_chat_room_last_message(old.room_id);
  return old;
end;
$$;

drop function if exists core_pm.get_chat_inbox_active_row_rooms(uuid[], int, int);

create or replace function core_pm.get_chat_inbox_active_row_rooms(
  p_table_ids uuid[],
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  virtual_row_id uuid,
  virtual_table_id uuid,
  table_display_name text,
  unread_count bigint,
  last_message_at timestamptz,
  last_message_body text,
  row_payload jsonb,
  total_count bigint
)
language sql
stable
security definer
set search_path = core_pm, public
as $$
  with v_uid as (
    select auth.uid() as id
  ),
  base as (
    select
      cr.virtual_row_id,
      vt.id as virtual_table_id,
      vt.display_name as table_display_name,
      vr.payload as row_payload,
      cr.last_message_at,
      cr.last_message_body,
      cr.id as room_id
    from core_pm.chat_rooms cr
    inner join core_pm.virtual_rows vr on vr.id = cr.virtual_row_id
    inner join core_pm.virtual_tables vt on vt.id = vr.table_id
    cross join v_uid
    where v_uid.id is not null
      and p_table_ids is not null
      and cardinality(p_table_ids) > 0
      and cr.scope_type = 'virtual_row'
      and cr.last_message_at is not null
      and vr.deleted_at is null
      and vt.deleted_at is null
      and vt.id = any(p_table_ids)
      and core_pm.user_can_access_chat_room(v_uid.id, cr.id)
  ),
  unread_by_room as (
    select
      cr.id as room_id,
      count(*)::bigint as unread_count
    from core_pm.chat_rooms cr
    cross join v_uid
    inner join core_pm.chat_messages m on m.room_id = cr.id
    left join core_pm.chat_room_reads crr
      on crr.room_id = cr.id and crr.user_id = v_uid.id
    where m.author_id <> v_uid.id
      and m.created_at > coalesce(crr.last_read_at, '-infinity'::timestamptz)
    group by cr.id
  ),
  with_unread as (
    select
      b.virtual_row_id,
      b.virtual_table_id,
      b.table_display_name,
      b.row_payload,
      b.last_message_at,
      b.last_message_body,
      coalesce(u.unread_count, 0)::bigint as unread_count
    from base b
    left join unread_by_room u on u.room_id = b.room_id
  )
  select
    w.virtual_row_id,
    w.virtual_table_id,
    w.table_display_name,
    w.unread_count,
    w.last_message_at,
    w.last_message_body,
    w.row_payload,
    count(*) over()::bigint as total_count
  from with_unread w
  order by w.last_message_at desc
  limit greatest(coalesce(p_limit, 25), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function core_pm.get_chat_inbox_active_row_rooms(uuid[], int, int) from public;
grant execute on function core_pm.get_chat_inbox_active_row_rooms(uuid[], int, int) to authenticated;
