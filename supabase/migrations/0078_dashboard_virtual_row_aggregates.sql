-- Agregasi dashboard virtual table: GROUP BY di DB, bukan fetch seluruh baris ke client.

create or replace function core_pm.dashboard_assert_payload_column_slug(p_slug text)
returns void
language plpgsql
immutable
set search_path = core_pm, public
as $$
begin
  if p_slug is null or p_slug !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'invalid payload column slug: %', coalesce(p_slug, '(null)');
  end if;
end;
$$;

revoke all on function core_pm.dashboard_assert_payload_column_slug(text) from public;
grant execute on function core_pm.dashboard_assert_payload_column_slug(text) to authenticated;

-- Hitung baris per nilai teks kolom payload (untuk status_pie di server).
create or replace function core_pm.dashboard_payload_value_counts(
  p_table_id uuid,
  p_column_slug text
)
returns table (
  value_text text,
  row_count bigint
)
language plpgsql
stable
security invoker
set search_path = core_pm, public
as $$
begin
  perform core_pm.dashboard_assert_payload_column_slug(p_column_slug);

  return query execute format(
    $q$
      select coalesce(nullif(trim(payload->>%L), ''), '') as value_text,
             count(*)::bigint as row_count
      from core_pm.virtual_rows
      where table_id = $1
        and deleted_at is null
      group by 1
      order by 2 desc, 1
    $q$,
    p_column_slug
  ) using p_table_id;
end;
$$;

revoke all on function core_pm.dashboard_payload_value_counts(uuid, text) from public;
grant execute on function core_pm.dashboard_payload_value_counts(uuid, text) to authenticated;

-- Agregasi bar per grup + hitung match status (untuk bar_by_group).
create or replace function core_pm.dashboard_group_status_counts(
  p_table_id uuid,
  p_group_column text,
  p_status_column text,
  p_match_value text
)
returns table (
  group_label text,
  match_count bigint,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = core_pm, public
as $$
begin
  perform core_pm.dashboard_assert_payload_column_slug(p_group_column);
  perform core_pm.dashboard_assert_payload_column_slug(p_status_column);

  return query execute format(
    $q$
      select coalesce(nullif(trim(payload->>%L), ''), '—') as group_label,
             count(*) filter (
               where trim(coalesce(payload->>%L, '')) = trim($2)
             )::bigint as match_count,
             count(*)::bigint as total_count
      from core_pm.virtual_rows
      where table_id = $1
        and deleted_at is null
      group by 1
      order by total_count desc, group_label
    $q$,
    p_group_column,
    p_status_column
  ) using p_table_id, coalesce(p_match_value, '');
end;
$$;

revoke all on function core_pm.dashboard_group_status_counts(uuid, text, text, text) from public;
grant execute on function core_pm.dashboard_group_status_counts(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
