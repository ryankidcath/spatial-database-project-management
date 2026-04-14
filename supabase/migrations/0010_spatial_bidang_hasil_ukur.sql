-- Fase 4 slice F4-1: PostGIS + bidang hasil ukur (1:1 berkas) — §10.3 catatan

create extension if not exists postgis;

-- --- Hasil ukur terikat satu berkas PLM ---

create table spatial.bidang_hasil_ukur (
  id uuid primary key default gen_random_uuid(),
  berkas_id uuid not null unique references plm.berkas_permohonan (id) on delete cascade,
  label text,
  geom geometry(MultiPolygon, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bidang_hasil_ukur_geom_valid check (ST_IsValid(geom)),
  constraint bidang_hasil_ukur_geom_area_pos check (ST_Area(geom::geography) > 0)
);

create index idx_spatial_bidang_hasil_ukur_geom
  on spatial.bidang_hasil_ukur using gist (geom);

create index idx_spatial_bidang_hasil_ukur_berkas
  on spatial.bidang_hasil_ukur (berkas_id);

comment on table spatial.bidang_hasil_ukur is
  'Geometri hasil ukur (MultiPolygon 4326) 1:1 dengan plm.berkas_permohonan.';

-- --- Seed: satu bidang untuk berkas demo BKS-2026-0042 (Cirebon) ---

insert into spatial.bidang_hasil_ukur (berkas_id, label, geom)
values (
  '66666666-6666-4666-8666-666666660001',
  'Bidang hasil ukur demo (F4-1)',
  ST_SetSRID(
    ST_Multi(
      ST_GeomFromText(
        'POLYGON((108.537 -6.748, 108.552 -6.748, 108.552 -6.736, 108.537 -6.736, 108.537 -6.748))'
      )
    ),
    4326
  )
);

-- --- Grants (hanya authenticated; selaras increment 7 pada spatial) ---

revoke all on table spatial.bidang_hasil_ukur from public;
revoke all on table spatial.bidang_hasil_ukur from anon;

grant select, insert, update, delete on table spatial.bidang_hasil_ukur to authenticated;

-- --- RLS: akses lewat keanggotaan project pada berkas ---

alter table spatial.bidang_hasil_ukur enable row level security;

create policy "spatial_bidang_hasil_ukur_select_member"
  on spatial.bidang_hasil_ukur for select to authenticated
  using (
    exists (
      select 1
      from plm.berkas_permohonan b
      where b.id = bidang_hasil_ukur.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "spatial_bidang_hasil_ukur_insert_member"
  on spatial.bidang_hasil_ukur for insert to authenticated
  with check (
    exists (
      select 1
      from plm.berkas_permohonan b
      where b.id = bidang_hasil_ukur.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "spatial_bidang_hasil_ukur_update_member"
  on spatial.bidang_hasil_ukur for update to authenticated
  using (
    exists (
      select 1
      from plm.berkas_permohonan b
      where b.id = bidang_hasil_ukur.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  )
  with check (
    exists (
      select 1
      from plm.berkas_permohonan b
      where b.id = bidang_hasil_ukur.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "spatial_bidang_hasil_ukur_delete_member"
  on spatial.bidang_hasil_ukur for delete to authenticated
  using (
    exists (
      select 1
      from plm.berkas_permohonan b
      where b.id = bidang_hasil_ukur.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );
