-- Notifikasi workspace (fase 1): preferensi per user, fan-out, matikan chat_mention ke lonceng.

-- ---------------------------------------------------------------------------
-- Kind check: workspace + virtual_table kinds (tanpa chat_mention baru)
-- ---------------------------------------------------------------------------
alter table core_pm.user_notifications
  drop constraint if exists user_notifications_kind_check;

alter table core_pm.user_notifications
  add constraint user_notifications_kind_check
  check (kind in (
    'spatial_overlap',
    'system',
    'chat_mention',
    'workspace_member',
    'workspace_project',
    'virtual_table',
    'virtual_column',
    'virtual_row',
    'virtual_import'
  ));

-- ---------------------------------------------------------------------------
-- Preferensi notifikasi per user (kategori)
-- ---------------------------------------------------------------------------
create table if not exists core_pm.user_notification_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null
    check (category in (
      'workspace_membership',
      'schema_changes',
      'row_lifecycle',
      'cell_value_changed',
      'import_summary'
    )),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

comment on table core_pm.user_notification_preferences is
  'Preferensi lonceng per user per kategori (docs/notifikasi-event-matrix.md).';

revoke all on table core_pm.user_notification_preferences from public;
grant select, insert, update on table core_pm.user_notification_preferences to authenticated;

alter table core_pm.user_notification_preferences enable row level security;

create policy "user_notif_prefs_select_own"
  on core_pm.user_notification_preferences for select to authenticated
  using (user_id = auth.uid());

create policy "user_notif_prefs_insert_own"
  on core_pm.user_notification_preferences for insert to authenticated
  with check (user_id = auth.uid());

create policy "user_notif_prefs_update_own"
  on core_pm.user_notification_preferences for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function core_pm.notification_category_default_enabled(p_category text)
returns boolean
language sql
immutable
as $$
  select case p_category
    when 'workspace_membership' then true
    when 'import_summary' then true
    else false
  end;
$$;

create or replace function core_pm.user_wants_notification(
  p_user_id uuid,
  p_category text
)
returns boolean
language sql
stable
security definer
set search_path = core_pm, public
as $$
  select coalesce(
    (
      select p.enabled
      from core_pm.user_notification_preferences p
      where p.user_id = p_user_id
        and p.category = p_category
    ),
    core_pm.notification_category_default_enabled(p_category)
  );
$$;

