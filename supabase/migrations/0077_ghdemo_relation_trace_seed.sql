-- GHDEMO: data tambahan agar G-D5 trace relasi terlihat di peta.
-- Pola: (1) Gambar → Gambar terkait; (2) Bidang → bidang sebelah → geom lain.
-- Setelah migration: klik G001 atau G002 di Spasial → garis oranye ke poligon terkait.

-- Kolom relasi baru
insert into core_pm.virtual_columns (id, table_id, slug, display_name, data_type, position, config)
values
  (
    'd1111111-1111-4111-8111-111111111104',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'bidang_sebelah',
    'Bidang sebelah',
    'relation',
    3,
    jsonb_build_object(
      'target_table_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'is_multi', false
    )
  ),
  (
    'd2222222-2222-4222-8222-222222222224',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'gambar_terkait',
    'Gambar terkait',
    'relation',
    3,
    jsonb_build_object(
      'target_table_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      'is_multi', false
    )
  )
on conflict (id) do update set
  display_name = excluded.display_name,
  data_type = excluded.data_type,
  position = excluded.position,
  config = excluded.config;

-- Poligon ketiga (selatan) — rantai G001 → G002 → G003
insert into core_pm.virtual_rows (id, table_id, payload, sort_order)
values
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    jsonb_build_object(
      'no_gambar', 'G003',
      'label', 'Poligon Citra (trace)',
      'geometry', jsonb_build_object(
        'type', 'Feature',
        'properties', jsonb_build_object('no_gambar', 'G003'),
        'geometry', jsonb_build_object(
          'type', 'Polygon',
          'coordinates', jsonb_build_array(
            jsonb_build_array(
              jsonb_build_array(108.542, -6.738),
              jsonb_build_array(108.551, -6.738),
              jsonb_build_array(108.551, -6.734),
              jsonb_build_array(108.542, -6.734),
              jsonb_build_array(108.542, -6.738)
            )
          )
        )
      ),
      'gambar_terkait', null
    ),
    2
  )
on conflict (id) do update set
  payload = excluded.payload,
  sort_order = excluded.sort_order,
  deleted_at = null;

-- Rantai geom: G001 → G002 → G003
update core_pm.virtual_rows
set payload = payload
  || jsonb_build_object(
    'gambar_terkait', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  )
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

update core_pm.virtual_rows
set payload = payload
  || jsonb_build_object(
    'gambar_terkait', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3'
  )
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

-- Hub tetangga: B001 ↔ B002 (trace lewat geom masing-masing)
update core_pm.virtual_rows
set payload = payload
  || jsonb_build_object(
    'bidang_sebelah', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'
  )
where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';

update core_pm.virtual_rows
set payload = payload
  || jsonb_build_object(
    'bidang_sebelah', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
  )
where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';

-- B003 tetap tanpa gambar; isi lewat G-H5 impor jika perlu
