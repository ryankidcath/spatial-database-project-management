-- Realtime untuk chat_room_reads (badge unread hilang setelah mark read).

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_realtime') then
    grant usage on schema core_pm to supabase_realtime;
    grant select on table core_pm.chat_room_reads to supabase_realtime;
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table core_pm.chat_room_reads;
  end if;
exception
  when duplicate_object then null;
end $$;

alter table core_pm.chat_room_reads replica identity full;
