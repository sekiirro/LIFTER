create table app_private.f15_telegram_webhook_updates (
  update_id bigint primary key,
  consumed_at timestamptz not null default clock_timestamp()
);
alter table app_private.f15_telegram_webhook_updates enable row level security;
alter table app_private.f15_telegram_webhook_updates force row level security;
revoke all on app_private.f15_telegram_webhook_updates from public,anon,authenticated,service_role;

create function app_private.consume_f15_telegram_start(p_update_id bigint,p_token text,p_chat_id text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_update_id is null or p_update_id<0 then return false; end if;
  insert into app_private.f15_telegram_webhook_updates(update_id) values(p_update_id)
    on conflict(update_id) do nothing;
  if not found then return false; end if;
  return app_private.consume_f15_telegram_link_token(p_token,p_chat_id);
end $$;
alter function app_private.consume_f15_telegram_start(bigint,text,text) owner to postgres;
revoke all on function app_private.consume_f15_telegram_start(bigint,text,text) from public,anon,authenticated,service_role;

create function public.consume_f15_telegram_start(p_update_id bigint,p_token text,p_chat_id text)
returns boolean language sql security definer set search_path='' as $$
  select app_private.consume_f15_telegram_start(p_update_id,p_token,p_chat_id)
$$;
alter function public.consume_f15_telegram_start(bigint,text,text) owner to postgres;
revoke all on function public.consume_f15_telegram_start(bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.consume_f15_telegram_start(bigint,text,text) to service_role;
