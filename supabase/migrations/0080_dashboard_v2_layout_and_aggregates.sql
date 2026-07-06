-- Dashboard v2: layout_config + agregasi DISTINCT/SUM + value counts dengan filter global.

alter table core_pm.virtual_dashboards
  add column if not exists layout_config jsonb not null default '{}'::jsonb;

comment on column core_pm.virtual_dashboards.layout_config is
  'Dashboard v2: { version, globalFilters: [{ table_id, column_slug }], cols: 12 }';

-- Filter payload: [{ "column": "desa", "value": "X" }, ...]
create or replace function core_pm.dashboard_filters_sql_and(
  p_filters jsonb
)
returns text
language plpgsql
immutable
set search_path = core_pm, public
as $$
declare
  elem jsonb;
  col text;
  val text;
  parts text[] := array[]::text[];
begin
  if p_filters is null or jsonb_typeof(p_filters) <> 'array' then
    return '';
  end if;

  for elem in select * from jsonb_array_elements(p_filters) loop
    col := elem ->> 'column';
    val := elem ->> 'value';
    if col is null or col !~ '^[a-z][a-z0-9_]*$' then
      raise exception 'invalid filter column slug: %', coalesce(col, '(null)');
    end if;
    if val is null then
      continue;
    end if;
    parts := parts || format(
      'and trim(coalesce(payload->>%L, '''')) = trim(%L)',
      col,
      val
    );
  end loop;

  return array_to_string(parts, ' ');
end;
$$;

revoke all on function core_pm.dashboard_filters_sql_and(jsonb) from public;
grant execute on function core_pm.dashboard_filters_sql_and(jsonb) to authenticated;

-- Value counts per kolom select (dengan filter opsional).
create or replace function core_pm.dashboard_payload_value_counts(
  p_table_id uuid,
  p_column_slug text,
  p_filters jsonb default '[]'::jsonb
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
declare
  filter_sql text;
begin
  perform core_pm.dashboard_assert_payload_column_slug(p_column_slug);
  filter_sql := core_pm.dashboard_filters_sql_and(p_filters);

  return query execute format(
    $q$
      select coalesce(nullif(trim(payload->>%L), ''), '—') as value_text,
             count(*)::bigint as row_count
      from core_pm.virtual_rows
      where table_id = $1
        and deleted_at is null
        %s
      group by 1
      order by 2 desc, 1
    $q$,
    p_column_slug,
    filter_sql
  ) using p_table_id;
end;
$$;

revoke all on function core_pm.dashboard_payload_value_counts(uuid, text, jsonb) from public;
grant execute on function core_pm.dashboard_payload_value_counts(uuid, text, jsonb) to authenticated;

-- DISTINCT count untuk KPI "Jumlah Desa".
create or replace function core_pm.dashboard_distinct_count(
  p_table_id uuid,
  p_column_slug text,
  p_filters jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
stable
security invoker
set search_path = core_pm, public
as $$
declare
  filter_sql text;
  result bigint;
begin
  perform core_pm.dashboard_assert_payload_column_slug(p_column_slug);
  filter_sql := core_pm.dashboard_filters_sql_and(p_filters);

  execute format(
    $q$
      select count(distinct nullif(trim(payload->>%L), ''))::bigint
      from core_pm.virtual_rows
      where table_id = $1
        and deleted_at is null
        %s
    $q$,
    p_column_slug,
    filter_sql
  ) into result using p_table_id;

  return coalesce(result, 0);
end;
$$;

revoke all on function core_pm.dashboard_distinct_count(uuid, text, jsonb) from public;
grant execute on function core_pm.dashboard_distinct_count(uuid, text, jsonb) to authenticated;

-- SUM kolom numerik di payload.
create or replace function core_pm.dashboard_sum_column(
  p_table_id uuid,
  p_column_slug text,
  p_filters jsonb default '[]'::jsonb
)
returns numeric
language plpgsql
stable
security invoker
set search_path = core_pm, public
as $$
declare
  filter_sql text;
  result numeric;
begin
  perform core_pm.dashboard_assert_payload_column_slug(p_column_slug);
  filter_sql := core_pm.dashboard_filters_sql_and(p_filters);

  execute format(
    $q$
      select coalesce(sum(
        case
          when jsonb_typeof(payload->%L) = 'number' then (payload->>%L)::numeric
          when (payload->>%L) ~ '^-?[0-9]+(\.[0-9]+)?$' then (payload->>%L)::numeric
          else 0
        end
      ), 0)
      from core_pm.virtual_rows
      where table_id = $1
        and deleted_at is null
        %s
    $q$,
    p_column_slug,
    p_column_slug,
    p_column_slug,
    p_column_slug,
    filter_sql
  ) into result using p_table_id;

  return coalesce(result, 0);
end;
$$;

revoke all on function core_pm.dashboard_sum_column(uuid, text, jsonb) from public;
grant execute on function core_pm.dashboard_sum_column(uuid, text, jsonb) to authenticated;

-- Perbarui group status counts dengan filter global.
create or replace function core_pm.dashboard_group_status_counts(
  p_table_id uuid,
  p_group_column text,
  p_status_column text,
  p_match_value text,
  p_filters jsonb default '[]'::jsonb
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
declare
  filter_sql text;
begin
  perform core_pm.dashboard_assert_payload_column_slug(p_group_column);
  perform core_pm.dashboard_assert_payload_column_slug(p_status_column);
  filter_sql := core_pm.dashboard_filters_sql_and(p_filters);

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
        %s
      group by 1
      order by total_count desc, group_label
    $q$,
    p_group_column,
    p_status_column,
    filter_sql
  ) using p_table_id, coalesce(p_match_value, '');
end;
$$;

revoke all on function core_pm.dashboard_group_status_counts(uuid, text, text, text, jsonb) from public;
grant execute on function core_pm.dashboard_group_status_counts(uuid, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
