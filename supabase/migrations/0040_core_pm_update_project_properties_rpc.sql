-- Satukan pembaruan nama, deskripsi, dan hierarchy_labels; nama/deskripsi hanya owner.

create or replace function core_pm.update_project_properties(
  p_project_id uuid,
  p_name text,
  p_description text,
  p_hierarchy_labels jsonb
)
returns void
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid := auth.uid();
  v_old_name text;
  v_old_desc text;
  v_is_owner boolean;
  v_name text;
  v_desc text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not core_pm.is_project_member(p_project_id) then
    raise exception 'Tidak punya akses project';
  end if;

  select p.name, p.description
  into v_old_name, v_old_desc
  from core_pm.projects p
  where p.id = p_project_id
    and p.deleted_at is null;

  if not found then
    raise exception 'Project tidak ditemukan atau sudah dihapus';
  end if;

  v_name := trim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'Nama project tidak boleh kosong';
  end if;

  v_desc := nullif(trim(coalesce(p_description, '')), '');

  select exists (
    select 1
    from core_pm.project_members m
    where m.project_id = p_project_id
      and m.user_id = v_uid
      and m.role = 'owner'
  )
  into v_is_owner;

  if (v_old_name is distinct from v_name) or (v_old_desc is distinct from v_desc) then
    if not v_is_owner then
      raise exception 'Hanya owner project yang bisa mengubah nama atau deskripsi.';
    end if;
  end if;

  if p_hierarchy_labels is null or jsonb_typeof(p_hierarchy_labels) <> 'object' then
    raise exception 'hierarchy_labels harus objek JSON';
  end if;

  update core_pm.projects
  set
    name = v_name,
    description = v_desc,
    hierarchy_labels = p_hierarchy_labels,
    updated_at = now()
  where id = p_project_id
    and deleted_at is null;

  if not found then
    raise exception 'Project tidak ditemukan atau sudah dihapus';
  end if;
end;
$$;

revoke all on function core_pm.update_project_properties(uuid, text, text, jsonb) from public;
grant execute on function core_pm.update_project_properties(uuid, text, text, jsonb) to authenticated;

comment on function core_pm.update_project_properties(uuid, text, text, jsonb) is
  'Anggota: ubah hierarchy_labels; owner juga boleh ubah name/description.';

drop function if exists core_pm.update_project_hierarchy_labels(uuid, jsonb);
