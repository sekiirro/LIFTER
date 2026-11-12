-- Telegram is an optional staff channel; usernames never establish identity.
create table app_private.f15_telegram_link_tokens (
  token_hash bytea primary key,
  user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp()
);
create table app_private.f15_telegram_links (
  user_id uuid primary key references public.staff_profiles(user_id) on delete cascade,
  chat_id text not null unique check (chat_id ~ '^-?[0-9]{1,24}$'),
  linked_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz
);
alter table app_private.f15_telegram_link_tokens enable row level security;
alter table app_private.f15_telegram_link_tokens force row level security;
alter table app_private.f15_telegram_links enable row level security;
alter table app_private.f15_telegram_links force row level security;
revoke all on app_private.f15_telegram_link_tokens,app_private.f15_telegram_links from public,anon,authenticated,service_role;

create function public.create_f15_telegram_link_token() returns text
language plpgsql security definer set search_path='' as $$
declare raw_token text := encode(extensions.gen_random_bytes(32),'hex');
begin
  if auth.uid() is null or not exists(select 1 from public.staff_profiles s where s.user_id=auth.uid()) then
    raise exception 'telegram_link_unavailable' using errcode='P0001';
  end if;
  delete from app_private.f15_telegram_link_tokens where expires_at<=clock_timestamp() or user_id=auth.uid();
  insert into app_private.f15_telegram_link_tokens(token_hash,user_id,expires_at)
  values(extensions.digest(raw_token,'sha256'),auth.uid(),clock_timestamp()+interval '10 minutes');
  return raw_token;
end $$;
alter function public.create_f15_telegram_link_token() owner to postgres;
revoke all on function public.create_f15_telegram_link_token() from public,anon,authenticated,service_role;
grant execute on function public.create_f15_telegram_link_token() to authenticated;

create function app_private.consume_f15_telegram_link_token(p_token text,p_chat_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare link_user uuid;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_chat_id is null or p_chat_id !~ '^-?[0-9]{1,24}$' then return false; end if;
  delete from app_private.f15_telegram_link_tokens where expires_at<=clock_timestamp();
  delete from app_private.f15_telegram_link_tokens t where t.token_hash=extensions.digest(p_token,'sha256') returning t.user_id into link_user;
  if link_user is null or not exists(select 1 from public.staff_profiles s where s.user_id=link_user) then return false; end if;
  insert into app_private.f15_telegram_links(user_id,chat_id) values(link_user,p_chat_id)
  on conflict(user_id) do update set chat_id=excluded.chat_id,linked_at=clock_timestamp(),revoked_at=null;
  return true;
end $$;
alter function app_private.consume_f15_telegram_link_token(text,text) owner to postgres;
revoke all on function app_private.consume_f15_telegram_link_token(text,text) from public,anon,authenticated,service_role;

create function public.unlink_f15_telegram() returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then return false; end if;
  update app_private.f15_telegram_links set revoked_at=clock_timestamp() where user_id=auth.uid() and revoked_at is null;
  return found;
end $$;
alter function public.unlink_f15_telegram() owner to postgres;
revoke all on function public.unlink_f15_telegram() from public,anon,authenticated,service_role;
grant execute on function public.unlink_f15_telegram() to authenticated;

create function app_private.f15_telegram_membership_revoke() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.revoked_at is null and new.revoked_at is not null then
    update app_private.f15_telegram_links set revoked_at=clock_timestamp()
    where user_id=new.user_id and revoked_at is null;
  end if;
  return new;
end $$;
alter function app_private.f15_telegram_membership_revoke() owner to postgres;
revoke all on function app_private.f15_telegram_membership_revoke() from public,anon,authenticated,service_role;
create trigger f15_telegram_membership_revoke after update of revoked_at on public.workspace_memberships
for each row execute function app_private.f15_telegram_membership_revoke();
