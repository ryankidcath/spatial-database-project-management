-- Fase 4 F4-3: view map + berkas_id (sorotan / tautan berkas ↔ peta)

drop view if exists spatial.v_bidang_hasil_ukur_map;

create view spatial.v_bidang_hasil_ukur_map as
select
  bhu.id,
  bp.project_id,
  bhu.berkas_id,
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
  'Map + berkas_id untuk highlight URL dan overlap UX (F4-3).';

revoke all on table spatial.v_bidang_hasil_ukur_map from public;
revoke all on table spatial.v_bidang_hasil_ukur_map from anon;

grant select on table spatial.v_bidang_hasil_ukur_map to authenticated;
