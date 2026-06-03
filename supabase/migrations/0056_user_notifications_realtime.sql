-- Realtime untuk kotak notifikasi (mention chat, dll.) tanpa refresh halaman.

alter table core_pm.user_notifications replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table core_pm.user_notifications;
  end if;
exception
  when duplicate_object then null;
end;
$$;

notify pgrst, 'reload schema';
