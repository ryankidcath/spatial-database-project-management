-- Virtual Tables: meta-schema untuk custom tables buatan user.
-- Tiga tabel fisik: virtual_tables, virtual_columns, virtual_rows.
-- Data per cell disimpan di virtual_rows.payload (JSONB-per-Row).
-- Tidak mengubah tabel yang sudah ada.

-- =========================================================================
-- 1. virtual_tables — definisi "tabel" buatan user, scope per project
-- =========================================================================

create table core_pm.virtual_tables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references core_pm.projects (id) on delete cascade,
  slug text not null,
  display_name text not null,
  description text,
  icon text,
  sort_order int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint virtual_tables_slug_format
    check (slug ~ '^[a-z][a-z0-9_]*$'),
  constraint virtual_tables_display_name_not_blank
    check (length(trim(display_name)) > 0)
);

create unique index uq_virtual_tables_project_slug
  on core_pm.virtual_tables (project_id, slug)
  where deleted_at is null;

create index idx_virtual_tables_project
  on core_pm.virtual_tables (project_id)
  where deleted_at is null;

comment on table core_pm.virtual_tables is
  'Definisi tabel custom buatan user; scope per project. Data baris di virtual_rows.';

-- =========================================================================
-- 2. virtual_columns — definisi "kolom" per virtual table
-- =========================================================================

create table core_pm.virtual_columns (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references core_pm.virtual_tables (id) on delete cascade,
  slug text not null,
  display_name text not null,
  data_type text not null,
  position int not null default 0,
  is_required boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint virtual_columns_slug_format
    check (slug ~ '^[a-z][a-z0-9_]*$'),
  constraint virtual_columns_display_name_not_blank
    check (length(trim(display_name)) > 0),
  constraint virtual_columns_data_type_valid
    check (data_type in (
      'text', 'number', 'date', 'select', 'checkbox',
      'url', 'user', 'file', 'relation', 'geometry'
    )),
  constraint virtual_columns_config_object
    check (jsonb_typeof(config) = 'object')
);

create unique index uq_virtual_columns_table_slug
  on core_pm.virtual_columns (table_id, slug);

create index idx_virtual_columns_table
  on core_pm.virtual_columns (table_id);

comment on table core_pm.virtual_columns is
  'Definisi kolom per virtual table. slug dipakai sebagai key di virtual_rows.payload.';

comment on column core_pm.virtual_columns.config is
  'Konfigurasi per tipe: options (select), target_table_id + is_multi (relation), dll.';

-- =========================================================================
-- 3. virtual_rows — baris data, payload JSONB berisi semua nilai
-- =========================================================================

create table core_pm.virtual_rows (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references core_pm.virtual_tables (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint virtual_rows_payload_object
    check (jsonb_typeof(payload) = 'object')
);

create index idx_virtual_rows_table_sort
  on core_pm.virtual_rows (table_id, sort_order)
  where deleted_at is null;

create index idx_virtual_rows_payload
  on core_pm.virtual_rows using gin (payload);

comment on table core_pm.virtual_rows is
  'Baris data virtual table. Semua nilai cell disimpan di payload (key = column slug).';

-- =========================================================================
-- 4. Grants — authenticated saja, tanpa anon
-- =========================================================================

revoke all on table core_pm.virtual_tables from public;
revoke all on table core_pm.virtual_columns from public;
revoke all on table core_pm.virtual_rows from public;

revoke all on table core_pm.virtual_tables from anon;
revoke all on table core_pm.virtual_columns from anon;
revoke all on table core_pm.virtual_rows from anon;

grant select, insert, update, delete on table core_pm.virtual_tables to authenticated;
grant select, insert, update, delete on table core_pm.virtual_columns to authenticated;
grant select, insert, update, delete on table core_pm.virtual_rows to authenticated;

-- =========================================================================
-- 5. RLS — akses berdasarkan keanggotaan project (via is_project_member)
-- =========================================================================

-- --- virtual_tables ---

alter table core_pm.virtual_tables enable row level security;

create policy "virtual_tables_select_member"
  on core_pm.virtual_tables for select to authenticated
  using (
    deleted_at is null
    and core_pm.is_project_member(virtual_tables.project_id)
  );

create policy "virtual_tables_insert_member"
  on core_pm.virtual_tables for insert to authenticated
  with check (
    core_pm.is_project_member(virtual_tables.project_id)
  );

create policy "virtual_tables_update_member"
  on core_pm.virtual_tables for update to authenticated
  using (
    deleted_at is null
    and core_pm.is_project_member(virtual_tables.project_id)
  )
  with check (
    core_pm.is_project_member(virtual_tables.project_id)
  );

create policy "virtual_tables_delete_member"
  on core_pm.virtual_tables for delete to authenticated
  using (
    core_pm.is_project_member(virtual_tables.project_id)
  );

-- --- virtual_columns (akses via tabel induk) ---

alter table core_pm.virtual_columns enable row level security;

create policy "virtual_columns_select_member"
  on core_pm.virtual_columns for select to authenticated
  using (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_columns.table_id
        and vt.deleted_at is null
        and core_pm.is_project_member(vt.project_id)
    )
  );

create policy "virtual_columns_insert_member"
  on core_pm.virtual_columns for insert to authenticated
  with check (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_columns.table_id
        and vt.deleted_at is null
        and core_pm.is_project_member(vt.project_id)
    )
  );

create policy "virtual_columns_update_member"
  on core_pm.virtual_columns for update to authenticated
  using (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_columns.table_id
        and vt.deleted_at is null
        and core_pm.is_project_member(vt.project_id)
    )
  )
  with check (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_columns.table_id
        and vt.deleted_at is null
        and core_pm.is_project_member(vt.project_id)
    )
  );

create policy "virtual_columns_delete_member"
  on core_pm.virtual_columns for delete to authenticated
  using (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_columns.table_id
        and vt.deleted_at is null
        and core_pm.is_project_member(vt.project_id)
    )
  );

-- --- virtual_rows (akses via tabel induk) ---

alter table core_pm.virtual_rows enable row level security;

create policy "virtual_rows_select_member"
  on core_pm.virtual_rows for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_rows.table_id
        and vt.deleted_at is null
        and core_pm.is_project_member(vt.project_id)
    )
  );

create policy "virtual_rows_insert_member"
  on core_pm.virtual_rows for insert to authenticated
  with check (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_rows.table_id
        and vt.deleted_at is null
        and core_pm.is_project_member(vt.project_id)
    )
  );

create policy "virtual_rows_update_member"
  on core_pm.virtual_rows for update to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_rows.table_id
        and vt.deleted_at is null
        and core_pm.is_project_member(vt.project_id)
    )
  )
  with check (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_rows.table_id
        and vt.deleted_at is null
        and core_pm.is_project_member(vt.project_id)
    )
  );

create policy "virtual_rows_delete_member"
  on core_pm.virtual_rows for delete to authenticated
  using (
    exists (
      select 1 from core_pm.virtual_tables vt
      where vt.id = virtual_rows.table_id
        and vt.deleted_at is null
        and core_pm.is_project_member(vt.project_id)
    )
  );
