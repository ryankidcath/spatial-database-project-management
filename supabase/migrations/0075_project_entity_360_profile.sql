-- G-H4: profil entitas 360° per project (anchor, geometry holder, urutan section).

alter table core_pm.projects
  add column if not exists entity_360_profile jsonb not null default '{}'::jsonb;

comment on column core_pm.projects.entity_360_profile is
  'Profil panel 360° / find-on-map: anchor_table_id, geometry_holder, panel_sections (JSON).';

create or replace function core_pm.update_project_entity_360_profile(
  p_project_id uuid,
  p_profile jsonb
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

  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'entity_360_profile harus objek JSON';
  end if;

  update core_pm.projects
  set entity_360_profile = p_profile,
      updated_at = now()
  where id = p_project_id
    and deleted_at is null;

  if not found then
    raise exception 'Project tidak ditemukan atau sudah dihapus';
  end if;
end;
$$;

revoke all on function core_pm.update_project_entity_360_profile(uuid, jsonb) from public;
grant execute on function core_pm.update_project_entity_360_profile(uuid, jsonb) to authenticated;

-- Demo GHDEMO: profil kosong = deteksi otomatis (lihat 0076 jika seed lama masih ada).

-- update core_pm.projects set entity_360_profile = '{}'::jsonb
-- where id = '22222222-2222-4222-8222-222222222223';
