-- Perbaikan: RPC dashboard (SECURITY INVOKER) memanggil helper internal;
-- role authenticated harus punya EXECUTE pada helper tersebut.

grant execute on function core_pm.dashboard_assert_payload_column_slug(text) to authenticated;

grant execute on function core_pm.dashboard_filters_sql_and(jsonb) to authenticated;

-- Signature v2 (0080) — grant yang terlewat saat replace function
revoke all on function core_pm.dashboard_payload_value_counts(uuid, text, jsonb) from public;
grant execute on function core_pm.dashboard_payload_value_counts(uuid, text, jsonb) to authenticated;

revoke all on function core_pm.dashboard_group_status_counts(uuid, text, text, text, jsonb) from public;
grant execute on function core_pm.dashboard_group_status_counts(uuid, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
