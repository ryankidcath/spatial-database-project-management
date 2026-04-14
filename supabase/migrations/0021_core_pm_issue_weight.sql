-- Bobot task opsional untuk perhitungan progres tertimbang.

alter table core_pm.issues
  add column if not exists issue_weight numeric(10, 2) not null default 1;

alter table core_pm.issues
  drop constraint if exists core_pm_issues_issue_weight_pos;

alter table core_pm.issues
  add constraint core_pm_issues_issue_weight_pos
    check (issue_weight > 0);

comment on column core_pm.issues.issue_weight is
  'Bobot relatif task/subtask untuk pelaporan progres tertimbang.';
