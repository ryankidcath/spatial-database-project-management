-- Perbaikan: parsing mention yang andal.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_realtime') then
    grant usage on schema core_pm to supabase_realtime;
    grant select on table core_pm.user_notifications to supabase_realtime;
  end if;
end;
$$;

create or replace function core_pm.dispatch_chat_mention_notifications(
  p_message_id uuid,
  p_room_id uuid,
  p_author_id uuid,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = core_pm, public, auth
as $$
declare
  r core_pm.chat_rooms%rowtype;
  v_user_id uuid;
  v_project_id uuid;
  v_row_id uuid;
  v_email text;
  v_needle text;
  rec record;
begin
  select * into r from core_pm.chat_rooms where id = p_room_id;
  if not found then
    return;
  end if;

  -- @[user:uuid]
  for v_user_id in
    select (m)[1]::uuid
    from regexp_matches(
      p_body,
      '@\[user:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]',
      'gi'
    ) as m
  loop
    if v_user_id is null or v_user_id = p_author_id then
      continue;
    end if;
    if not core_pm.user_can_access_chat_room(v_user_id, p_room_id) then
      continue;
    end if;
    perform core_pm.insert_chat_mention_notification(
      v_user_id,
      r.organization_id,
      r.project_id,
      'Anda disebut di chat',
      left(p_body, 500),
      jsonb_build_object(
        'message_id', p_message_id,
        'room_id', p_room_id,
        'scope_type', r.scope_type,
        'virtual_row_id', r.virtual_row_id,
        'project_id', r.project_id
      )
    );
  end loop;

  -- @email@domain.com (satu @ di depan alamat email)
  for v_email in
    select lower((m)[1])
    from regexp_matches(
      p_body,
      '@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
      'gi'
    ) as m
  loop
    select u.id into v_user_id
    from auth.users u
    where lower(u.email) = v_email
    order by u.created_at asc
    limit 1;
    if v_user_id is null or v_user_id = p_author_id then
      continue;
    end if;
    if not core_pm.user_can_access_chat_room(v_user_id, p_room_id) then
      continue;
    end if;
    perform core_pm.insert_chat_mention_notification(
      v_user_id,
      r.organization_id,
      r.project_id,
      'Anda disebut di chat',
      left(p_body, 500),
      jsonb_build_object(
        'message_id', p_message_id,
        'room_id', p_room_id,
        'scope_type', r.scope_type
      )
    );
  end loop;

  -- @[project:uuid]
  for v_project_id in
    select (m)[1]::uuid
    from regexp_matches(
      p_body,
      '@\[project:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]',
      'gi'
    ) as m
  loop
    for rec in
      select pm.user_id
      from core_pm.project_members pm
      where pm.project_id = v_project_id
        and pm.user_id <> p_author_id
    loop
      if core_pm.user_can_access_chat_room(rec.user_id, p_room_id) then
        perform core_pm.insert_chat_mention_notification(
          rec.user_id,
          r.organization_id,
          v_project_id,
          'Project disebut di chat',
          left(p_body, 500),
          jsonb_build_object(
            'message_id', p_message_id,
            'room_id', p_room_id,
            'project_id', v_project_id
          )
        );
      end if;
    end loop;
  end loop;

  -- @[row:uuid]
  for v_row_id in
    select (m)[1]::uuid
    from regexp_matches(
      p_body,
      '@\[row:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]',
      'gi'
    ) as m
  loop
    for rec in
      select distinct pm.user_id as uid
      from core_pm.virtual_rows vr
      inner join core_pm.virtual_tables vt on vt.id = vr.table_id
      inner join core_pm.project_members pm on pm.project_id = vt.project_id
      where vr.id = v_row_id
        and vt.project_id is not null
        and pm.user_id <> p_author_id
      union
      select distinct om.user_id as uid
      from core_pm.virtual_rows vr
      inner join core_pm.virtual_tables vt on vt.id = vr.table_id
      inner join core_pm.organization_members om on om.organization_id = vt.organization_id
      where vr.id = v_row_id
        and vt.organization_id is not null
        and om.role in ('owner', 'admin', 'staff')
        and om.user_id <> p_author_id
    loop
      if core_pm.user_can_access_chat_room(rec.uid, p_room_id) then
        perform core_pm.insert_chat_mention_notification(
          rec.uid,
          r.organization_id,
          r.project_id,
          'Baris disebut di chat',
          left(p_body, 500),
          jsonb_build_object(
            'message_id', p_message_id,
            'room_id', p_room_id,
            'virtual_row_id', v_row_id
          )
        );
      end if;
    end loop;
  end loop;

  -- @NamaSingkat — cocokkan anggota project / tim inti org (bukan token bracket)
  if r.scope_type = 'project' and r.project_id is not null then
    for v_needle in
      select lower((m)[1])
      from regexp_matches(
        p_body,
        '(?:^|[\s(])@(?!\[)([a-zA-Z][a-zA-Z0-9._-]{1,40})(?![a-zA-Z0-9._@-])',
        'gi'
      ) as m
    loop
      if v_needle in ('user', 'project', 'row') then
        continue;
      end if;
      for v_user_id in
        select distinct p.id
        from core_pm.profiles p
        inner join core_pm.project_members pm on pm.user_id = p.id
        where pm.project_id = r.project_id
          and p.id <> p_author_id
          and (
            lower(split_part(trim(coalesce(p.display_name, '')), ' ', 1)) = v_needle
            or lower(replace(trim(coalesce(p.display_name, '')), ' ', '')) = v_needle
            or lower(trim(coalesce(p.display_name, ''))) = v_needle
          )
      loop
        if core_pm.user_can_access_chat_room(v_user_id, p_room_id) then
          perform core_pm.insert_chat_mention_notification(
            v_user_id,
            r.organization_id,
            r.project_id,
            'Anda disebut di chat',
            left(p_body, 500),
            jsonb_build_object(
              'message_id', p_message_id,
              'room_id', p_room_id,
              'scope_type', r.scope_type,
              'mention_label', v_needle
            )
          );
        end if;
      end loop;
    end loop;
  elsif r.scope_type = 'organization' then
    for v_needle in
      select lower((m)[1])
      from regexp_matches(
        p_body,
        '(?:^|[\s(])@(?!\[)([a-zA-Z][a-zA-Z0-9._-]{1,40})(?![a-zA-Z0-9._@-])',
        'gi'
      ) as m
    loop
      if v_needle in ('user', 'project', 'row') then
        continue;
      end if;
      for v_user_id in
        select distinct p.id
        from core_pm.profiles p
        inner join core_pm.organization_members om on om.user_id = p.id
        where om.organization_id = r.organization_id
          and om.role in ('owner', 'admin', 'staff')
          and p.id <> p_author_id
          and (
            lower(split_part(trim(coalesce(p.display_name, '')), ' ', 1)) = v_needle
            or lower(replace(trim(coalesce(p.display_name, '')), ' ', '')) = v_needle
            or lower(trim(coalesce(p.display_name, ''))) = v_needle
          )
      loop
        if core_pm.user_can_access_chat_room(v_user_id, p_room_id) then
          perform core_pm.insert_chat_mention_notification(
            v_user_id,
            r.organization_id,
            r.project_id,
            'Anda disebut di chat',
            left(p_body, 500),
            jsonb_build_object(
              'message_id', p_message_id,
              'room_id', p_room_id,
              'scope_type', r.scope_type,
              'mention_label', v_needle
            )
          );
        end if;
      end loop;
    end loop;
  end if;
end;
$$;

notify pgrst, 'reload schema';
