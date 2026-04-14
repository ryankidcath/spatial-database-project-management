-- F6-3: view pelaporan ringkas PLM (security invoker = RLS dasar tetap berlaku) — §21 catatan.

-- --- Ringkasan berkas per status & project ---

create or replace view plm.v_berkas_permohonan_summary_by_status
with (security_invoker = true)
as
select
  b.project_id,
  b.status,
  count(*)::bigint as jumlah,
  max(b.tanggal_berkas) as tanggal_berkas_terbaru
from plm.berkas_permohonan b
where b.deleted_at is null
group by b.project_id, b.status;

comment on view plm.v_berkas_permohonan_summary_by_status is
  'Agregat jumlah berkas per project + status (F6-3); RLS lewat tabel dasar.';

-- --- Ringkasan legalisasi GU per tahap & project ---

create or replace view plm.v_legalisasi_gu_summary_by_tahap
with (security_invoker = true)
as
select
  b.project_id,
  lg.status_tahap,
  count(*)::bigint as jumlah
from plm.legalisasi_gu lg
inner join plm.berkas_permohonan b
  on b.id = lg.berkas_id and b.deleted_at is null
where lg.deleted_at is null
group by b.project_id, lg.status_tahap;

comment on view plm.v_legalisasi_gu_summary_by_tahap is
  'Agregat proses legalisasi per project + status_tahap (F6-3).';

-- --- Ringkasan pengukuran lapangan per status & project ---

create or replace view plm.v_pengukuran_lapangan_summary_by_status
with (security_invoker = true)
as
select
  b.project_id,
  u.status,
  count(*)::bigint as jumlah
from plm.pengukuran_lapangan u
inner join plm.berkas_permohonan b
  on b.id = u.berkas_id and b.deleted_at is null
where u.deleted_at is null
group by b.project_id, u.status;

comment on view plm.v_pengukuran_lapangan_summary_by_status is
  'Agregat kegiatan pengukuran per project + status (F6-3).';

-- --- Grants ---

revoke all on table plm.v_berkas_permohonan_summary_by_status from public;
revoke all on table plm.v_berkas_permohonan_summary_by_status from anon;
grant select on table plm.v_berkas_permohonan_summary_by_status to authenticated;

revoke all on table plm.v_legalisasi_gu_summary_by_tahap from public;
revoke all on table plm.v_legalisasi_gu_summary_by_tahap from anon;
grant select on table plm.v_legalisasi_gu_summary_by_tahap to authenticated;

revoke all on table plm.v_pengukuran_lapangan_summary_by_status from public;
revoke all on table plm.v_pengukuran_lapangan_summary_by_status from anon;
grant select on table plm.v_pengukuran_lapangan_summary_by_status to authenticated;
