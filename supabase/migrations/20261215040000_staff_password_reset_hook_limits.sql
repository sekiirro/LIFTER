-- T044: rate-limit requests that reach the local staff reset email hook and
-- append the accepted-request audit before the hook sends mail.
create table app_private.staff_password_reset_hook_requests (
  hook_id text primary key check (length(hook_id) between 1 and 200),
  auth_user_id uuid not null,
  target_hash bytea not null check (octet_length(target_hash) = 32),
  occurred_at timestamptz not null default now(),
  outcome text not null check (
    outcome in ('accepted', 'denied', 'rate_limited', 'delivery_limited')
  ),
  delivery_reserved boolean not null default false,
  audit_written boolean not null default false,
  check (delivery_reserved = (outcome = 'accepted'))
);
alter table app_private.staff_password_reset_hook_requests owner to postgres;
alter table app_private.staff_password_reset_hook_requests enable row level security;
alter table app_private.staff_password_reset_hook_requests force row level security;
revoke all on app_private.staff_password_reset_hook_requests
  from public, anon, authenticated, service_role;
create index staff_password_reset_hook_target_time_idx
  on app_private.staff_password_reset_hook_requests (target_hash, occurred_at desc);
create index staff_password_reset_hook_delivery_time_idx
  on app_private.staff_password_reset_hook_requests (occurred_at desc)
  where delivery_reserved;

create function public.staff_password_reset_hook_claim(
  p_hook_id text,
  p_auth_user_id uuid,
  p_target_hash_hex text,
  p_eligible boolean,
  p_permitted boolean
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_hash bytea;
  prior_request app_private.staff_password_reset_hook_requests%rowtype;
  target_count integer;
  global_count integer;
  delivery_count integer;
  request_outcome text;
begin
  if p_hook_id is null or length(p_hook_id) not between 1 and 200
    or p_auth_user_id is null
    or p_target_hash_hex is null
    or p_target_hash_hex !~ '^[0-9a-f]{64}$'
    or p_eligible is null
    or p_permitted is null then
    raise exception 'invalid request' using errcode = '22023';
  end if;

  v_target_hash := decode(p_target_hash_hex, 'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('staff_password_reset_global', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_target_hash_hex, 0)
  );

  select * into prior_request
  from app_private.staff_password_reset_hook_requests
  where hook_id = p_hook_id;
  if found then return 'duplicate'; end if;

  delete from app_private.staff_password_reset_hook_requests
  where occurred_at < now() - interval '1 hour';

  select count(*) into target_count
  from app_private.staff_password_reset_hook_requests
  where target_hash = v_target_hash
    and occurred_at >= now() - interval '1 hour';
  select count(*) into global_count
  from app_private.staff_password_reset_hook_requests
  where occurred_at >= now() - interval '1 hour';
  select count(*) into delivery_count
  from app_private.staff_password_reset_hook_requests
  where delivery_reserved
    and occurred_at >= now() - interval '1 hour';

  if not p_eligible or not p_permitted then
    request_outcome := 'denied';
  elsif target_count >= 5 or global_count >= 10 then
    request_outcome := 'rate_limited';
  elsif delivery_count >= 2 then
    request_outcome := 'delivery_limited';
  else
    request_outcome := 'accepted';
  end if;

  insert into app_private.staff_password_reset_hook_requests (
    hook_id, auth_user_id, target_hash, outcome, delivery_reserved
  ) values (
    p_hook_id, p_auth_user_id, v_target_hash, request_outcome,
    request_outcome = 'accepted'
  );

  return request_outcome;
end;
$$;
alter function public.staff_password_reset_hook_claim(text, uuid, text, boolean, boolean)
  owner to postgres;
revoke execute on function public.staff_password_reset_hook_claim(text, uuid, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.staff_password_reset_hook_claim(text, uuid, text, boolean, boolean)
  to service_role;

create function public.staff_password_reset_hook_audit(p_hook_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row app_private.staff_password_reset_hook_requests%rowtype;
begin
  select * into request_row
  from app_private.staff_password_reset_hook_requests
  where hook_id = p_hook_id
  for update;
  if not found or request_row.outcome <> 'accepted' then return false; end if;
  if request_row.audit_written then return true; end if;

  insert into public.audit_events (
    actor_user_id, action, target_table, target_id, workspace_id, details
  ) values (
    null, 'staff_password_reset.requested', 'auth.users', request_row.auth_user_id,
    null, '{}'::jsonb
  );
  update app_private.staff_password_reset_hook_requests
  set audit_written = true
  where hook_id = p_hook_id;
  return true;
end;
$$;
alter function public.staff_password_reset_hook_audit(text) owner to postgres;
revoke execute on function public.staff_password_reset_hook_audit(text)
  from public, anon, authenticated;
grant execute on function public.staff_password_reset_hook_audit(text)
  to service_role;
