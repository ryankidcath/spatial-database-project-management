-- Fase 4 slice F4-2: view peta — GeoJSON siap konsumsi PostgREST / app

create or replace view spatial.v_bidang_hasil_ukur_map as
select
  bhu.id,
  bp.project_id,
  coalesce(
    nullif(trim(bhu.label), ''),
    nullif(trim(bp.nomor_berkas), ''),
    'Bidang hasil ukur'
  ) as label,
  (st_asgeojson(bhu.geom)::jsonb) as geojson
from spatial.bidang_hasil_ukur bhu
inner join plm.berkas_permohonan bp
  on bp.id = bhu.berkas_id
  and bp.deleted_at is null;

comment on view spatial.v_bidang_hasil_ukur_map is
  'Baris per bidang hasil ukur: project_id + geojson (geometry) untuk Map. RLS mengikuti tabel dasar.';

revoke all on table spatial.v_bidang_hasil_ukur_map from public;
revoke all on table spatial.v_bidang_hasil_ukur_map from anon;

grant select on table spatial.v_bidang_hasil_ukur_map to authenticated;
