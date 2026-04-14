-- Modul finance MVP: invoice + item + pembayaran; RLS anggota project (§9.4, §10.4 catatan).

-- --- invoice ---

create table finance.invoice (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core_pm.organizations (id) on delete restrict,
  project_id uuid not null references core_pm.projects (id) on delete cascade,
  berkas_id uuid references plm.berkas_permohonan (id) on delete set null,
  nomor_invoice text not null,
  status text not null default 'draft',
  currency text not null default 'IDR',
  total_amount numeric(18, 2) not null default 0,
  notes text,
  issued_at timestamptz,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint finance_invoice_status_check
    check (status in ('draft', 'issued', 'paid', 'cancelled')),
  constraint finance_invoice_total_nonneg check (total_amount >= 0)
);

create index idx_finance_invoice_project on finance.invoice (project_id) where deleted_at is null;
create index idx_finance_invoice_org on finance.invoice (organization_id) where deleted_at is null;
create unique index uq_finance_invoice_nomor_per_org
  on finance.invoice (organization_id, nomor_invoice)
  where deleted_at is null;
create unique index uq_finance_invoice_berkas_active
  on finance.invoice (berkas_id)
  where berkas_id is not null and deleted_at is null;

comment on table finance.invoice is
  'Invoice per project; berkas_id opsional (satu berkas aktif max satu invoice).';

-- --- invoice_item ---

create table finance.invoice_item (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references finance.invoice (id) on delete cascade,
  urutan smallint not null default 0,
  description text not null default '',
  quantity numeric(18, 4) not null default 1,
  unit_price numeric(18, 2) not null default 0,
  line_total numeric(18, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint finance_invoice_item_qty_pos check (quantity > 0),
  constraint finance_invoice_item_line_nonneg check (line_total >= 0)
);

create index idx_finance_invoice_item_invoice on finance.invoice_item (invoice_id);

comment on table finance.invoice_item is
  'Baris invoice; line_total disinkronkan dari app.';

-- --- pembayaran ---

create table finance.pembayaran (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references finance.invoice (id) on delete cascade,
  amount numeric(18, 2) not null,
  paid_at timestamptz not null default now(),
  method text,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  constraint finance_pembayaran_amount_pos check (amount > 0)
);

create index idx_finance_pembayaran_invoice on finance.pembayaran (invoice_id);

comment on table finance.pembayaran is
  'Pembayaran / kwitansi terhadap invoice.';

-- --- Validasi organization + berkas ---

create or replace function finance.invoice_before_write_validate()
returns trigger
language plpgsql
set search_path = core_pm, plm, finance, public
as $$
declare
  v_org uuid;
begin
  select p.organization_id into v_org
  from core_pm.projects p
  where p.id = new.project_id
    and p.deleted_at is null;
  if v_org is null then
    raise exception 'Project tidak valid';
  end if;
  if new.organization_id is distinct from v_org then
    raise exception 'organization_id tidak cocok dengan project';
  end if;
  if new.berkas_id is not null then
    if not exists (
      select 1
      from plm.berkas_permohonan b
      where b.id = new.berkas_id
        and b.project_id = new.project_id
        and b.deleted_at is null
    ) then
      raise exception 'berkas_id tidak termasuk project ini atau sudah dihapus';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_finance_invoice_validate on finance.invoice;
create trigger trg_finance_invoice_validate
  before insert or update on finance.invoice
  for each row
  execute procedure finance.invoice_before_write_validate();

-- --- Grants ---

revoke all on schema finance from public;
grant usage on schema finance to authenticated;

revoke all on table finance.invoice from public;
revoke all on table finance.invoice_item from public;
revoke all on table finance.pembayaran from public;

grant select, insert, update, delete on table finance.invoice to authenticated;
grant select, insert, update, delete on table finance.invoice_item to authenticated;
grant select, insert, update, delete on table finance.pembayaran to authenticated;

-- --- RLS invoice ---

alter table finance.invoice enable row level security;

create policy "finance_invoice_select_member"
  on finance.invoice for select to authenticated
  using (
    deleted_at is null
    and core_pm.is_project_member(invoice.project_id)
  );

create policy "finance_invoice_insert_member"
  on finance.invoice for insert to authenticated
  with check (core_pm.is_project_member(invoice.project_id));

create policy "finance_invoice_update_member"
  on finance.invoice for update to authenticated
  using (
    deleted_at is null
    and core_pm.is_project_member(invoice.project_id)
  )
  with check (core_pm.is_project_member(invoice.project_id));

create policy "finance_invoice_delete_member"
  on finance.invoice for delete to authenticated
  using (core_pm.is_project_member(invoice.project_id));

-- --- RLS invoice_item ---

alter table finance.invoice_item enable row level security;

create policy "finance_invoice_item_select_member"
  on finance.invoice_item for select to authenticated
  using (
    exists (
      select 1
      from finance.invoice i
      where i.id = invoice_item.invoice_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

create policy "finance_invoice_item_insert_member"
  on finance.invoice_item for insert to authenticated
  with check (
    exists (
      select 1
      from finance.invoice i
      where i.id = invoice_item.invoice_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

create policy "finance_invoice_item_update_member"
  on finance.invoice_item for update to authenticated
  using (
    exists (
      select 1
      from finance.invoice i
      where i.id = invoice_item.invoice_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  )
  with check (
    exists (
      select 1
      from finance.invoice i
      where i.id = invoice_item.invoice_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

create policy "finance_invoice_item_delete_member"
  on finance.invoice_item for delete to authenticated
  using (
    exists (
      select 1
      from finance.invoice i
      where i.id = invoice_item.invoice_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

-- --- RLS pembayaran ---

alter table finance.pembayaran enable row level security;

create policy "finance_pembayaran_select_member"
  on finance.pembayaran for select to authenticated
  using (
    exists (
      select 1
      from finance.invoice i
      where i.id = pembayaran.invoice_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

create policy "finance_pembayaran_insert_member"
  on finance.pembayaran for insert to authenticated
  with check (
    exists (
      select 1
      from finance.invoice i
      where i.id = pembayaran.invoice_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

create policy "finance_pembayaran_update_member"
  on finance.pembayaran for update to authenticated
  using (
    exists (
      select 1
      from finance.invoice i
      where i.id = pembayaran.invoice_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  )
  with check (
    exists (
      select 1
      from finance.invoice i
      where i.id = pembayaran.invoice_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

create policy "finance_pembayaran_delete_member"
  on finance.pembayaran for delete to authenticated
  using (
    exists (
      select 1
      from finance.invoice i
      where i.id = pembayaran.invoice_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );
