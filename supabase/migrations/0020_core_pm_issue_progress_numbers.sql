-- Opsi progres numerik per task/subtask (target vs realisasi), tidak wajib.

alter table core_pm.issues
  add column if not exists progress_target numeric(18, 2),
  add column if not exists progress_actual numeric(18, 2);

alter table core_pm.issues
  drop constraint if exists core_pm_issues_progress_target_nonneg,
  drop constraint if exists core_pm_issues_progress_actual_nonneg;

alter table core_pm.issues
  add constraint core_pm_issues_progress_target_nonneg
    check (progress_target is null or progress_target >= 0),
  add constraint core_pm_issues_progress_actual_nonneg
    check (progress_actual is null or progress_actual >= 0);

comment on column core_pm.issues.progress_target is
  'Target kuantitatif opsional untuk task/subtask (mis. jumlah bidang).';
comment on column core_pm.issues.progress_actual is
  'Realisasi kuantitatif opsional untuk task/subtask.';
