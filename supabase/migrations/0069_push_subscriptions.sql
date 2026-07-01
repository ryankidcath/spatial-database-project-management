-- Web Push: langganan perangkat + antrian kirim (Fase B notifikasi).

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Langganan push per user / endpoint browser
-- ---------------------------------------------------------------------------
create table core_pm.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index idx_push_subscriptions_user on core_pm.push_subscriptions (user_id);

comment on table core_pm.push_subscriptions is
  'Web Push subscription (VAPID) per browser; satu baris per endpoint.';

revoke all on table core_pm.push_subscriptions from public;
grant select, insert, update, delete on table core_pm.push_subscriptions to authenticated;

alter table core_pm.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own"
  on core_pm.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

create policy "push_subscriptions_insert_own"
  on core_pm.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());

create policy "push_subscriptions_update_own"
  on core_pm.push_subscriptions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "push_subscriptions_delete_own"
  on core_pm.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Antrian push (diproses Edge Function send-web-push)
-- ---------------------------------------------------------------------------
create table core_pm.push_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text,
  url text not null default '/',
  tag text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text
);

create index idx_push_outbox_pending
  on core_pm.push_outbox (created_at)
  where sent_at is null;

comment on table core_pm.push_outbox is
  'Antrian Web Push; trigger pg_net memanggil Edge Function (lihat DEPLOY.md).';

revoke all on table core_pm.push_outbox from public;
grant select on table core_pm.push_outbox to authenticated;

alter table core_pm.push_outbox enable row level security;

-- Hanya service role / edge function yang menulis; user tidak perlu baca outbox.

-- ---------------------------------------------------------------------------
-- Enqueue helper
-- ---------------------------------------------------------------------------
create or replace function core_pm.enqueue_push_to_user(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_url text default '/',
  p_tag text default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  if not exists (
    select 1 from core_pm.push_subscriptions ps where ps.user_id = p_user_id
  ) then
    return null;
  end if;

  insert into core_pm.push_outbox (user_id, title, body, url, tag, payload)
  values (
    p_user_id,
    coalesce(nullif(trim(p_title), ''), 'Spatial PM'),
    nullif(trim(p_body), ''),
    coalesce(nullif(trim(p_url), ''), '/'),
    nullif(trim(p_tag), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function core_pm.enqueue_push_to_user(uuid, text, text, text, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Panggil Edge Function (opsional — set DB settings, lihat DEPLOY.md)
-- ---------------------------------------------------------------------------
create or replace function core_pm.dispatch_push_outbox_row()
returns trigger
language plpgsql
security definer
set search_path = core_pm, public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  begin
    v_url := current_setting('core_pm.push_function_url', true);
    v_secret := current_setting('core_pm.push_function_secret', true);
  exception when others then
    return NEW;
  end;

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

create trigger trg_push_outbox_dispatch
  after insert on core_pm.push_outbox
  for each row
  execute function core_pm.dispatch_push_outbox_row();

-- ---------------------------------------------------------------------------
-- Chat message → push ke anggota room (kecuali pengirim)
-- ---------------------------------------------------------------------------
create or replace function core_pm.on_chat_message_insert_push()
returns trigger
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_room core_pm.chat_rooms%rowtype;
  v_preview text;
  v_url text;
  v_recipient uuid;
begin
  select * into v_room from core_pm.chat_rooms where id = NEW.room_id;
  if not found then
    return NEW;
  end if;

  v_preview := left(trim(NEW.body), 140);
  v_url := '/?view=chat';
  if v_room.organization_id is not null then
    v_url := v_url || '&org=' || v_room.organization_id::text;
  end if;
  if v_room.project_id is not null then
    v_url := v_url || '&project=' || v_room.project_id::text;
  end if;

  for v_recipient in
    select distinct ps.user_id
    from core_pm.push_subscriptions ps
    where ps.user_id <> NEW.author_id
      and core_pm.user_can_access_chat_room(ps.user_id, NEW.room_id)
  loop
    perform core_pm.enqueue_push_to_user(
      v_recipient,
      'Pesan chat baru',
      v_preview,
      v_url,
      'chat:' || NEW.room_id::text,
      jsonb_build_object(
        'type', 'chat',
        'room_id', NEW.room_id,
        'message_id', NEW.id,
        'organization_id', v_room.organization_id
      )
    );
  end loop;

  return NEW;
end;
$$;

create trigger trg_chat_messages_push
  after insert on core_pm.chat_messages
  for each row
  execute function core_pm.on_chat_message_insert_push();

-- ---------------------------------------------------------------------------
-- user_notifications → push ke penerima
-- ---------------------------------------------------------------------------
create or replace function core_pm.on_user_notification_insert_push()
returns trigger
language plpgsql
security definer
set search_path = core_pm, public
as $$
declare
  v_url text;
begin
  v_url := '/?view=dashboard';
  if NEW.organization_id is not null then
    v_url := v_url || '&org=' || NEW.organization_id::text;
  end if;
  if NEW.project_id is not null then
    v_url := v_url || '&project=' || NEW.project_id::text;
  end if;

  perform core_pm.enqueue_push_to_user(
    NEW.user_id,
    NEW.title,
    coalesce(NEW.body, ''),
    v_url,
    'workspace:' || NEW.id::text,
    jsonb_build_object(
      'type', 'workspace',
      'notification_id', NEW.id,
      'kind', NEW.kind
    )
  );

  return NEW;
end;
$$;

create trigger trg_user_notifications_push
  after insert on core_pm.user_notifications
  for each row
  execute function core_pm.on_user_notification_insert_push();

-- Edge function butuh akses baca subscriptions + update outbox
grant select, update on table core_pm.push_outbox to service_role;
grant select, delete on table core_pm.push_subscriptions to service_role;
