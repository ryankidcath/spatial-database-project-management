-- View atribut bidang terpisah (ter-link ke project lewat core_pm.issues).
create or replace view spatial.v_issue_feature_attribute_map as
select
  a.id,
  i.project_id,
  a.issue_id,
  a.feature_key,
  a.payload
from spatial.issue_feature_attributes a
inner join core_pm.issues i
  on i.id = a.issue_id
  and i.deleted_at is null;

comment on view spatial.v_issue_feature_attribute_map is
  'Atribut bidang (tanpa geometri pun tetap muncul), diperkaya project_id dari issues.';

revoke all on table spatial.v_issue_feature_attribute_map from public;
revoke all on table spatial.v_issue_feature_attribute_map from anon;
grant select on table spatial.v_issue_feature_attribute_map to authenticated;

