-- Opsi B: geometri PostGIS per task (core_pm.issues), tanpa wajib berkas PLM.
-- Satu baris geometri per issue (unique issue_id). Map konsumsi view GeoJSON.

create table spatial.issue_geometries (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null unique references core_pm.issues (id) on delete cascade,
  label text,
  geom geometry(MultiPolygon, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint issue_geometries_geom_valid check (ST_IsValid(geom)),
  constraint issue_geometries_geom_area_pos check (ST_Area(geom::geography) > 0)
);

create index idx_spatial_issue_geometries_geom
  on spatial.issue_geometries using gist (geom);

create index idx_spatial_issue_geometries_issue
  on spatial.issue_geometries (issue_id);

comment on table spatial.issue_geometries is
  'MultiPolygon WGS84 per issue (1:1). Untuk isi awal: insert geom + issue_id yang project-nya sudah diakses user.';

-- View untuk PostgREST / app (GeoJSON + project_id + issue_id)

create or replace view spatial.v_issue_geometry_map as
select
  ig.id,
  i.project_id,
  ig.issue_id,
  coalesce(
    nullif(trim(ig.label), ''),
    nullif(trim(i.title), ''),
    'Task'
  ) as label,
  (st_asgeojson(ig.geom)::jsonb) as geojson
from spatial.issue_geometries ig
inner join core_pm.issues i
  on i.id = ig.issue_id
  and i.deleted_at is null;

comment on view spatial.v_issue_geometry_map is
  'Baris per geometri tugas: project_id, issue_id, geojson untuk Map.';

revoke all on table spatial.issue_geometries from public;
revoke all on table spatial.issue_geometries from anon;

grant select, insert, update, delete on table spatial.issue_geometries to authenticated;

alter table spatial.issue_geometries enable row level security;

create policy "spatial_issue_geometries_select_member"
  on spatial.issue_geometries for select to authenticated
  using (
    exists (
      select 1
      from core_pm.issues i
      where i.id = issue_geometries.issue_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

create policy "spatial_issue_geometries_insert_member"
  on spatial.issue_geometries for insert to authenticated
  with check (
    exists (
      select 1
      from core_pm.issues i
      where i.id = issue_geometries.issue_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

create policy "spatial_issue_geometries_update_member"
  on spatial.issue_geometries for update to authenticated
  using (
    exists (
      select 1
      from core_pm.issues i
      where i.id = issue_geometries.issue_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  )
  with check (
    exists (
      select 1
      from core_pm.issues i
      where i.id = issue_geometries.issue_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

create policy "spatial_issue_geometries_delete_member"
  on spatial.issue_geometries for delete to authenticated
  using (
    exists (
      select 1
      from core_pm.issues i
      where i.id = issue_geometries.issue_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

revoke all on table spatial.v_issue_geometry_map from public;
revoke all on table spatial.v_issue_geometry_map from anon;

grant select on table spatial.v_issue_geometry_map to authenticated;
