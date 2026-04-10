-- Dummy GeoJSON per project untuk increment 8 (Map / Leaflet) — tanpa PostGIS

create table spatial.project_demo_footprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references core_pm.projects (id) on delete cascade,
  label text not null,
  geojson jsonb not null,
  created_at timestamptz not null default now(),
  constraint spatial_demo_geojson_object check (jsonb_typeof(geojson) = 'object')
);

create index idx_spatial_demo_footprints_project
  on spatial.project_demo_footprints (project_id);

comment on table spatial.project_demo_footprints is
  'Seed demo: footprint GeoJSON (Feature) per project — ganti ke model spasial penuh di Fase 4.';

grant usage on schema spatial to anon, authenticated;
grant select, insert, update, delete on spatial.project_demo_footprints to anon, authenticated;
alter default privileges in schema spatial grant select, insert, update, delete on tables to anon, authenticated;

alter table spatial.project_demo_footprints enable row level security;

create policy "spatial_dev_all_project_demo_footprints"
  on spatial.project_demo_footprints
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Dua poligon kecil (WGS84) di sekitar Cirebon — PLM Cirebon 2026
insert into spatial.project_demo_footprints (project_id, label, geojson)
values
  (
    '22222222-2222-4222-8222-222222222221',
    'Lokasi kerja A (demo)',
    '{
      "type": "Feature",
      "properties": { "stroke": "#2563eb", "fill": "#3b82f633" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [108.537, -6.748],
            [108.552, -6.748],
            [108.552, -6.736],
            [108.537, -6.736],
            [108.537, -6.748]
          ]
        ]
      }
    }'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222221',
    'Lokasi kerja B (demo)',
    '{
      "type": "Feature",
      "properties": { "stroke": "#0d9488", "fill": "#14b8a633" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [108.555, -6.742],
            [108.568, -6.742],
            [108.568, -6.732],
            [108.555, -6.732],
            [108.555, -6.742]
          ]
        ]
      }
    }'::jsonb
  );

-- Satu footprint untuk PM Internal (skala beda, tetap valid)
insert into spatial.project_demo_footprints (project_id, label, geojson)
values
  (
    '22222222-2222-4222-8222-222222222222',
    'Kantor / wilayah internal (demo)',
    '{
      "type": "Feature",
      "properties": { "stroke": "#7c3aed", "fill": "#a78bfa33" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [106.80, -6.20],
            [106.82, -6.20],
            [106.82, -6.18],
            [106.80, -6.18],
            [106.80, -6.20]
          ]
        ]
      }
    }'::jsonb
  );
