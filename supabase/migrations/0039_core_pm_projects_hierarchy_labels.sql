-- Label hierarki dashboard per project (dibagi semua anggota via RLS baca + RPC tulis).

alter table core_pm.projects
  add column if not exists hierarchy_labels jsonb not null default '{}'::jsonb;

comment on column core_pm.projects.hierarchy_labels is
  'Label kustom per depth (0–3) untuk dashboard; objek JSON mis. {"0":"Unit kerja","1":"Unit turunan"}.';

create or replace function core_pm.update_project_hierarchy_labels(
  p_project_id uuid,
  p_labels jsonb
)
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not core_pm.is_project_member(p_project_id) then
    raise exception 'Tidak punya akses project';
  end if;

  if p_labels is null or jsonb_typeof(p_labels) <> 'object' then
    raise exception 'hierarchy_labels harus objek JSON';
  end if;

  update core_pm.projects
  set hierarchy_labels = p_labels,
      updated_at = now()
  where id = p_project_id
    and deleted_at is null;

  if not found then
    raise exception 'Project tidak ditemukan atau sudah dihapus';
  end if;
end;
$$;

revoke all on function core_pm.update_project_hierarchy_labels(uuid, jsonb) from public;
grant execute on function core_pm.update_project_hierarchy_labels(uuid, jsonb) to authenticated;

comment on function core_pm.update_project_hierarchy_labels(uuid, jsonb) is
  'Anggota project memperbarui hierarchy_labels; SECURITY DEFINER dengan cek is_project_member.';
