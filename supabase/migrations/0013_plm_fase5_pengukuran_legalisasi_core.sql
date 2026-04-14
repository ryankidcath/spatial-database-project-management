-- Fase 5 slice F5-1: permohonan info spasial + pengukuran_* + legalisasi_gu (+ file)
-- Selaras §3.9–§3.11 dan §10.2 catatan; legalisasi 1:N per berkas (daftar ulang).

-- --- Informasi spasial (1 berkas = maks 1 baris aktif) ---

create table plm.permohonan_informasi_spasial (
  id uuid primary key default gen_random_uuid(),
  berkas_id uuid not null unique references plm.berkas_permohonan (id) on delete cascade,
  tanggal_permohonan date not null default (current_date),
  status_hasil text not null default 'perlu_review'
    check (status_hasil in ('layak_lanjut', 'tidak_layak', 'perlu_review')),
  tanggal_sps date,
  nominal_sps numeric(14, 2),
  tanggal_bayar_sps date,
  tanggal_download_hasil date,
  hasil_geojson jsonb,
  hasil_geom geometry(MultiPolygon, 4326),
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_plm_pis_berkas on plm.permohonan_informasi_spasial (berkas_id);
create index idx_plm_pis_deleted on plm.permohonan_informasi_spasial (deleted_at)
  where deleted_at is null;
create index idx_plm_pis_hasil_geom on plm.permohonan_informasi_spasial
  using gist (hasil_geom) where hasil_geom is not null;

comment on table plm.permohonan_informasi_spasial is
  'Hasil permohonan informasi spasial per berkas (§3.9); gate ke pengukuran.';

-- --- Master alat ukur (per organisasi) ---

create table plm.alat_ukur (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core_pm.organizations (id) on delete cascade,
  kode_aset text not null,
  jenis text not null default 'gnss' check (jenis = 'gnss'),
  merek_model text,
  serial_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, kode_aset)
);

create index idx_plm_alat_org on plm.alat_ukur (organization_id);

comment on table plm.alat_ukur is
  'Master perangkat ukur (GNSS); §3.10.';

-- --- Pengukuran lapangan (N per berkas; pengukuran ulang) ---

