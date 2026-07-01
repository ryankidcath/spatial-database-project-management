-- PR-H: payload push menyertakan hint cache untuk service worker (chat room + inbox meta).

create or replace function core_pm.chat_room_cache_key(p_room core_pm.chat_rooms)
returns text
language sql
immutable
as $$
  select case p_room.scope_type
    when 'organization' then 'org'
    when 'project' then 'project:' || p_room.project_id::text
    when 'virtual_table' then 'table:' || p_room.virtual_table_id::text
    when 'virtual_row' then 'row:' || p_room.virtual_row_id::text
    else null
  end;
$$;

comment on function core_pm.chat_room_cache_key(core_pm.chat_rooms) is
  'Key cache client (chat-room-v1) — harus selaras dengan buildChatRoomCacheKey di app.';

create or replace function core_pm.on_chat_message_insert_push()
returns trigger
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_room core_pm.chat_rooms%rowtype;
  v_preview text;
  v_url text;
  v_recipient uuid;
  v_room_cache_key text;
begin
  select * into v_room from core_pm.chat_rooms where id = NEW.room_id;
  if not found then
    return NEW;
  end if;

  v_preview := left(trim(NEW.body), 140);
  v_room_cache_key := core_pm.chat_room_cache_key(v_room);

  v_url := '/?view=chat';
  if v_room.organization_id is not null then
    v_url := v_url || '&org=' || v_room.organization_id::text;
  end if;
  if v_room.project_id is not null then
    v_url := v_url || '&project=' || v_room.project_id::text;
  end if;

  for v_recipient in
    select distinct ps.user_id
    from core_pm.push_subscriptions ps
    where ps.user_id <> NEW.author_id
      and core_pm.user_can_access_chat_room(ps.user_id, NEW.room_id)
  loop
    perform core_pm.enqueue_push_to_user(
      v_recipient,
      'Pesan chat baru',
      v_preview,
      v_url,
      'chat:' || NEW.room_id::text,
      jsonb_build_object(
        'type', 'chat',
        'room_id', NEW.room_id,
        'message_id', NEW.id,
        'organization_id', v_room.organization_id,
        'cache', jsonb_build_object(
          'kind', 'chat_message',
          'roomCacheKey', v_room_cache_key,
          'roomId', NEW.room_id,
          'inboxRoomKey', v_room_cache_key,
          'organizationId', v_room.organization_id,
          'lastActivityAt', NEW.created_at,
          'lastMessagePreview', v_preview,
          'message', jsonb_build_object(
            'id', NEW.id,
            'room_id', NEW.room_id,
            'author_id', NEW.author_id,
            'body', NEW.body,
            'attachment_refs', coalesce(NEW.attachment_refs, '[]'::jsonb),
            'created_at', NEW.created_at
          )
        )
      )
    );
  end loop;

  return NEW;
end;
$$;
