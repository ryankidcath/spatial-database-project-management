-- Chat room per virtual_table (diskusi tingkat tabel).

alter table core_pm.chat_rooms
  add column if not exists virtual_table_id uuid
    references core_pm.virtual_tables (id) on delete cascade;

alter table core_pm.chat_rooms drop constraint if exists chat_rooms_scope_refs;

alter table core_pm.chat_rooms drop constraint if exists chat_rooms_scope_type_check;

alter table core_pm.chat_rooms
  add constraint chat_rooms_scope_type_check
  check (scope_type in ('organization', 'project', 'virtual_row', 'virtual_table'));

alter table core_pm.chat_rooms
  add constraint chat_rooms_scope_refs check (
    (scope_type = 'organization' and project_id is null and virtual_row_id is null and virtual_table_id is null)
    or (scope_type = 'project' and project_id is not null and virtual_row_id is null and virtual_table_id is null)
    or (scope_type = 'virtual_row' and virtual_row_id is not null and virtual_table_id is null)
    or (scope_type = 'virtual_table' and virtual_table_id is not null and virtual_row_id is null)
  );

create unique index if not exists uq_chat_rooms_virtual_table
  on core_pm.chat_rooms (virtual_table_id)
  where scope_type = 'virtual_table';

create index if not exists idx_chat_rooms_virtual_table
  on core_pm.chat_rooms (virtual_table_id)
  where virtual_table_id is not null;

-- ---------------------------------------------------------------------------
-- Akses baca tabel (mirror RLS virtual_tables)
-- ---------------------------------------------------------------------------
create or replace function core_pm.can_read_virtual_table(p_table_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core_pm, public
as $$
  select exists (
    select 1
    from core_pm.virtual_tables vt
    where vt.id = p_table_id
      and vt.deleted_at is null
      and (
        (vt.project_id is not null and core_pm.is_project_member(vt.project_id))
        or
        (vt.organization_id is not null and core_pm.has_org_staff_access(vt.organization_id))
      )
  );
$$;

revoke all on function core_pm.can_read_virtual_table(uuid) from public;
grant execute on function core_pm.can_read_virtual_table(uuid) to authenticated;

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
    when 'virtual_table' then
      return core_pm.can_read_virtual_table(r.virtual_table_id);
    else
      return false;
  end case;
end;
$$;

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
    when 'virtual_table' then
      return exists (
        select 1
        from core_pm.virtual_tables vt
        where vt.id = r.virtual_table_id
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

drop function if exists core_pm.get_or_create_chat_room(text, uuid, uuid, uuid);

create or replace function core_pm.get_or_create_chat_room(
  p_scope_type text,
  p_organization_id uuid,
  p_project_id uuid default null,
  p_virtual_row_id uuid default null,
  p_virtual_table_id uuid default null
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

  if v_scope = 'virtual_table' then
    if p_virtual_table_id is null then
      raise exception 'virtual_table_id wajib';
    end if;
    if not core_pm.can_read_virtual_table(p_virtual_table_id) then
      raise exception 'Tidak punya akses room tabel';
    end if;
    select vt.organization_id, vt.project_id
    into v_org_id, p_project_id
    from core_pm.virtual_tables vt
    where vt.id = p_virtual_table_id and vt.deleted_at is null;
    if v_org_id is null and p_project_id is not null then
      select organization_id into v_org_id
      from core_pm.projects where id = p_project_id and deleted_at is null;
    end if;
    select id into v_room_id
    from core_pm.chat_rooms
    where scope_type = 'virtual_table' and virtual_table_id = p_virtual_table_id;
    if v_room_id is null then
      insert into core_pm.chat_rooms (
        scope_type, organization_id, project_id, virtual_table_id
      )
      values ('virtual_table', v_org_id, p_project_id, p_virtual_table_id)
      returning id into v_room_id;
    end if;
    return v_room_id;
  end if;

  raise exception 'scope_type tidak valid';
end;
$$;

revoke all on function core_pm.get_or_create_chat_room(text, uuid, uuid, uuid, uuid) from public;
grant execute on function core_pm.get_or_create_chat_room(text, uuid, uuid, uuid, uuid) to authenticated;

-- Purge room tabel saat soft-delete virtual_tables
create or replace function core_pm.trg_purge_chat_on_virtual_table_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = core_pm, public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from core_pm.chat_rooms where virtual_table_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_virtual_tables_purge_chat on core_pm.virtual_tables;
create trigger trg_virtual_tables_purge_chat
  after update of deleted_at on core_pm.virtual_tables
  for each row execute function core_pm.trg_purge_chat_on_virtual_table_soft_delete();

-- Badge: total (room tabel + semua baris) + breakdown room tabel
drop function if exists core_pm.get_virtual_table_chat_unread_counts(uuid[]);

create or replace function core_pm.get_virtual_table_chat_unread_counts(
  p_table_ids uuid[]
)
returns table (
  virtual_table_id uuid,
  unread_count bigint,
  table_room_unread_count bigint
)
language sql
stable
security definer
set search_path = core_pm, public
as $$
  with v_uid as (
    select auth.uid() as id
  ),
  row_unread as (
    select
      vr.table_id as virtual_table_id,
      count(*)::bigint as cnt
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
  ),
  table_room_unread as (
    select
      cr.virtual_table_id as virtual_table_id,
      count(*)::bigint as cnt
    from core_pm.chat_messages m
    cross join v_uid
    inner join core_pm.chat_rooms cr on cr.id = m.room_id
    inner join core_pm.virtual_tables vt on vt.id = cr.virtual_table_id
    left join core_pm.chat_room_reads crr
      on crr.room_id = cr.id and crr.user_id = v_uid.id
    where v_uid.id is not null
      and cr.scope_type = 'virtual_table'
      and vt.deleted_at is null
      and cr.virtual_table_id = any (coalesce(p_table_ids, array[]::uuid[]))
      and m.author_id <> v_uid.id
      and m.created_at > coalesce(crr.last_read_at, '-infinity'::timestamptz)
      and core_pm.user_can_access_chat_room(v_uid.id, cr.id)
    group by cr.virtual_table_id
  ),
  merged as (
    select virtual_table_id, sum(cnt)::bigint as unread_count
    from (
      select virtual_table_id, cnt from row_unread
      union all
      select virtual_table_id, cnt from table_room_unread
    ) u
    group by virtual_table_id
  )
  select
    m.virtual_table_id,
    m.unread_count,
    coalesce(tr.cnt, 0)::bigint as table_room_unread_count
  from merged m
  left join table_room_unread tr on tr.virtual_table_id = m.virtual_table_id
  where m.unread_count > 0;
$$;

revoke all on function core_pm.get_virtual_table_chat_unread_counts(uuid[]) from public;
grant execute on function core_pm.get_virtual_table_chat_unread_counts(uuid[]) to authenticated;

notify pgrst, 'reload schema';
