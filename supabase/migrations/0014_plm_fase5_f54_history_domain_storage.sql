-- F5-4: jejak legalisasi, unik domain GU/NIB per Kantah+tahun, bucket Storage + policy.

-- --- Riwayat peristiwa legalisasi ---

create table plm.legalisasi_gu_history (
  id uuid primary key default gen_random_uuid(),
  legalisasi_gu_id uuid not null references plm.legalisasi_gu (id) on delete cascade,
  actor_user_id uuid,
  event_kind text not null
    check (event_kind in ('patch', 'advance', 'file_added', 'draft_created')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_plm_leg_hist_legal_created
  on plm.legalisasi_gu_history (legalisasi_gu_id, created_at desc);

comment on table plm.legalisasi_gu_history is
  'Log peristiwa legalisasi GU (patch field, naik tahap, lampiran, draft); F5-4.';

-- --- Unik domain: nomor_gu / nib_baru per Kantah + tahun terkait ---

create unique index uq_plm_leg_nomor_gu_kantor_tahun
  on plm.legalisasi_gu (
    lower(trim(both from coalesce(kantor_pertanahan, ''))),
    trim(both from nomor_gu),
    (extract(year from tanggal_gu::date))
  )
  where deleted_at is null
    and coalesce(trim(both from nomor_gu), '') <> ''
    and tanggal_gu is not null;

create unique index uq_plm_leg_nib_baru_kantor_tahun
  on plm.legalisasi_gu (
    lower(trim(both from coalesce(kantor_pertanahan, ''))),
    lower(trim(both from nib_baru)),
    (extract(year from tanggal_nib::date))
  )
  where deleted_at is null
    and coalesce(trim(both from nib_baru), '') <> ''
    and tanggal_nib is not null;

-- --- Grants + RLS history ---

revoke all on table plm.legalisasi_gu_history from public;
revoke all on table plm.legalisasi_gu_history from anon;

grant select, insert on table plm.legalisasi_gu_history to authenticated;

alter table plm.legalisasi_gu_history enable row level security;

create policy "plm_leg_hist_select_member"
  on plm.legalisasi_gu_history for select to authenticated
  using (
    exists (
      select 1 from plm.legalisasi_gu lg
      join plm.berkas_permohonan b on b.id = lg.berkas_id
      where lg.id = legalisasi_gu_history.legalisasi_gu_id
        and lg.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_leg_hist_insert_member"
  on plm.legalisasi_gu_history for insert to authenticated
  with check (
    actor_user_id = auth.uid()
    and exists (
      select 1 from plm.legalisasi_gu lg
      join plm.berkas_permohonan b on b.id = lg.berkas_id
      where lg.id = legalisasi_gu_history.legalisasi_gu_id
        and lg.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

-- --- Storage buckets (private) ---

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('plm-legalisasi', 'plm-legalisasi', false, 52428800, null),
  ('plm-pengukuran', 'plm-pengukuran', false, 52428800, null)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit;

-- Path: {legalisasi_gu_id}/{uuid}-{filename}  atau  {pengukuran_lapangan_id}/...

-- Legalisasi: SELECT
create policy "plm_f54_leg_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'plm-legalisasi'
    and split_part(name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (
      select 1 from plm.legalisasi_gu lg
      join plm.berkas_permohonan b on b.id = lg.berkas_id
      where lg.id = split_part(name, '/', 1)::uuid
        and lg.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_f54_leg_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'plm-legalisasi'
    and split_part(name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (
      select 1 from plm.legalisasi_gu lg
      join plm.berkas_permohonan b on b.id = lg.berkas_id
      where lg.id = split_part(name, '/', 1)::uuid
        and lg.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_f54_leg_storage_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'plm-legalisasi'
    and split_part(name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (
      select 1 from plm.legalisasi_gu lg
      join plm.berkas_permohonan b on b.id = lg.berkas_id
      where lg.id = split_part(name, '/', 1)::uuid
        and lg.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_f54_leg_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'plm-legalisasi'
    and split_part(name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (
      select 1 from plm.legalisasi_gu lg
      join plm.berkas_permohonan b on b.id = lg.berkas_id
      where lg.id = split_part(name, '/', 1)::uuid
        and lg.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

-- Pengukuran: SELECT
create policy "plm_f54_peng_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'plm-pengukuran'
    and split_part(name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = split_part(name, '/', 1)::uuid
        and u.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_f54_peng_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'plm-pengukuran'
    and split_part(name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = split_part(name, '/', 1)::uuid
        and u.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_f54_peng_storage_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'plm-pengukuran'
    and split_part(name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = split_part(name, '/', 1)::uuid
        and u.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_f54_peng_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'plm-pengukuran'
    and split_part(name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = split_part(name, '/', 1)::uuid
        and u.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );
