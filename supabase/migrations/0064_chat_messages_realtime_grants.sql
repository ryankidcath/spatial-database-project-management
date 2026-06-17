-- Realtime INSERT pada chat_messages (dan UPDATE last_message_at di chat_rooms)
-- membutuhkan SELECT untuk role supabase_realtime.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_realtime') then
    grant usage on schema core_pm to supabase_realtime;
    grant select on table core_pm.chat_messages to supabase_realtime;
    grant select on table core_pm.chat_rooms to supabase_realtime;
  end if;
end $$;

alter table core_pm.chat_rooms replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table core_pm.chat_rooms;
  end if;
exception
  when duplicate_object then null;
end $$;
