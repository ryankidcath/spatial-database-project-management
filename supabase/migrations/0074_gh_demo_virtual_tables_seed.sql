-- Dummy project untuk pengembangan G-H (pola B: hub nominatif + geom terpisah).
-- Org: KJSB Demo. Project key: GHDEMO — «G-H Demo (pola B)».
-- Dua tabel virtual + relasi hub → gambar; 3 bidang (satu tanpa poligon).

-- UUID tetap agar relasi dan dokumentasi stabil.
-- Org KJSB Demo (seed 0002):
--   11111111-1111-4111-8111-111111111111
-- Project GHDEMO:
--   22222222-2222-4222-8222-222222222223
-- Tabel daftar_bidang:
--   aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1
-- Tabel gambar:
--   aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2

insert into core_pm.projects (id, organization_id, name, key, description)
values (
  '22222222-2222-4222-8222-222222222223',
  '11111111-1111-4111-8111-111111111111',
  'G-H Demo (pola B)',
  'GHDEMO',
  'Dummy minimal: Daftar Bidang (nominatif) + Gambar (geom) — untuk sprint G-H'
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  deleted_at = null;

insert into core_pm.virtual_tables (id, project_id, slug, display_name, description, icon, sort_order)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '22222222-2222-4222-8222-222222222223',
    'daftar_bidang',
    'Daftar Bidang',
    'Hub nominatif (tanpa geometry) — pola B',
    '📋',
    0
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    '22222222-2222-4222-8222-222222222223',
    'gambar',
    'Gambar',
    'Poligon CAD/surveyor — kolom geometry',
    '🗺️',
    1
  )
on conflict (id) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  deleted_at = null;

insert into core_pm.virtual_columns (id, table_id, slug, display_name, data_type, position, config)
values
  (
    'd1111111-1111-4111-8111-111111111101',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'no_bidang',
    'No. Bidang',
    'text',
    0,
    '{}'::jsonb
  ),
  (
    'd1111111-1111-4111-8111-111111111102',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'pemilik',
    'Pemilik',
    'text',
    1,
    '{}'::jsonb
  ),
  (
    'd1111111-1111-4111-8111-111111111103',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'gambar',
    'Gambar',
    'relation',
    2,
    jsonb_build_object(
      'target_table_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      'is_multi', false
    )
  ),
  (
    'd2222222-2222-4222-8222-222222222221',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'no_gambar',
    'No. Gambar',
    'text',
    0,
    '{}'::jsonb
  ),
  (
    'd2222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'label',
    'Label',
    'text',
    1,
    '{}'::jsonb
  ),
  (
    'd2222222-2222-4222-8222-222222222223',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'geometry',
    'Geometry',
    'geometry',
    2,
    '{}'::jsonb
  )
on conflict (id) do update set
  display_name = excluded.display_name,
  data_type = excluded.data_type,
  position = excluded.position,
  config = excluded.config;

-- Baris gambar (harus ada sebelum relasi dari bidang).
insert into core_pm.virtual_rows (id, table_id, payload, sort_order)
values
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    jsonb_build_object(
      'no_gambar', 'G001',
      'label', 'Poligon Ahmad',
      'geometry', jsonb_build_object(
        'type', 'Feature',
        'properties', jsonb_build_object('no_gambar', 'G001'),
        'geometry', jsonb_build_object(
          'type', 'Polygon',
          'coordinates', jsonb_build_array(
            jsonb_build_array(
              jsonb_build_array(108.540, -6.745),
              jsonb_build_array(108.545, -6.745),
              jsonb_build_array(108.545, -6.740),
              jsonb_build_array(108.540, -6.740),
              jsonb_build_array(108.540, -6.745)
            )
          )
        )
      )
    ),
    0
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    jsonb_build_object(
      'no_gambar', 'G002',
      'label', 'Poligon Budi',
      'geometry', jsonb_build_object(
        'type', 'Feature',
        'properties', jsonb_build_object('no_gambar', 'G002'),
        'geometry', jsonb_build_object(
          'type', 'Polygon',
          'coordinates', jsonb_build_array(
            jsonb_build_array(
              jsonb_build_array(108.548, -6.744),
              jsonb_build_array(108.553, -6.744),
              jsonb_build_array(108.553, -6.739),
              jsonb_build_array(108.548, -6.739),
              jsonb_build_array(108.548, -6.744)
            )
          )
        )
      )
    ),
    1
  )
on conflict (id) do update set
  payload = excluded.payload,
  sort_order = excluded.sort_order,
  deleted_at = null;

insert into core_pm.virtual_rows (id, table_id, payload, sort_order)
values
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    jsonb_build_object(
      'no_bidang', 'B001',
      'pemilik', 'Ahmad',
      'gambar', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
    ),
    0
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    jsonb_build_object(
      'no_bidang', 'B002',
      'pemilik', 'Budi',
      'gambar', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
    ),
    1
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    jsonb_build_object(
      'no_bidang', 'B003',
      'pemilik', 'Citra (tanpa gambar)',
      'gambar', null
    ),
    2
  )
on conflict (id) do update set
  payload = excluded.payload,
  sort_order = excluded.sort_order,
  deleted_at = null;

-- Anggota org yang sudah ada otomatis dapat akses project baru.
do $$
begin
  perform core_pm.sync_org_staff_to_all_projects('11111111-1111-4111-8111-111111111111');
end;
$$;
