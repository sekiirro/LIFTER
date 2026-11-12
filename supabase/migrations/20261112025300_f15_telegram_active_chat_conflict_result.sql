-- S33 review: a duplicate active chat is an invalid link, not a retryable webhook failure.
create or replace function app_private.consume_f15_telegram_link_token(
  p_token text,p_chat_id text
) returns boolean
language plpgsql security definer set search_path='' as $$
declare link_user uuid;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$'
    or p_chat_id is null or p_chat_id !~ '^-?[0-9]{1,24}$' then
    return false;
  end if;
  delete from app_private.f15_telegram_link_tokens
    where expires_at<=clock_timestamp();
  delete from app_private.f15_telegram_link_tokens t
    where t.token_hash=extensions.digest(p_token,'sha256')
    returning t.user_id into link_user;
  if link_user is null or not exists(
    select 1 from public.staff_profiles s where s.user_id=link_user
  ) then
    return false;
  end if;
  begin
    insert into app_private.f15_telegram_links(user_id,chat_id)
      values(link_user,p_chat_id)
    on conflict(user_id) do update
      set chat_id=excluded.chat_id,linked_at=clock_timestamp(),revoked_at=null;
  exception when unique_violation then
    return false;
  end;
  return true;
end $$;
alter function app_private.consume_f15_telegram_link_token(text,text) owner to postgres;
revoke all on function app_private.consume_f15_telegram_link_token(text,text)
  from public,anon,authenticated,service_role;
