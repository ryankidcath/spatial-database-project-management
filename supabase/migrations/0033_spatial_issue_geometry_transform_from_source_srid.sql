-- Dukungan upload geometri dari CRS sumber (UTM/TM-3, dll).
-- Input WKT + SRID sumber akan ditransform ke WGS84 (EPSG:4326) saat upsert.

create or replace function spatial.upsert_issue_geometry_feature_from_wkt(
  p_issue_id uuid,
  p_feature_key text,
  p_label text default null,
  p_properties jsonb default '{}'::jsonb,
  p_geom_wkt text default null,
  p_source_srid integer default 4326
)
returns void
language plpgsql
security invoker
set search_path = spatial, core_pm, public
as $$
declare
  v_geom geometry;
  v_geom_4326 geometry(MultiPolygon, 4326);
begin
  if p_issue_id is null then
    raise exception 'issue_id wajib diisi';
  end if;
  if nullif(trim(coalesce(p_feature_key, '')), '') is null then
    raise exception 'feature_key wajib diisi';
  end if;
  if nullif(trim(coalesce(p_geom_wkt, '')), '') is null then
    raise exception 'geom_wkt wajib diisi';
  end if;
  if p_source_srid is null or p_source_srid <= 0 then
    raise exception 'source_srid harus bilangan bulat positif';
  end if;

  begin
    v_geom := ST_SetSRID(ST_GeomFromText(p_geom_wkt), p_source_srid);
  exception
    when others then
      raise exception 'WKT/geometry tidak valid: %', sqlerrm;
  end;

  if GeometryType(v_geom) not in ('POLYGON', 'MULTIPOLYGON') then
    raise exception 'Geometry harus Polygon/MultiPolygon';
  end if;

  begin
    if p_source_srid = 4326 then
      v_geom_4326 := ST_Multi(v_geom)::geometry(MultiPolygon, 4326);
    else
      v_geom_4326 := ST_Transform(ST_Multi(v_geom), 4326)::geometry(MultiPolygon, 4326);
    end if;
  exception
    when others then
      raise exception 'Gagal transform SRID % ke 4326: %', p_source_srid, sqlerrm;
  end;

  insert into spatial.issue_geometry_features (
    issue_id,
    feature_key,
    label,
    properties,
    geom
  )
  values (
    p_issue_id,
    trim(p_feature_key),
    nullif(trim(coalesce(p_label, '')), ''),
    coalesce(p_properties, '{}'::jsonb),
    v_geom_4326
  )
  on conflict (issue_id, feature_key)
  do update set
    label = excluded.label,
    properties = excluded.properties,
    geom = excluded.geom;
end;
$$;

comment on function spatial.upsert_issue_geometry_feature_from_wkt(uuid, text, text, jsonb, text, integer) is
  'Upsert geometri fitur issue dari WKT + SRID sumber, lalu transform ke EPSG:4326.';

revoke all on function spatial.upsert_issue_geometry_feature_from_wkt(uuid, text, text, jsonb, text, integer) from public;
grant execute on function spatial.upsert_issue_geometry_feature_from_wkt(uuid, text, text, jsonb, text, integer) to authenticated;

