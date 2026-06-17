-- Fase 3: filter granular per tabel/kolom + dispatch scoped.

-- ---------------------------------------------------------------------------
-- Scope preferensi (opsional per user per kategori)
-- ---------------------------------------------------------------------------
create table if not exists core_pm.user_notification_scopes (
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null
    check (category in (
      'schema_changes',
      'row_lifecycle',
      'cell_value_changed',
      'import_summary'
    )),
  virtual_table_id uuid not null references core_pm.virtual_tables (id) on delete cascade,
  column_slug text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, category, virtual_table_id, column_slug)
);

comment on table core_pm.user_notification_scopes is
  'Filter opsional: jika ada baris untuk kategori, hanya event tabel/kolom yang cocok (fase 3).';

comment on column core_pm.user_notification_scopes.column_slug is
  'Kosong = seluruh tabel; isi = hanya kolom itu (utama untuk cell_value_changed).';

revoke all on table core_pm.user_notification_scopes from public;
grant select, insert, delete on table core_pm.user_notification_scopes to authenticated;

alter table core_pm.user_notification_scopes enable row level security;

create policy "user_notif_scopes_select_own"
  on core_pm.user_notification_scopes for select to authenticated
  using (user_id = auth.uid());

create policy "user_notif_scopes_insert_own"
  on core_pm.user_notification_scopes for insert to authenticated
  with check (user_id = auth.uid());

create policy "user_notif_scopes_delete_own"
  on core_pm.user_notification_scopes for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Cek kategori + scope opsional
-- ---------------------------------------------------------------------------
create or replace function core_pm.user_wants_notification_scoped(
  p_user_id uuid,
  p_category text,
  p_virtual_table_id uuid default null,
  p_column_slug text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = core_pm, public
as $$
declare
  v_scope_count int;
  v_col text;
begin
  if not core_pm.user_wants_notification(p_user_id, p_category) then
    return false;
  end if;

  if p_category = 'workspace_membership' then
    return true;
  end if;

  if p_virtual_table_id is null then
    return true;
  end if;

  select count(*)::int into v_scope_count
  from core_pm.user_notification_scopes s
  where s.user_id = p_user_id
    and s.category = p_category;

  if v_scope_count = 0 then
    return true;
  end if;

  v_col := coalesce(nullif(trim(p_column_slug), ''), '');

  if v_col <> '' then
    return exists (
      select 1
      from core_pm.user_notification_scopes s
      where s.user_id = p_user_id
        and s.category = p_category
        and s.virtual_table_id = p_virtual_table_id
        and (s.column_slug = '' or s.column_slug = v_col)
    );
  end if;

  return exists (
    select 1
    from core_pm.user_notification_scopes s
    where s.user_id = p_user_id
      and s.category = p_category
      and s.virtual_table_id = p_virtual_table_id
      and s.column_slug = ''
  );
end;
$$;

revoke all on function core_pm.user_wants_notification_scoped(uuid, text, uuid, text) from public;
grant execute on function core_pm.user_wants_notification_scoped(uuid, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Fan-out dengan filter scope
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
  v_table_id uuid;
  v_column_slug text;
begin
  if p_organization_id is null or p_actor_user_id is null or p_title is null then
    return 0;
  end if;

  begin
    v_table_id := nullif(trim(p_payload->>'virtual_table_id'), '')::uuid;
  exception
    when others then
      v_table_id := null;
  end;
  v_column_slug := coalesce(p_payload->>'column_slug', '');

  if p_project_id is not null then
    for rec in
      select pm.user_id as uid
      from core_pm.project_members pm
      where pm.project_id = p_project_id
        and pm.user_id <> p_actor_user_id
    loop
      if core_pm.user_wants_notification_scoped(
        rec.uid, p_preference_category, v_table_id, v_column_slug
      ) then
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
        if core_pm.user_wants_notification_scoped(
          rec.uid, p_preference_category, v_table_id, v_column_slug
        ) then
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
      if core_pm.user_wants_notification_scoped(
        rec.uid, p_preference_category, v_table_id, v_column_slug
      ) then
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

notify pgrst, 'reload schema';
