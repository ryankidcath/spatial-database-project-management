-- Fase 2 slice F2-1: master modul + aktivasi per organisasi (schema core_pm; §9.4 catatan)

-- --- Master modul (katalog; tanpa baris per organisasi) ---

create table core_pm.module_registry (
  module_code text primary key,
  display_name text not null,
  description text,
  is_core boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint module_registry_code_lower
    check (module_code = lower(module_code) and module_code ~ '^[a-z][a-z0-9_]*$')
);

comment on table core_pm.module_registry is
  'Katalog modul aplikasi (core_pm, plm, spatial, finance).';

-- --- Aktivasi modul per organisasi ---

create table core_pm.organization_modules (
  organization_id uuid not null references core_pm.organizations (id) on delete cascade,
  module_code text not null references core_pm.module_registry (module_code) on delete restrict,
  is_enabled boolean not null default false,
  enabled_at timestamptz,
  primary key (organization_id, module_code),
  constraint organization_modules_core_pm_always_on
    check (module_code <> 'core_pm' or is_enabled = true)
);

create index idx_core_pm_organization_modules_org
  on core_pm.organization_modules (organization_id);

comment on table core_pm.organization_modules is
  'Modul aktif per organisasi; core_pm wajib is_enabled true. Mutasi oleh admin/RPC (bukan policy umum authenticated).';

-- --- Seed katalog ---

insert into core_pm.module_registry (module_code, display_name, description, is_core, sort_order)
values
  (
    'core_pm',
    'Core PM',
    'Project, task, board, dan jadwal — selalu aktif.',
    true,
    0
  ),
  (
    'plm',
    'PLM',
    'Berkas permohonan, pemilik, kontak, penerimaan, legalisasi (Fase 3+).',
    false,
    1
  ),
  (
    'spatial',
    'Spasial',
    'Peta, footprint, validasi geometri (bersinggungan Fase 4).',
    false,
    2
  ),
  (
    'finance',
    'Keuangan',
    'Invoice dan pembayaran (opsional).',
    false,
    3
  );

-- --- Seed aktivasi demo (KJSB) — selaras footprint + proyek PLM ---

insert into core_pm.organization_modules (organization_id, module_code, is_enabled, enabled_at)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'core_pm',
    true,
    now()
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'plm',
    true,
    now()
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'spatial',
    true,
    now()
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'finance',
    false,
    null
  );

-- --- Hapus baris core_pm dilarang (constraint + trigger) ---

create or replace function core_pm.organization_modules_prevent_drop_core()
returns trigger
language plpgsql
set search_path = core_pm, public
as $$
begin
  if tg_op = 'DELETE' and old.module_code = 'core_pm' then
    raise exception 'Modul core_pm tidak boleh dihapus dari organization_modules';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_organization_modules_prevent_drop_core on core_pm.organization_modules;
create trigger trg_organization_modules_prevent_drop_core
  before delete on core_pm.organization_modules
  for each row
  execute procedure core_pm.organization_modules_prevent_drop_core();

-- --- Grants: sama pola increment 7 (tanpa anon pada data tenant) ---

revoke all on table core_pm.module_registry from public;
revoke all on table core_pm.organization_modules from public;

grant select on table core_pm.module_registry to authenticated;
grant select on table core_pm.organization_modules to authenticated;

-- --- RLS ---

alter table core_pm.module_registry enable row level security;
alter table core_pm.organization_modules enable row level security;

-- Katalog: semua user terautentikasi boleh baca (bukan rahasia tenant)
create policy "core_pm_module_registry_select_authenticated"
  on core_pm.module_registry for select to authenticated
  using (true);

-- Baris aktivasi: hanya untuk organisasi tempat user anggota minimal satu project
create policy "core_pm_organization_modules_select_member"
  on core_pm.organization_modules for select to authenticated
  using (
    exists (
      select 1
      from core_pm.projects p
      where p.organization_id = organization_modules.organization_id
        and p.deleted_at is null
        and core_pm.is_project_member(p.id)
    )
  );
