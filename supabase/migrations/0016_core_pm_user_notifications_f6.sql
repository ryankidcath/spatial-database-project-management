-- F6-2: notifikasi in-app (per user) + RLS — selaras §21 catatan.

create table core_pm.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references core_pm.organizations (id) on delete cascade,
  project_id uuid references core_pm.projects (id) on delete set null,
  kind text not null
    check (kind in ('spatial_overlap', 'system')),
  severity text not null default 'warning'
    check (severity in ('info', 'warning', 'error')),
  title text not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_core_pm_user_notif_user_unread
  on core_pm.user_notifications (user_id, created_at desc)
  where read_at is null;

create index idx_core_pm_user_notif_user_created
  on core_pm.user_notifications (user_id, created_at desc);

comment on table core_pm.user_notifications is
  'Notifikasi in-app per user (F6-2); overlap spasial disinkron dari app.';

revoke all on table core_pm.user_notifications from public;
revoke all on table core_pm.user_notifications from anon;

grant select, insert, update, delete on table core_pm.user_notifications to authenticated;

alter table core_pm.user_notifications enable row level security;

create policy "core_pm_user_notif_select_own"
  on core_pm.user_notifications for select to authenticated
  using (user_id = auth.uid());

create policy "core_pm_user_notif_insert_own_scoped"
  on core_pm.user_notifications for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (
        project_id is not null
        and exists (
          select 1 from core_pm.projects p
          where p.id = user_notifications.project_id
            and p.organization_id = user_notifications.organization_id
            and p.deleted_at is null
        )
        and core_pm.is_project_member(project_id)
      )
      or (
        project_id is null
        and core_pm.is_organization_member(organization_id)
      )
    )
  );

create policy "core_pm_user_notif_update_own"
  on core_pm.user_notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "core_pm_user_notif_delete_own"
  on core_pm.user_notifications for delete to authenticated
  using (user_id = auth.uid());