revoke all on function core_pm.notification_category_default_enabled(text) from public;
grant execute on function core_pm.notification_category_default_enabled(text) to authenticated;
revoke all on function core_pm.user_wants_notification(uuid, text) from public;
grant execute on function core_pm.user_wants_notification(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Fan-out notifikasi workspace
-- ---------------------------------------------------------------------------
create or replace function core_pm.dispatch_workspace_notification(
  p_preference_category text,
  p_kind text,
  p_organization_id uuid,
  p_project_id uuid,
  p_actor_user_id uuid,
  p_title text,
  p_body text default null,
  p_payload jsonb default '{}'::jsonb,
  p_severity text default 'info'
)
returns int
language plpgsql
security definer
set search_path = core_pm, public, auth
as $$
declare
  v_count int := 0;
  rec record;
begin
  if p_organization_id is null or p_actor_user_id is null or p_title is null then
    return 0;
  end if;

  if p_project_id is not null then
    for rec in
      select pm.user_id as uid
      from core_pm.project_members pm
      where pm.project_id = p_project_id
        and pm.user_id <> p_actor_user_id
    loop
      if core_pm.user_wants_notification(rec.uid, p_preference_category) then
        insert into core_pm.user_notifications (
          user_id,
          organization_id,
          project_id,
          kind,
          severity,
          title,
          body,
          payload
        )
        values (
          rec.uid,
          p_organization_id,
          p_project_id,
          p_kind,
          coalesce(nullif(trim(p_severity), ''), 'info'),
          p_title,
          p_body,
          coalesce(p_payload, '{}'::jsonb)
            || jsonb_build_object(
              'preference_category', p_preference_category,
              'event_actor_id', p_actor_user_id
            )
        );
        v_count := v_count + 1;
      end if;
    end loop;

    if p_kind in ('workspace_project', 'workspace_member') then
      for rec in
        select om.user_id as uid
        from core_pm.organization_members om
        where om.organization_id = p_organization_id
          and om.role in ('owner', 'admin', 'staff')
          and om.user_id <> p_actor_user_id
          and not exists (
            select 1 from core_pm.project_members pm
            where pm.project_id = p_project_id and pm.user_id = om.user_id
          )
      loop
        if core_pm.user_wants_notification(rec.uid, p_preference_category) then
          insert into core_pm.user_notifications (
            user_id,
            organization_id,
            project_id,
            kind,
            severity,
            title,
            body,
            payload
          )
          values (
            rec.uid,
            p_organization_id,
            p_project_id,
            p_kind,
            coalesce(nullif(trim(p_severity), ''), 'info'),
            p_title,
            p_body,
            coalesce(p_payload, '{}'::jsonb)
              || jsonb_build_object(
                'preference_category', p_preference_category,
                'event_actor_id', p_actor_user_id
              )
          );
          v_count := v_count + 1;
        end if;
      end loop;
    end if;
  else
    for rec in
      select om.user_id as uid
      from core_pm.organization_members om
      where om.organization_id = p_organization_id
        and om.role in ('owner', 'admin', 'staff')
        and om.user_id <> p_actor_user_id
    loop
      if core_pm.user_wants_notification(rec.uid, p_preference_category) then
        insert into core_pm.user_notifications (
          user_id,
          organization_id,
          project_id,
          kind,
          severity,
          title,
          body,
          payload
        )
        values (
          rec.uid,
          p_organization_id,
          null,
          p_kind,
          coalesce(nullif(trim(p_severity), ''), 'info'),
          p_title,
          p_body,
          coalesce(p_payload, '{}'::jsonb)
            || jsonb_build_object(
              'preference_category', p_preference_category,
              'event_actor_id', p_actor_user_id
            )
        );
        v_count := v_count + 1;
      end if;
    end loop;
  end if;

  return v_count;
end;
$$;

revoke all on function core_pm.dispatch_workspace_notification(
  text, text, uuid, uuid, uuid, text, text, jsonb, text
) from public;
grant execute on function core_pm.dispatch_workspace_notification(
  text, text, uuid, uuid, uuid, text, text, jsonb, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Mention chat: tidak lagi ke lonceng (Obrolan + ikon @)
-- ---------------------------------------------------------------------------
create or replace function core_pm.dispatch_chat_mention_notifications(
  p_message_id uuid,
  p_room_id uuid,
  p_author_id uuid,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
begin
  -- Notifikasi mention hanya di tab Obrolan (ikon @), bukan user_notifications.
  return;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inbox: room dengan mention belum dibaca (opsi A)
-- ---------------------------------------------------------------------------
create or replace function core_pm.get_chat_inbox_unread_mention_keys(
  p_organization_id uuid
)
returns table (inbox_key text)
language sql
stable
security definer
set search_path = core_pm, public, auth
as $$
  with v_uid as (
    select auth.uid() as id
  ),
  v_profile as (
    select p.id, p.display_name
    from core_pm.profiles p
    cross join v_uid u
    where p.id = u.id
  ),
  v_email as (
    select lower(u.email) as email
    from auth.users u
    cross join v_uid v
    where u.id = v.id
  ),
  accessible_rooms as (
    select cr.*
    from core_pm.chat_rooms cr
    cross join v_uid u
    where cr.organization_id = p_organization_id
      and u.id is not null
      and core_pm.user_can_access_chat_room(u.id, cr.id)
  ),
  candidate_messages as (
    select
      m.room_id,
      m.body
    from core_pm.chat_messages m
    inner join accessible_rooms r on r.id = m.room_id
    cross join v_uid u
    left join core_pm.chat_room_reads crr
      on crr.room_id = m.room_id and crr.user_id = u.id
    where u.id is not null
      and m.author_id <> u.id
      and m.created_at > coalesce(crr.last_read_at, '-infinity'::timestamptz)
  ),
  mentioned_rooms as (
    select distinct cm.room_id
    from candidate_messages cm
    cross join v_uid u
    left join v_email e on true
    left join v_profile p on true
    where cm.body ~* ('@\[user:' || u.id::text || '\]')
      or (
        e.email is not null
        and cm.body ~* (
          '@' || regexp_replace(e.email, '([.^$|?*+(){}\[\]\\])', '\\\1', 'g')
        )
      )
      or (
        p.display_name is not null
        and trim(p.display_name) <> ''
        and (
          cm.body ~* (
            '(?:^|[\s(])@'
            || regexp_replace(
              lower(split_part(trim(p.display_name), ' ', 1)),
              '([.^$|?*+(){}\[\]\\])',
              '\\\1',
              'g'
            )
            || '(?![a-zA-Z0-9._@-])'
          )
          or cm.body ~* (
            '(?:^|[\s(])@'
            || regexp_replace(
              lower(replace(trim(p.display_name), ' ', '')),
              '([.^$|?*+(){}\[\]\\])',
              '\\\1',
              'g'
            )
            || '(?![a-zA-Z0-9._@-])'
          )
        )
      )
  )
  select distinct
    case
      when r.scope_type = 'organization' then 'org'
      when r.scope_type = 'project' and r.project_id is not null
        then 'project:' || r.project_id::text
      when r.scope_type = 'virtual_table' and r.virtual_table_id is not null
        then 'table:' || r.virtual_table_id::text
      when r.scope_type = 'virtual_row' and r.virtual_row_id is not null
        then 'row:' || r.virtual_row_id::text
      else null
    end as inbox_key
  from mentioned_rooms mr
  inner join accessible_rooms r on r.id = mr.room_id
  where case
      when r.scope_type = 'organization' then 'org'
      when r.scope_type = 'project' and r.project_id is not null
        then 'project:' || r.project_id::text
      when r.scope_type = 'virtual_table' and r.virtual_table_id is not null
        then 'table:' || r.virtual_table_id::text
      when r.scope_type = 'virtual_row' and r.virtual_row_id is not null
        then 'row:' || r.virtual_row_id::text
      else null
    end is not null;
$$;

revoke all on function core_pm.get_chat_inbox_unread_mention_keys(uuid) from public;
grant execute on function core_pm.get_chat_inbox_unread_mention_keys(uuid) to authenticated;

notify pgrst, 'reload schema';
