create or replace function public.create_f15_telegram_link_token() returns text
language plpgsql security definer set search_path='' as $$
declare raw_token text := encode(extensions.gen_random_bytes(32),'hex');
begin
  if auth.uid() is null or not exists(select 1 from public.staff_profiles s where s.user_id=auth.uid()) then
    return null;
  end if;
  delete from app_private.f15_telegram_link_tokens
    where expires_at<=clock_timestamp() or user_id=auth.uid();
  insert into app_private.f15_telegram_link_tokens(token_hash,user_id,expires_at)
    values(extensions.digest(raw_token,'sha256'),auth.uid(),clock_timestamp()+interval '10 minutes');
  return raw_token;
end $$;
alter function public.create_f15_telegram_link_token() owner to postgres;
revoke all on function public.create_f15_telegram_link_token() from public,anon,authenticated,service_role;
grant execute on function public.create_f15_telegram_link_token() to authenticated;