create table plm.pengukuran_lapangan (
  id uuid primary key default gen_random_uuid(),
  berkas_id uuid not null references plm.berkas_permohonan (id) on delete cascade,
  permohonan_informasi_spasial_id uuid references plm.permohonan_informasi_spasial (id) on delete set null,
  nomor_surat_tugas text,
  tanggal_surat_tugas date,
  nomor_surat_pemberitahuan text,
  tanggal_surat_pemberitahuan date,
  tanggal_janji_ukur date,
  tanggal_realisasi_ukur date,
  status text not null default 'dijadwalkan'
    check (status in ('dijadwalkan', 'diukur', 'olah_cad', 'selesai')),
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_plm_ukur_berkas on plm.pengukuran_lapangan (berkas_id);
create index idx_plm_ukur_permohonan on plm.pengukuran_lapangan (permohonan_informasi_spasial_id);
create index idx_plm_ukur_deleted on plm.pengukuran_lapangan (deleted_at) where deleted_at is null;

comment on table plm.pengukuran_lapangan is
  'Header kegiatan ukur lapangan per berkas; §3.10.';

create table plm.pengukuran_surveyor (
  id uuid primary key default gen_random_uuid(),
  pengukuran_id uuid not null references plm.pengukuran_lapangan (id) on delete cascade,
  surveyor_user_id uuid,
  peran text not null default 'anggota' check (peran in ('ketua', 'anggota')),
  created_at timestamptz not null default now()
);

create index idx_plm_ukur_surveyor_peng on plm.pengukuran_surveyor (pengukuran_id);

comment on table plm.pengukuran_surveyor is
  'Tim surveyor per pengukuran; surveyor_user_id opsional (auth user).';

create table plm.pengukuran_alat (
  id uuid primary key default gen_random_uuid(),
  pengukuran_id uuid not null references plm.pengukuran_lapangan (id) on delete cascade,
  alat_id uuid not null references plm.alat_ukur (id) on delete restrict,
  peran_alat text not null check (peran_alat in ('base', 'rover', 'unit_1', 'unit_2')),
  created_at timestamptz not null default now(),
  unique (pengukuran_id, alat_id)
);

create index idx_plm_ukur_alat_peng on plm.pengukuran_alat (pengukuran_id);
create index idx_plm_ukur_alat_alat on plm.pengukuran_alat (alat_id);

comment on table plm.pengukuran_alat is
  'Alat GNSS dipakai pada satu pengukuran (biasanya 1–2 unit).';

create table plm.pengukuran_dokumen (
  id uuid primary key default gen_random_uuid(),
  pengukuran_id uuid not null references plm.pengukuran_lapangan (id) on delete cascade,
  tipe_dokumen text not null check (tipe_dokumen in ('gu_referensi', 'hasil_cad')),
  file_name text not null,
  mime_type text,
  storage_key text,
  storage_url text,
  uploaded_at timestamptz,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

create index idx_plm_ukur_dok_peng on plm.pengukuran_dokumen (pengukuran_id);

comment on table plm.pengukuran_dokumen is
  'Lampiran GU referensi / hasil CAD; storage_* untuk Supabase Storage nanti.';

-- --- Legalisasi GU (1:N per berkas — daftar ulang) ---

create table plm.legalisasi_gu (
  id uuid primary key default gen_random_uuid(),
  berkas_id uuid not null references plm.berkas_permohonan (id) on delete cascade,
  permohonan_informasi_spasial_id uuid references plm.permohonan_informasi_spasial (id) on delete set null,
  pengukuran_id uuid references plm.pengukuran_lapangan (id) on delete set null,
  bidang_hasil_ukur_id uuid references spatial.bidang_hasil_ukur (id) on delete set null,
  status_tahap text not null default 'draft'
    check (status_tahap in (
      'draft', 'submit_bpn', 'verifikasi_sps', 'terbit_gu',
      'integrasi_bidang', 'tte_upload', 'selesai'
    )),
  kantor_pertanahan text,
  nomor_berkas_legalisasi text,
  tanggal_berkas_legalisasi date,
  penggunaan_tanah text,
  luas_hasil_ukur integer,
  tanggal_submit timestamptz,
  tanggal_sps date,
  nominal_sps numeric(14, 2),
  tanggal_bayar_sps date,
  nomor_gu text,
  tanggal_gu date,
  nib_baru text,
  tanggal_nib date,
  nomor_pbt text,
  tanggal_pbt date,
  tanggal_tte_gu date,
  tanggal_tte_pbt date,
  tanggal_upload_gu date,
  tanggal_upload_pbt date,
  tanggal_persetujuan date,
  tanggal_penyelesaian date,
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_plm_leg_berkas on plm.legalisasi_gu (berkas_id);
create index idx_plm_leg_deleted on plm.legalisasi_gu (deleted_at) where deleted_at is null;
create index idx_plm_leg_nib on plm.legalisasi_gu (nib_baru) where nib_baru is not null;

comment on table plm.legalisasi_gu is
  'Alur legalisasi GU BPN (tahap 1–6); beberapa baris per berkas untuk daftar ulang; §3.11.';

create table plm.legalisasi_gu_file (
  id uuid primary key default gen_random_uuid(),
  legalisasi_gu_id uuid not null references plm.legalisasi_gu (id) on delete cascade,
  tipe_file text not null check (tipe_file in (
    'hasil_ukur', 'scan_berkas', 'scan_sketsa_gu', 'sps_download',
    'gu_signed', 'pbt_signed', 'dokumen_lain'
  )),
  file_name text not null,
  mime_type text,
  storage_key text,
  storage_url text,
  uploaded_by uuid,
  uploaded_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_plm_leg_file_leg on plm.legalisasi_gu_file (legalisasi_gu_id);

comment on table plm.legalisasi_gu_file is
  'Lampiran per tahap legalisasi; wajib tahap 1/2/5 di aplikasi (§3.11).';

-- --- Seed demo (berkas BKS-2026-0042 + org KJSB) ---

insert into plm.permohonan_informasi_spasial (
  id, berkas_id, tanggal_permohonan, status_hasil, tanggal_download_hasil, catatan
)
values (
  '77777777-7777-4777-8777-777777770001',
  '66666666-6666-4666-8666-666666660001',
  '2026-01-20',
  'layak_lanjut',
  '2026-01-22',
  'Seed F5-1 — siap pengukuran'
);

insert into plm.alat_ukur (
  id, organization_id, kode_aset, jenis, merek_model, serial_number, is_active
)
values (
  '77777777-7777-4777-8777-777777770010',
  '11111111-1111-4111-8111-111111111111',
  'GNSS-DEMO-01',
  'gnss',
  'Generic GNSS',
  'SN-DEMO-001',
  true
);

insert into plm.pengukuran_lapangan (
  id, berkas_id, permohonan_informasi_spasial_id,
  nomor_surat_tugas, tanggal_surat_tugas,
  nomor_surat_pemberitahuan, tanggal_surat_pemberitahuan,
  tanggal_janji_ukur, status, catatan
)
values (
  '77777777-7777-4777-8777-777777770020',
  '66666666-6666-4666-8666-666666660001',
  '77777777-7777-4777-8777-777777770001',
  'ST-2026-0042-01',
  '2026-02-01',
  'SP-2026-0042-01',
  '2026-02-02',
  '2026-02-10',
  'dijadwalkan',
  'Seed F5-1 pengukuran'
);

insert into plm.pengukuran_surveyor (id, pengukuran_id, surveyor_user_id, peran)
values (
  '77777777-7777-4777-8777-777777770021',
  '77777777-7777-4777-8777-777777770020',
  null,
  'ketua'
);

insert into plm.pengukuran_alat (id, pengukuran_id, alat_id, peran_alat)
values (
  '77777777-7777-4777-8777-777777770022',
  '77777777-7777-4777-8777-777777770020',
  '77777777-7777-4777-8777-777777770010',
  'base'
);

insert into plm.legalisasi_gu (
  id, berkas_id, permohonan_informasi_spasial_id, pengukuran_id,
  bidang_hasil_ukur_id, status_tahap, kantor_pertanahan,
  nomor_berkas_legalisasi, tanggal_berkas_legalisasi, luas_hasil_ukur, catatan
)
values (
  '77777777-7777-4777-8777-777777770030',
  '66666666-6666-4666-8666-666666660001',
  '77777777-7777-4777-8777-777777770001',
  '77777777-7777-4777-8777-777777770020',
  (select id from spatial.bidang_hasil_ukur where berkas_id = '66666666-6666-4666-8666-666666660001' limit 1),
  'draft',
  'Kantah Kota Cirebon',
  'LEG-2026-0042-01',
  '2026-02-15',
  1250,
  'Seed F5-1 legalisasi (tahap draft)'
);

-- --- Grants ---

revoke all on table plm.permohonan_informasi_spasial from public;
revoke all on table plm.alat_ukur from public;
revoke all on table plm.pengukuran_lapangan from public;
revoke all on table plm.pengukuran_surveyor from public;
revoke all on table plm.pengukuran_alat from public;
revoke all on table plm.pengukuran_dokumen from public;
revoke all on table plm.legalisasi_gu from public;
revoke all on table plm.legalisasi_gu_file from public;

revoke all on table plm.permohonan_informasi_spasial from anon;
revoke all on table plm.alat_ukur from anon;
revoke all on table plm.pengukuran_lapangan from anon;
revoke all on table plm.pengukuran_surveyor from anon;
revoke all on table plm.pengukuran_alat from anon;
revoke all on table plm.pengukuran_dokumen from anon;
revoke all on table plm.legalisasi_gu from anon;
revoke all on table plm.legalisasi_gu_file from anon;

grant select, insert, update, delete on table plm.permohonan_informasi_spasial to authenticated;
grant select, insert, update, delete on table plm.alat_ukur to authenticated;
grant select, insert, update, delete on table plm.pengukuran_lapangan to authenticated;
grant select, insert, update, delete on table plm.pengukuran_surveyor to authenticated;
grant select, insert, update, delete on table plm.pengukuran_alat to authenticated;
grant select, insert, update, delete on table plm.pengukuran_dokumen to authenticated;
grant select, insert, update, delete on table plm.legalisasi_gu to authenticated;
grant select, insert, update, delete on table plm.legalisasi_gu_file to authenticated;

-- --- RLS (akses lewat anggota project pada berkas / organisasi alat) ---

alter table plm.permohonan_informasi_spasial enable row level security;
alter table plm.alat_ukur enable row level security;
alter table plm.pengukuran_lapangan enable row level security;
alter table plm.pengukuran_surveyor enable row level security;
alter table plm.pengukuran_alat enable row level security;
alter table plm.pengukuran_dokumen enable row level security;
alter table plm.legalisasi_gu enable row level security;
alter table plm.legalisasi_gu_file enable row level security;

-- permohonan_informasi_spasial
create policy "plm_pis_select_member"
  on plm.permohonan_informasi_spasial for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from plm.berkas_permohonan b
      where b.id = permohonan_informasi_spasial.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_pis_insert_member"
  on plm.permohonan_informasi_spasial for insert to authenticated
  with check (
    exists (
      select 1 from plm.berkas_permohonan b
      where b.id = permohonan_informasi_spasial.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_pis_update_member"
  on plm.permohonan_informasi_spasial for update to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from plm.berkas_permohonan b
      where b.id = permohonan_informasi_spasial.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  )
  with check (
    exists (
      select 1 from plm.berkas_permohonan b
      where b.id = permohonan_informasi_spasial.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_pis_delete_member"
  on plm.permohonan_informasi_spasial for delete to authenticated
  using (
    exists (
      select 1 from plm.berkas_permohonan b
      where b.id = permohonan_informasi_spasial.berkas_id
        and core_pm.is_project_member(b.project_id)
    )
  );

-- alat_ukur (sama pola pemilik_tanah)
create policy "plm_alat_select_member"
  on plm.alat_ukur for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from core_pm.projects p
      where p.organization_id = alat_ukur.organization_id
        and p.deleted_at is null
        and core_pm.is_project_member(p.id)
    )
  );

create policy "plm_alat_insert_member"
  on plm.alat_ukur for insert to authenticated
  with check (
    exists (
      select 1 from core_pm.projects p
      where p.organization_id = alat_ukur.organization_id
        and p.deleted_at is null
        and core_pm.is_project_member(p.id)
    )
  );

create policy "plm_alat_update_member"
  on plm.alat_ukur for update to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from core_pm.projects p
      where p.organization_id = alat_ukur.organization_id
        and p.deleted_at is null
        and core_pm.is_project_member(p.id)
    )
  )
  with check (
    exists (
      select 1 from core_pm.projects p
      where p.organization_id = alat_ukur.organization_id
        and p.deleted_at is null
        and core_pm.is_project_member(p.id)
    )
  );

create policy "plm_alat_delete_member"
  on plm.alat_ukur for delete to authenticated
  using (
    exists (
      select 1 from core_pm.projects p
      where p.organization_id = alat_ukur.organization_id
        and p.deleted_at is null
        and core_pm.is_project_member(p.id)
    )
  );

-- pengukuran_lapangan
create policy "plm_ukur_select_member"
  on plm.pengukuran_lapangan for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from plm.berkas_permohonan b
      where b.id = pengukuran_lapangan.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_ukur_insert_member"
  on plm.pengukuran_lapangan for insert to authenticated
  with check (
    exists (
      select 1 from plm.berkas_permohonan b
      where b.id = pengukuran_lapangan.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_ukur_update_member"
  on plm.pengukuran_lapangan for update to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from plm.berkas_permohonan b
      where b.id = pengukuran_lapangan.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  )
  with check (
    exists (
      select 1 from plm.berkas_permohonan b
      where b.id = pengukuran_lapangan.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_ukur_delete_member"
  on plm.pengukuran_lapangan for delete to authenticated
  using (
    exists (
      select 1 from plm.berkas_permohonan b
      where b.id = pengukuran_lapangan.berkas_id
        and core_pm.is_project_member(b.project_id)
    )
  );

-- pengukuran_surveyor (via pengukuran)
create policy "plm_ukur_surveyor_select_member"
  on plm.pengukuran_surveyor for select to authenticated
  using (
    exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = pengukuran_surveyor.pengukuran_id
        and u.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_ukur_surveyor_insert_member"
  on plm.pengukuran_surveyor for insert to authenticated
  with check (
    exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = pengukuran_surveyor.pengukuran_id
        and u.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_ukur_surveyor_update_member"
  on plm.pengukuran_surveyor for update to authenticated
  using (
    exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = pengukuran_surveyor.pengukuran_id
        and u.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  )
  with check (
    exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = pengukuran_surveyor.pengukuran_id
        and u.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_ukur_surveyor_delete_member"
  on plm.pengukuran_surveyor for delete to authenticated
  using (
    exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = pengukuran_surveyor.pengukuran_id
        and core_pm.is_project_member(b.project_id)
    )
  );

-- pengukuran_alat (pengukuran + alat org konsisten — disederhanakan: cukup cek via pengukuran)
create policy "plm_ukur_alat_select_member"
  on plm.pengukuran_alat for select to authenticated
  using (
    exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = pengukuran_alat.pengukuran_id
        and u.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_ukur_alat_insert_member"
  on plm.pengukuran_alat for insert to authenticated
  with check (
    exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      join plm.alat_ukur a on a.id = pengukuran_alat.alat_id
      join core_pm.projects p on p.id = b.project_id
      where u.id = pengukuran_alat.pengukuran_id
        and u.deleted_at is null
        and b.deleted_at is null
        and a.deleted_at is null
        and p.organization_id = a.organization_id
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_ukur_alat_update_member"
  on plm.pengukuran_alat for update to authenticated
  using (
    exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = pengukuran_alat.pengukuran_id
        and u.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  )
  with check (
    exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      join plm.alat_ukur a on a.id = pengukuran_alat.alat_id
      where u.id = pengukuran_alat.pengukuran_id
        and u.deleted_at is null
        and b.deleted_at is null
        and a.deleted_at is null
        and exists (
          select 1 from core_pm.projects p
          where p.id = b.project_id and p.organization_id = a.organization_id
        )
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_ukur_alat_delete_member"
  on plm.pengukuran_alat for delete to authenticated
  using (
    exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = pengukuran_alat.pengukuran_id
        and core_pm.is_project_member(b.project_id)
    )
  );

-- pengukuran_dokumen
create policy "plm_ukur_dok_select_member"
  on plm.pengukuran_dokumen for select to authenticated
  using (
    exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = pengukuran_dokumen.pengukuran_id
        and u.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_ukur_dok_insert_member"
  on plm.pengukuran_dokumen for insert to authenticated
  with check (
    exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = pengukuran_dokumen.pengukuran_id
        and u.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_ukur_dok_update_member"
  on plm.pengukuran_dokumen for update to authenticated
  using (
    exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = pengukuran_dokumen.pengukuran_id
        and u.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  )
  with check (
    exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = pengukuran_dokumen.pengukuran_id
        and u.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_ukur_dok_delete_member"
  on plm.pengukuran_dokumen for delete to authenticated
  using (
    exists (
      select 1 from plm.pengukuran_lapangan u
      join plm.berkas_permohonan b on b.id = u.berkas_id
      where u.id = pengukuran_dokumen.pengukuran_id
        and core_pm.is_project_member(b.project_id)
    )
  );

-- legalisasi_gu
create policy "plm_leg_select_member"
  on plm.legalisasi_gu for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from plm.berkas_permohonan b
      where b.id = legalisasi_gu.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_leg_insert_member"
  on plm.legalisasi_gu for insert to authenticated
  with check (
    exists (
      select 1 from plm.berkas_permohonan b
      where b.id = legalisasi_gu.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_leg_update_member"
  on plm.legalisasi_gu for update to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from plm.berkas_permohonan b
      where b.id = legalisasi_gu.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  )
  with check (
    exists (
      select 1 from plm.berkas_permohonan b
      where b.id = legalisasi_gu.berkas_id
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_leg_delete_member"
  on plm.legalisasi_gu for delete to authenticated
  using (
    exists (
      select 1 from plm.berkas_permohonan b
      where b.id = legalisasi_gu.berkas_id
        and core_pm.is_project_member(b.project_id)
    )
  );

-- legalisasi_gu_file
create policy "plm_leg_file_select_member"
  on plm.legalisasi_gu_file for select to authenticated
  using (
    exists (
      select 1 from plm.legalisasi_gu lg
      join plm.berkas_permohonan b on b.id = lg.berkas_id
      where lg.id = legalisasi_gu_file.legalisasi_gu_id
        and lg.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_leg_file_insert_member"
  on plm.legalisasi_gu_file for insert to authenticated
  with check (
    exists (
      select 1 from plm.legalisasi_gu lg
      join plm.berkas_permohonan b on b.id = lg.berkas_id
      where lg.id = legalisasi_gu_file.legalisasi_gu_id
        and lg.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_leg_file_update_member"
  on plm.legalisasi_gu_file for update to authenticated
  using (
    exists (
      select 1 from plm.legalisasi_gu lg
      join plm.berkas_permohonan b on b.id = lg.berkas_id
      where lg.id = legalisasi_gu_file.legalisasi_gu_id
        and lg.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  )
  with check (
    exists (
      select 1 from plm.legalisasi_gu lg
      join plm.berkas_permohonan b on b.id = lg.berkas_id
      where lg.id = legalisasi_gu_file.legalisasi_gu_id
        and lg.deleted_at is null
        and b.deleted_at is null
        and core_pm.is_project_member(b.project_id)
    )
  );

create policy "plm_leg_file_delete_member"
  on plm.legalisasi_gu_file for delete to authenticated
  using (
    exists (
      select 1 from plm.legalisasi_gu lg
      join plm.berkas_permohonan b on b.id = lg.berkas_id
      where lg.id = legalisasi_gu_file.legalisasi_gu_id
        and core_pm.is_project_member(b.project_id)
    )
  );
