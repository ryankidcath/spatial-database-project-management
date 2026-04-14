-- F6-1: audit trail generik (append-only) — selaras §21 catatan.

create table core_pm.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core_pm.organizations (id) on delete cascade,
  project_id uuid references core_pm.projects (id) on delete set null,
  actor_user_id uuid not null,
  action text not null,
  entity text not null,
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_core_pm_audit_org_created
  on core_pm.audit_log (organization_id, created_at desc);

create index idx_core_pm_audit_project_created
  on core_pm.audit_log (project_id, created_at desc)
  where project_id is not null;

create index idx_core_pm_audit_entity
  on core_pm.audit_log (entity, entity_id);

comment on table core_pm.audit_log is
  'Log audit generik (F6-1): aksi kritis PLM/core; payload ringkas, tanpa blob.';

-- --- Grants ---

revoke all on table core_pm.audit_log from public;
revoke all on table core_pm.audit_log from anon;

grant select, insert on table core_pm.audit_log to authenticated;

alter table core_pm.audit_log enable row level security;

-- Baca: baris bertahap project → anggota project saja; baris hanya org → anggota org.
create policy "core_pm_audit_log_select_scoped"
  on core_pm.audit_log for select to authenticated
  using (
    (
      project_id is not null
      and core_pm.is_project_member(project_id)
    )
    or (
      project_id is null
      and core_pm.is_organization_member(organization_id)
    )
  );

-- Tulis: sebagai auth.uid(); konsistensi org↔project bila project_id diisi.
create policy "core_pm_audit_log_insert_scoped"
  on core_pm.audit_log for insert to authenticated
  with check (
    actor_user_id = auth.uid()
    and core_pm.is_organization_member(organization_id)
    and (
      project_id is null
      or (
        core_pm.is_project_member(project_id)
        and exists (
          select 1 from core_pm.projects p
          where p.id = audit_log.project_id
            and p.organization_id = audit_log.organization_id
            and p.deleted_at is null
        )
      )
    )
  );
