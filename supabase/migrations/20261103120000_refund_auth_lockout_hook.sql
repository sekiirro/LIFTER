create table app_private.client_deactivation_state (
  client_id uuid primary key references public.clients(id) on delete restrict,
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  deactivated_at timestamptz not null default now()
);
revoke all on app_private.client_deactivation_state from public, anon, authenticated, service_role;
alter table app_private.client_deactivation_state enable row level security;
alter table app_private.client_deactivation_state force row level security;
create policy refund_auth_lockout_hook_read on app_private.client_deactivation_state
  for select to supabase_auth_admin using (true);

create table app_private.refund_auth_lockouts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete restrict,
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','retry','succeeded')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  completed_at timestamptz,
  safe_error_code text check (safe_error_code is null or safe_error_code in ('provider_unavailable','auth_admin_unavailable')),
  created_at timestamptz not null default now(),
  check ((status = 'succeeded') = (completed_at is not null))
);
revoke all on app_private.refund_auth_lockouts from public, anon, authenticated, service_role;
alter table app_private.refund_auth_lockouts enable row level security;
alter table app_private.refund_auth_lockouts force row level security;

create function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if exists (
    select 1
    from app_private.client_deactivation_state as c
    where c.auth_user_id = (event->>'user_id')::uuid
  ) then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 403, 'message', 'account_unavailable')
    );
  end if;

  return jsonb_build_object('claims', event->'claims');
end;
$$;

revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated, service_role;
grant usage on schema public to supabase_auth_admin;
grant usage on schema app_private to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant select (auth_user_id) on app_private.client_deactivation_state to supabase_auth_admin;
