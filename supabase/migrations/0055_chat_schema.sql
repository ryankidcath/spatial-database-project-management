-- Chat: room organisasi / project / virtual_row + pesan + unread + RPC + realtime.

-- ---------------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------------
create table core_pm.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null
    check (scope_type in ('organization', 'project', 'virtual_row')),
  organization_id uuid not null
    references core_pm.organizations (id) on delete cascade,
  project_id uuid references core_pm.projects (id) on delete cascade,
  virtual_row_id uuid references core_pm.virtual_rows (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint chat_rooms_scope_refs check (
    (scope_type = 'organization' and project_id is null and virtual_row_id is null)
    or (scope_type = 'project' and project_id is not null and virtual_row_id is null)
    or (scope_type = 'virtual_row' and virtual_row_id is not null)
  )
);

create unique index uq_chat_rooms_organization
  on core_pm.chat_rooms (organization_id)
  where scope_type = 'organization';

create unique index uq_chat_rooms_project
  on core_pm.chat_rooms (project_id)
  where scope_type = 'project';

create unique index uq_chat_rooms_virtual_row
  on core_pm.chat_rooms (virtual_row_id)
  where scope_type = 'virtual_row';

create index idx_chat_rooms_org on core_pm.chat_rooms (organization_id);
create index idx_chat_rooms_project on core_pm.chat_rooms (project_id);

comment on table core_pm.chat_rooms is
  'Satu room per organisasi, project, atau virtual_row (lazy dibuat saat pesan pertama).';

create table core_pm.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references core_pm.chat_rooms (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  attachment_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint chat_messages_body_not_blank check (length(trim(body)) > 0),
  constraint chat_messages_attachment_refs_array check (jsonb_typeof(attachment_refs) = 'array')
);

create index idx_chat_messages_room_created
  on core_pm.chat_messages (room_id, created_at desc);

create table core_pm.chat_room_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  room_id uuid not null references core_pm.chat_rooms (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, room_id)
);

