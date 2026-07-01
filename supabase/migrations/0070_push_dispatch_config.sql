-- Web Push dispatch: config table (Supabase tidak izinkan ALTER DATABASE custom GUC).
-- Ganti core_pm.dispatch_push_outbox_row agar baca URL/secret dari tabel ini.

create table if not exists core_pm.push_dispatch_config (
  id int primary key default 1 check (id = 1),
  function_url text not null default '',
  webhook_secret text not null default '',
  updated_at timestamptz not null default now()
);

comment on table core_pm.push_dispatch_config is
  'Satu baris: URL Edge Function send-web-push + secret. Isi via SQL Editor setelah deploy.';

revoke all on table core_pm.push_dispatch_config from public;
grant select on table core_pm.push_dispatch_config to service_role;

insert into core_pm.push_dispatch_config (id, function_url, webhook_secret)
values (1, '', '')
on conflict (id) do nothing;

create or replace function core_pm.dispatch_push_outbox_row()
returns trigger
language plpgsql
security definer
set search_path = core_pm, public, net, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  select c.function_url, c.webhook_secret
  into v_url, v_secret
  from core_pm.push_dispatch_config c
  where c.id = 1;

  if v_url is null or v_url = '' or v_secret is null or v_secret = '' then
    return NEW;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object('outbox_id', NEW.id)
  );

  return NEW;
exception when others then
  return NEW;
end;
$$;
