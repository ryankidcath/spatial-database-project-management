-- Debounce vrow.cell_changed (2 menit per table_id + row_id + column_slug).

create table if not exists core_pm.virtual_row_cell_notification_pending (
  table_id uuid not null references core_pm.virtual_tables (id) on delete cascade,
  row_id uuid not null,
  column_slug text not null,
  organization_id uuid not null references core_pm.organizations (id) on delete cascade,
  project_id uuid references core_pm.projects (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  column_display_name text not null,
  row_label text not null,
  old_value jsonb,
  new_value jsonb,
  first_enqueued_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (table_id, row_id, column_slug)
);

comment on table core_pm.virtual_row_cell_notification_pending is
  'Buffer debounce notifikasi edit sel (docs/notifikasi-event-matrix.md fase 2).';

revoke all on table core_pm.virtual_row_cell_notification_pending from public;

alter table core_pm.virtual_row_cell_notification_pending enable row level security;

-- ---------------------------------------------------------------------------
-- Flush pending yang sudah melewati jendela debounce (2 menit)
-- ---------------------------------------------------------------------------
create or replace function core_pm.flush_due_virtual_row_cell_notifications()
returns int
language plpgsql
security definer
set search_path = core_pm, public, auth
as $$
declare
  rec record;
  v_count int := 0;
  v_old text;
  v_new text;
  v_body text;
  v_table_name text;
begin
  for rec in
    select p.*
    from core_pm.virtual_row_cell_notification_pending p
    where p.first_enqueued_at <= now() - interval '2 minutes'
    order by p.first_enqueued_at
    for update skip locked
  loop
    select vt.display_name into v_table_name
    from core_pm.virtual_tables vt
    where vt.id = rec.table_id;

    v_old := coalesce(rec.old_value #>> '{}', rec.old_value::text, '—');
    v_new := coalesce(rec.new_value #>> '{}', rec.new_value::text, '—');
    if jsonb_typeof(rec.old_value) = 'string' then
      v_old := rec.old_value #>> '{}';
    end if;
    if jsonb_typeof(rec.new_value) = 'string' then
      v_new := rec.new_value #>> '{}';
    end if;
    if rec.old_value is null then
      v_old := '—';
    end if;
    if rec.new_value is null then
      v_new := '—';
    end if;

    v_body := v_old || ' → ' || v_new
      || ' · Tabel ' || coalesce(v_table_name, '—');

    perform core_pm.dispatch_workspace_notification(
      'cell_value_changed',
      'virtual_row',
      rec.organization_id,
      rec.project_id,
      rec.actor_user_id,
      rec.column_display_name || ' diubah — ' || rec.row_label,
      v_body,
      jsonb_build_object(
        'event_id', 'vrow.cell_changed',
        'virtual_table_id', rec.table_id,
        'virtual_row_id', rec.row_id,
        'column_slug', rec.column_slug,
        'column_display_name', rec.column_display_name,
        'old_value', rec.old_value,
        'new_value', rec.new_value,
        'row_label', rec.row_label
      ),
      'info'
    );

    delete from core_pm.virtual_row_cell_notification_pending
    where table_id = rec.table_id
      and row_id = rec.row_id
      and column_slug = rec.column_slug;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enqueue / coalesce edit sel
-- ---------------------------------------------------------------------------
create or replace function core_pm.enqueue_virtual_row_cell_notification(
  p_table_id uuid,
  p_row_id uuid,
  p_column_slug text,
  p_organization_id uuid,
  p_project_id uuid,
  p_actor_user_id uuid,
  p_column_display_name text,
  p_row_label text,
  p_old_value jsonb,
  p_new_value jsonb
)
returns void
language plpgsql
security definer
set search_path = core_pm, public, auth
as $$
declare
  v_existing core_pm.virtual_row_cell_notification_pending%rowtype;
begin
  perform core_pm.flush_due_virtual_row_cell_notifications();

  select * into v_existing
  from core_pm.virtual_row_cell_notification_pending
  where table_id = p_table_id
    and row_id = p_row_id
    and column_slug = p_column_slug;

  if found then
    update core_pm.virtual_row_cell_notification_pending
    set
      new_value = p_new_value,
      updated_at = now(),
      actor_user_id = p_actor_user_id
    where table_id = p_table_id
      and row_id = p_row_id
      and column_slug = p_column_slug;
    return;
  end if;

  insert into core_pm.virtual_row_cell_notification_pending (
    table_id,
    row_id,
    column_slug,
    organization_id,
    project_id,
    actor_user_id,
    column_display_name,
    row_label,
    old_value,
    new_value
  )
  values (
    p_table_id,
    p_row_id,
    p_column_slug,
    p_organization_id,
    p_project_id,
    p_actor_user_id,
    p_column_display_name,
    p_row_label,
    p_old_value,
    p_new_value
  );
end;
$$;

revoke all on function core_pm.flush_due_virtual_row_cell_notifications() from public;
grant execute on function core_pm.flush_due_virtual_row_cell_notifications() to authenticated;

revoke all on function core_pm.enqueue_virtual_row_cell_notification(
  uuid, uuid, text, uuid, uuid, uuid, text, text, jsonb, jsonb
) from public;
grant execute on function core_pm.enqueue_virtual_row_cell_notification(
  uuid, uuid, text, uuid, uuid, uuid, text, text, jsonb, jsonb
) to authenticated;

notify pgrst, 'reload schema';
