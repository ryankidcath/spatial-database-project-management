-- Proyeksi payload virtual_rows untuk tab Spasial (hanya kolom yang dibutuhkan peta).

create or replace function core_pm.fetch_virtual_rows_map_payload(
  p_table_id uuid,
  p_column_slugs text[]
)
returns table (
  id uuid,
  payload jsonb
)
language plpgsql
stable
security invoker
set search_path = core_pm, public
as $$
declare
  slug text;
begin
  if p_column_slugs is null or cardinality(p_column_slugs) = 0 then
    raise exception 'p_column_slugs required';
  end if;

  foreach slug in array p_column_slugs loop
    if slug is null or slug !~ '^[a-z][a-z0-9_]*$' then
      raise exception 'invalid column slug: %', coalesce(slug, '(null)');
    end if;
  end loop;

  return query
  select
    vr.id,
    coalesce(
      (
        select jsonb_object_agg(s, vr.payload -> s)
        from unnest(p_column_slugs) as s
        where vr.payload ? s
      ),
      '{}'::jsonb
    ) as payload
  from core_pm.virtual_rows vr
  where vr.table_id = p_table_id
    and vr.deleted_at is null
  order by vr.sort_order, vr.created_at;
end;
$$;

revoke all on function core_pm.fetch_virtual_rows_map_payload(uuid, text[]) from public;
grant execute on function core_pm.fetch_virtual_rows_map_payload(uuid, text[]) to authenticated;

notify pgrst, 'reload schema';
