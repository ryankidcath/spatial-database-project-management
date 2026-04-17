-- Atribut bidang terpisah dari geometri, linked by (issue_id, feature_key).
-- Mendukung alur:
-- 1) geometri dulu, atribut belakangan
-- 2) atribut dulu, geometri belakangan
-- 3) geometri + atribut sekaligus (mode lama)

create table if not exists spatial.issue_feature_attributes (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references core_pm.issues (id) on delete cascade,
  feature_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint issue_feature_attributes_feature_key_not_blank
    check (length(trim(feature_key)) > 0),
  constraint issue_feature_attributes_payload_object
    check (jsonb_typeof(payload) = 'object')
);

create unique index if not exists uq_spatial_issue_feature_attributes_issue_key
  on spatial.issue_feature_attributes (issue_id, feature_key);

create index if not exists idx_spatial_issue_feature_attributes_issue
  on spatial.issue_feature_attributes (issue_id);

create index if not exists idx_spatial_issue_feature_attributes_payload
  on spatial.issue_feature_attributes using gin (payload);

comment on table spatial.issue_feature_attributes is
  'Atribut terstruktur/fleksibel per bidang, terpisah dari geometri dan di-link via (issue_id, feature_key).';

comment on column spatial.issue_feature_attributes.payload is
  'Payload atribut bidang dalam JSON object.';

revoke all on table spatial.issue_feature_attributes from public;
revoke all on table spatial.issue_feature_attributes from anon;
grant select, insert, update, delete on table spatial.issue_feature_attributes to authenticated;

alter table spatial.issue_feature_attributes enable row level security;

drop policy if exists "spatial_issue_feature_attributes_select_member"
  on spatial.issue_feature_attributes;
create policy "spatial_issue_feature_attributes_select_member"
  on spatial.issue_feature_attributes for select to authenticated
  using (
    exists (
      select 1
      from core_pm.issues i
      where i.id = issue_feature_attributes.issue_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

drop policy if exists "spatial_issue_feature_attributes_insert_member"
  on spatial.issue_feature_attributes;
create policy "spatial_issue_feature_attributes_insert_member"
  on spatial.issue_feature_attributes for insert to authenticated
  with check (
    exists (
      select 1
      from core_pm.issues i
      where i.id = issue_feature_attributes.issue_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

drop policy if exists "spatial_issue_feature_attributes_update_member"
  on spatial.issue_feature_attributes;
create policy "spatial_issue_feature_attributes_update_member"
  on spatial.issue_feature_attributes for update to authenticated
  using (
    exists (
      select 1
      from core_pm.issues i
      where i.id = issue_feature_attributes.issue_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  )
  with check (
    exists (
      select 1
      from core_pm.issues i
      where i.id = issue_feature_attributes.issue_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

drop policy if exists "spatial_issue_feature_attributes_delete_member"
  on spatial.issue_feature_attributes;
create policy "spatial_issue_feature_attributes_delete_member"
  on spatial.issue_feature_attributes for delete to authenticated
  using (
    exists (
      select 1
      from core_pm.issues i
      where i.id = issue_feature_attributes.issue_id
        and i.deleted_at is null
        and core_pm.is_project_member(i.project_id)
    )
  );

-- View map diperluas: properties = merge atribut terpisah + properties geometri.
-- Prioritas: properties geometri menang jika key bentrok.
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
  (coalesce(attr.payload, '{}'::jsonb) || coalesce(igf.properties, '{}'::jsonb)) as properties,
  (st_asgeojson(igf.geom)::jsonb) as geojson
from spatial.issue_geometry_features igf
inner join core_pm.issues i
  on i.id = igf.issue_id
  and i.deleted_at is null
left join spatial.issue_feature_attributes attr
  on attr.issue_id = igf.issue_id
  and attr.feature_key = igf.feature_key;

