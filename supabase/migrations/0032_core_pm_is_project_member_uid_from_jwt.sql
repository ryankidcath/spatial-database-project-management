-- is_project_member: pastikan UUID user terbaca konsisten saat dipanggil dari
-- konteks RLS / SECURITY DEFINER. Di beberapa setup PostgREST, auth.uid()
-- bisa null sementara klaim JWT sub masih terisi — anggota non-owner lalu
-- tidak pernah lolos policy projects/orgs meski baris project_members ada.

create or replace function core_pm.is_project_member(p_project_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = core_pm, public
as $$
declare
  v_uid uuid;
  v_sub text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    begin
      v_sub := nullif(trim(current_setting('request.jwt.claim.sub', true)), '');
      if v_sub is not null then
        v_uid := v_sub::uuid;
      end if;
    exception
      when invalid_text_representation then
        v_uid := null;
    end;
  end if;
  if v_uid is null then
    begin
      v_uid := (current_setting('request.jwt.claims', true)::json ->> 'sub')::uuid;
    exception
      when others then
        v_uid := null;
    end;
  end if;

  if v_uid is null then
    return false;
  end if;

  return exists (
    select 1
    from core_pm.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = v_uid
  );
end;
$$;

comment on function core_pm.is_project_member(uuid) is
  'Cek keanggotaan project; auth.uid() dengan fallback request.jwt.claim.sub.';

revoke all on function core_pm.is_project_member(uuid) from public;
grant execute on function core_pm.is_project_member(uuid) to authenticated;