-- ---------------------------------------------------------------------------
-- Akses helper
-- ---------------------------------------------------------------------------
create or replace function core_pm.can_read_virtual_row(p_row_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core_pm, public
as $$
  select exists (
    select 1
    from core_pm.virtual_rows vr
    inner join core_pm.virtual_tables vt on vt.id = vr.table_id
    where vr.id = p_row_id
      and vr.deleted_at is null
      and vt.deleted_at is null
      and (
        (vt.project_id is not null and core_pm.is_project_member(vt.project_id))
        or
        (vt.organization_id is not null and core_pm.has_org_staff_access(vt.organization_id))
      )
  );
$$;

revoke all on function core_pm.can_read_virtual_row(uuid) from public;
grant execute on function core_pm.can_read_virtual_row(uuid) to authenticated;

create or replace function core_pm.can_access_chat_project(p_project_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = core_pm, public
as $$
declare
  v_org_id uuid;
begin
  if p_project_id is null then
    return false;
  end if;

  if core_pm.is_project_member(p_project_id) then
    return true;
  end if;

  select p.organization_id into v_org_id
  from core_pm.projects p
  where p.id = p_project_id
    and p.deleted_at is null;

  return v_org_id is not null and core_pm.is_org_admin(v_org_id);
end;
$$;

revoke all on function core_pm.can_access_chat_project(uuid) from public;
grant execute on function core_pm.can_access_chat_project(uuid) to authenticated;

create or replace function core_pm.can_access_chat_room(p_room_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = core_pm, public
as $$
declare
  r core_pm.chat_rooms%rowtype;
begin
  select * into r from core_pm.chat_rooms where id = p_room_id;
  if not found then
    return false;
  end if;

  case r.scope_type
    when 'organization' then
      return core_pm.has_org_staff_access(r.organization_id);
    when 'project' then
      return core_pm.can_access_chat_project(r.project_id);
    when 'virtual_row' then
      return core_pm.can_read_virtual_row(r.virtual_row_id);
    else
      return false;
  end case;
end;
$$;

revoke all on function core_pm.can_access_chat_room(uuid) from public;
grant execute on function core_pm.can_access_chat_room(uuid) to authenticated;

create or replace function core_pm.user_can_access_chat_room(p_user_id uuid, p_room_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = core_pm, public
as $$
declare
  r core_pm.chat_rooms%rowtype;
begin
  if p_user_id is null or p_room_id is null then
    return false;
  end if;

  select * into r from core_pm.chat_rooms where id = p_room_id;
  if not found then
    return false;
  end if;

  case r.scope_type
    when 'organization' then
      return exists (
        select 1 from core_pm.organization_members om
        where om.organization_id = r.organization_id
          and om.user_id = p_user_id
          and om.role in ('owner', 'admin', 'staff')
      );
    when 'project' then
      return exists (
        select 1 from core_pm.project_members pm
        where pm.project_id = r.project_id and pm.user_id = p_user_id
      )
      or exists (
        select 1 from core_pm.organization_members om
        where om.organization_id = r.organization_id
          and om.user_id = p_user_id
          and om.role in ('owner', 'admin')
      );
    when 'virtual_row' then
      return exists (
        select 1
        from core_pm.virtual_rows vr
        inner join core_pm.virtual_tables vt on vt.id = vr.table_id
        where vr.id = r.virtual_row_id
          and vr.deleted_at is null
          and vt.deleted_at is null
          and (
            (vt.project_id is not null and exists (
              select 1 from core_pm.project_members pm
              where pm.project_id = vt.project_id and pm.user_id = p_user_id
            ))
            or (vt.organization_id is not null and exists (
              select 1 from core_pm.organization_members om
              where om.organization_id = vt.organization_id
                and om.user_id = p_user_id
                and om.role in ('owner', 'admin', 'staff')
            ))
          )
      );
    else
      return false;
  end case;
end;
$$;

revoke all on function core_pm.user_can_access_chat_room(uuid, uuid) from public;
grant execute on function core_pm.user_can_access_chat_room(uuid, uuid) to authenticated;

create or replace function core_pm.can_delete_chat_message(p_message_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_org_id uuid;
begin
  if v_uid is null then
    return false;
  end if;

  select m.author_id, r.organization_id
  into v_author, v_org_id
  from core_pm.chat_messages m
  inner join core_pm.chat_rooms r on r.id = m.room_id
  where m.id = p_message_id;

  if not found then
    return false;
  end if;

  if v_author = v_uid then
    return true;
  end if;

  return core_pm.is_org_admin(v_org_id);
end;
$$;

revoke all on function core_pm.can_delete_chat_message(uuid) from public;
grant execute on function core_pm.can_delete_chat_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifikasi mention (security definer)
-- ---------------------------------------------------------------------------
alter table core_pm.user_notifications
  drop constraint if exists user_notifications_kind_check;

alter table core_pm.user_notifications
  add constraint user_notifications_kind_check
  check (kind in ('spatial_overlap', 'system', 'chat_mention'));

create or replace function core_pm.insert_chat_mention_notification(
  p_user_id uuid,
  p_organization_id uuid,
  p_project_id uuid,
  p_title text,
  p_body text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
begin
  if p_user_id is null or p_organization_id is null then
    return;
  end if;

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
    p_user_id,
    p_organization_id,
    p_project_id,
    'chat_mention',
    'info',
    p_title,
    p_body,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

revoke all on function core_pm.insert_chat_mention_notification(uuid, uuid, uuid, text, text, jsonb) from public;
grant execute on function core_pm.insert_chat_mention_notification(uuid, uuid, uuid, text, text, jsonb) to authenticated;

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
  v_email text;
  v_user_id uuid;
  v_project_id uuid;
  v_row_id uuid;
  m text[];
  rec record;
begin
  select * into r from core_pm.chat_rooms where id = p_room_id;
  if not found then
    return;
  end if;

  -- @[user:uuid]
  for m in
    select regexp_matches(p_body, '@\[user:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]', 'gi')
  loop
    v_user_id := m[1]::uuid;
    if v_user_id is not null and v_user_id <> p_author_id
      and core_pm.user_can_access_chat_room(v_user_id, p_room_id) then
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
    end if;
  end loop;

  -- @email
  for m in
    select regexp_matches(p_body, '@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', 'g')
  loop
    v_email := lower(m[1]);
    select u.id into v_user_id
    from auth.users u
    where lower(u.email) = v_email
    order by u.created_at asc
    limit 1;
    if v_user_id is not null and v_user_id <> p_author_id
      and core_pm.user_can_access_chat_room(v_user_id, p_room_id) then
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
    end if;
  end loop;

  -- @[project:uuid]
  for m in
    select regexp_matches(p_body, '@\[project:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]', 'gi')
  loop
    v_project_id := m[1]::uuid;
    for rec in
      select pm.user_id
      from core_pm.project_members pm
      where pm.project_id = v_project_id
        and pm.user_id <> p_author_id
    loop
      if core_pm.can_access_chat_project(v_project_id) then
        perform core_pm.insert_chat_mention_notification(
          rec.user_id,
          r.organization_id,
          v_project_id,
          'Project disebut di chat',
          left(p_body, 500),
          jsonb_build_object('message_id', p_message_id, 'room_id', p_room_id, 'project_id', v_project_id)
        );
      end if;
    end loop;
    -- super admin org
    for rec in
      select om.user_id
      from core_pm.organization_members om
      where om.organization_id = r.organization_id
        and om.role in ('owner', 'admin')
        and om.user_id <> p_author_id
        and not exists (
          select 1 from core_pm.project_members pm
          where pm.project_id = v_project_id and pm.user_id = om.user_id
        )
    loop
      perform core_pm.insert_chat_mention_notification(
        rec.user_id,
        r.organization_id,
        v_project_id,
        'Project disebut di chat',
        left(p_body, 500),
        jsonb_build_object('message_id', p_message_id, 'room_id', p_room_id, 'project_id', v_project_id)
      );
    end loop;
  end loop;

  -- @[row:uuid]
  for m in
    select regexp_matches(p_body, '@\[row:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]', 'gi')
  loop
    v_row_id := m[1]::uuid;
    if not core_pm.can_read_virtual_row(v_row_id) then
      continue;
    end if;
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
          jsonb_build_object('message_id', p_message_id, 'room_id', p_room_id, 'virtual_row_id', v_row_id)
        );
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function core_pm.dispatch_chat_mention_notifications(uuid, uuid, uuid, text) from public;
grant execute on function core_pm.dispatch_chat_mention_notifications(uuid, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------
create or replace function core_pm.get_or_create_chat_room(
  p_scope_type text,
  p_organization_id uuid,
  p_project_id uuid default null,
  p_virtual_row_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_room_id uuid;
  v_org_id uuid;
  v_scope text := lower(trim(coalesce(p_scope_type, '')));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if v_scope = 'organization' then
    if p_organization_id is null then
      raise exception 'organization_id wajib';
    end if;
    if not core_pm.has_org_staff_access(p_organization_id) then
      raise exception 'Tidak punya akses room organisasi';
    end if;
    select id into v_room_id
    from core_pm.chat_rooms
    where scope_type = 'organization' and organization_id = p_organization_id;
    if v_room_id is null then
      insert into core_pm.chat_rooms (scope_type, organization_id)
      values ('organization', p_organization_id)
      returning id into v_room_id;
    end if;
    return v_room_id;
  end if;

  if v_scope = 'project' then
    if p_project_id is null then
      raise exception 'project_id wajib';
    end if;
    if not core_pm.can_access_chat_project(p_project_id) then
      raise exception 'Tidak punya akses room project';
    end if;
    select organization_id into v_org_id
    from core_pm.projects where id = p_project_id and deleted_at is null;
    select id into v_room_id
    from core_pm.chat_rooms
    where scope_type = 'project' and project_id = p_project_id;
    if v_room_id is null then
      insert into core_pm.chat_rooms (scope_type, organization_id, project_id)
      values ('project', v_org_id, p_project_id)
      returning id into v_room_id;
    end if;
    return v_room_id;
  end if;

  if v_scope = 'virtual_row' then
    if p_virtual_row_id is null then
      raise exception 'virtual_row_id wajib';
    end if;
    if not core_pm.can_read_virtual_row(p_virtual_row_id) then
      raise exception 'Tidak punya akses room baris';
    end if;
    select
      coalesce(vt.organization_id, pr.organization_id),
      vt.project_id
    into v_org_id, p_project_id
    from core_pm.virtual_rows vr
    inner join core_pm.virtual_tables vt on vt.id = vr.table_id
    left join core_pm.projects pr on pr.id = vt.project_id
    where vr.id = p_virtual_row_id;
    select id into v_room_id
    from core_pm.chat_rooms
    where scope_type = 'virtual_row' and virtual_row_id = p_virtual_row_id;
    if v_room_id is null then
      insert into core_pm.chat_rooms (scope_type, organization_id, project_id, virtual_row_id)
      values ('virtual_row', v_org_id, p_project_id, p_virtual_row_id)
      returning id into v_room_id;
    end if;
    return v_room_id;
  end if;

  raise exception 'scope_type tidak valid';
end;
$$;

revoke all on function core_pm.get_or_create_chat_room(text, uuid, uuid, uuid) from public;
grant execute on function core_pm.get_or_create_chat_room(text, uuid, uuid, uuid) to authenticated;

create or replace function core_pm.send_chat_message(
  p_room_id uuid,
  p_body text,
  p_attachment_refs jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_message_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_body = '' then
    raise exception 'Pesan tidak boleh kosong';
  end if;
  if not core_pm.can_access_chat_room(p_room_id) then
    raise exception 'Tidak punya akses room chat';
  end if;
  if p_attachment_refs is null or jsonb_typeof(p_attachment_refs) <> 'array' then
    raise exception 'attachment_refs harus array JSON';
  end if;

  insert into core_pm.chat_messages (room_id, author_id, body, attachment_refs)
  values (p_room_id, v_uid, v_body, p_attachment_refs)
  returning id into v_message_id;

  perform core_pm.dispatch_chat_mention_notifications(v_message_id, p_room_id, v_uid, v_body);

  insert into core_pm.chat_room_reads (user_id, room_id, last_read_at)
  values (v_uid, p_room_id, now())
  on conflict (user_id, room_id) do update set last_read_at = excluded.last_read_at;

  return v_message_id;
end;
$$;

revoke all on function core_pm.send_chat_message(uuid, text, jsonb) from public;
grant execute on function core_pm.send_chat_message(uuid, text, jsonb) to authenticated;

create or replace function core_pm.mark_chat_room_read(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not core_pm.can_access_chat_room(p_room_id) then
    raise exception 'Tidak punya akses room chat';
  end if;

  insert into core_pm.chat_room_reads (user_id, room_id, last_read_at)
  values (v_uid, p_room_id, now())
  on conflict (user_id, room_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

revoke all on function core_pm.mark_chat_room_read(uuid) from public;
grant execute on function core_pm.mark_chat_room_read(uuid) to authenticated;

create or replace function core_pm.delete_chat_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not core_pm.can_delete_chat_message(p_message_id) then
    raise exception 'Tidak boleh menghapus pesan ini';
  end if;

  delete from core_pm.chat_messages where id = p_message_id;
end;
$$;

revoke all on function core_pm.delete_chat_message(uuid) from public;
grant execute on function core_pm.delete_chat_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Purge saat soft-delete parent
-- ---------------------------------------------------------------------------
create or replace function core_pm.purge_chat_rooms_for_organization(p_org_id uuid)
returns void
language sql
security definer
set search_path = core_pm, public
as $$
  delete from core_pm.chat_rooms where organization_id = p_org_id;
$$;

create or replace function core_pm.trg_purge_chat_on_org_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = core_pm, public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    perform core_pm.purge_chat_rooms_for_organization(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_organizations_purge_chat on core_pm.organizations;
create trigger trg_organizations_purge_chat
  after update of deleted_at on core_pm.organizations
  for each row execute function core_pm.trg_purge_chat_on_org_soft_delete();

create or replace function core_pm.trg_purge_chat_on_project_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = core_pm, public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from core_pm.chat_rooms where project_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_projects_purge_chat on core_pm.projects;
create trigger trg_projects_purge_chat
  after update of deleted_at on core_pm.projects
  for each row execute function core_pm.trg_purge_chat_on_project_soft_delete();

create or replace function core_pm.trg_purge_chat_on_virtual_row_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = core_pm, public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from core_pm.chat_rooms where virtual_row_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_virtual_rows_purge_chat on core_pm.virtual_rows;
create trigger trg_virtual_rows_purge_chat
  after update of deleted_at on core_pm.virtual_rows
  for each row execute function core_pm.trg_purge_chat_on_virtual_row_soft_delete();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table core_pm.chat_rooms enable row level security;
alter table core_pm.chat_messages enable row level security;
alter table core_pm.chat_room_reads enable row level security;

grant select on table core_pm.chat_rooms to authenticated;
grant select, insert, update, delete on table core_pm.chat_messages to authenticated;
grant select, insert, update on table core_pm.chat_room_reads to authenticated;

create policy "chat_rooms_select"
  on core_pm.chat_rooms for select to authenticated
  using (core_pm.can_access_chat_room(id));

create policy "chat_messages_select"
  on core_pm.chat_messages for select to authenticated
  using (core_pm.can_access_chat_room(room_id));

create policy "chat_messages_insert"
  on core_pm.chat_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and core_pm.can_access_chat_room(room_id)
  );

create policy "chat_messages_delete"
  on core_pm.chat_messages for delete to authenticated
  using (core_pm.can_delete_chat_message(id));

create policy "chat_room_reads_select_own"
  on core_pm.chat_room_reads for select to authenticated
  using (user_id = auth.uid());

create policy "chat_room_reads_upsert_own"
  on core_pm.chat_room_reads for insert to authenticated
  with check (user_id = auth.uid());

create policy "chat_room_reads_update_own"
  on core_pm.chat_room_reads for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Realtime
alter table core_pm.chat_messages replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table core_pm.chat_messages;
  end if;
exception
  when duplicate_object then null;
end;
$$;

notify pgrst, 'reload schema';
