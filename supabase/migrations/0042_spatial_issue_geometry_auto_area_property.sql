-- Tambah nilai luas otomatis (m2) ke payload properties view map,
-- tanpa mengubah kolom/atribut manual yang sudah ada.
-- Kunci baru: luas_otomatis_m2

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
  (
    (coalesce(attr.payload, '{}'::jsonb) || coalesce(igf.properties, '{}'::jsonb))
    || jsonb_build_object(
      'luas_otomatis_m2',
      round((st_area(igf.geom::geography))::numeric, 2)
    )
  ) as properties,
  (st_asgeojson(igf.geom)::jsonb) as geojson
from spatial.issue_geometry_features igf
inner join core_pm.issues i
  on i.id = igf.issue_id
  and i.deleted_at is null
left join spatial.issue_feature_attributes attr
  on attr.issue_id = igf.issue_id
  and attr.feature_key = igf.feature_key;

comment on view spatial.v_issue_geometry_feature_map is
  'Map layer geometri bidang per issue (1:N), termasuk properties gabungan + luas_otomatis_m2 dari geometri.';
