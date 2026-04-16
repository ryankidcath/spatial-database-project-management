-- Opsi B lanjutan: banyak bidang geometri per issue (1:N).
-- Setiap baris = satu fitur/bidang yang terikat ke core_pm.issues.

create table spatial.issue_geometry_features (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references core_pm.issues (id) on delete cascade,
  feature_key text not null,
  label text,
  properties jsonb not null default '{}'::jsonb,
  geom geometry(MultiPolygon, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint issue_geometry_features_feature_key_not_blank
    check (length(trim(feature_key)) > 0),
  constraint issue_geometry_features_geom_valid check (ST_IsValid(geom)),
  constraint issue_geometry_features_geom_area_pos check (ST_Area(geom::geography) > 0),
  constraint issue_geometry_features_props_object check (jsonb_typeof(properties) = 'object')
);

create unique index uq_spatial_issue_geometry_features_issue_key
  on spatial.issue_geometry_features (issue_id, feature_key);

create index idx_spatial_issue_geometry_features_issue
  on spatial.issue_geometry_features (issue_id);

create index idx_spatial_issue_geometry_features_geom
  on spatial.issue_geometry_features using gist (geom);

create index idx_spatial_issue_geometry_features_props
  on spatial.issue_geometry_features using gin (properties);

comment on table spatial.issue_geometry_features is
  'Fitur geometri (bidang) per issue, untuk skenario 1:N. Satu issue dapat memiliki banyak baris.';

comment on column spatial.issue_geometry_features.feature_key is
  'Kunci fitur per issue (mis. nomor bidang / id eksternal), unik pada issue yang sama.';

comment on column spatial.issue_geometry_features.properties is
  'Atribut fleksibel per bidang dalam format JSON object.';

create or replace view spatial.v_issue_geometry_feature_map as
select
  igf.id,
  i.project_id,
  igf.issue_id,
  igf.feature_key,
  coalesce(
    nullif(trim(igf.label), ''),
    nullif(trim(i.title), ''),
    igf.feature_key,
    'Bidang'
  ) as label,
  igf.properties,
  (st_asgeojson(igf.geom)::jsonb) as geojson
from spatial.issue_geometry_features igf
inner join core_pm.issues i
  on i.id = igf.issue_id
  and i.deleted_at is null;

comment on view spatial.v_issue_geometry_feature_map is
  'Map layer geometri bidang per issue (1:N), termasuk properties JSON per fitur.';

revoke all on table spatial.issue_geometry_features from public;
revoke all on table spatial.issue_geometry_features from anon;
grant select, insert, update, delete on table spatial.issue_geometry_features to authenticated;

alter table spatial.issue_geometry_features enable row level security;

create policy "spatial_issue_geometry_features_select_member"
  on spatial.issue_geometry_features for select to authenticated
  using (
    exists (
      select 1
      from core_pm.issues i
      where i.id = issue_geometry_features.issue_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

create policy "spatial_issue_geometry_features_insert_member"
  on spatial.issue_geometry_features for insert to authenticated
  with check (
    exists (
      select 1
      from core_pm.issues i
      where i.id = issue_geometry_features.issue_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

create policy "spatial_issue_geometry_features_update_member"
  on spatial.issue_geometry_features for update to authenticated
  using (
    exists (
      select 1
      from core_pm.issues i
      where i.id = issue_geometry_features.issue_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  )
  with check (
    exists (
      select 1
      from core_pm.issues i
      where i.id = issue_geometry_features.issue_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

create policy "spatial_issue_geometry_features_delete_member"
  on spatial.issue_geometry_features for delete to authenticated
  using (
    exists (
      select 1
      from core_pm.issues i
      where i.id = issue_geometry_features.issue_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

revoke all on table spatial.v_issue_geometry_feature_map from public;
revoke all on table spatial.v_issue_geometry_feature_map from anon;
grant select on table spatial.v_issue_geometry_feature_map to authenticated;

-- Seed transisi: salin data 1:1 lama menjadi fitur dengan key "legacy-main".
insert into spatial.issue_geometry_features (issue_id, feature_key, label, properties, geom)
select
  ig.issue_id,
  'legacy-main'::text,
  ig.label,
  '{}'::jsonb,
  ig.geom
from spatial.issue_geometries ig
inner join core_pm.issues i
  on i.id = ig.issue_id
  and i.deleted_at is null
on conflict (issue_id, feature_key) do nothing;
