-- F24 FR-005/FR-013, SC-007: the "you may appear on the leaderboard" notice is
-- shown once on the client dashboard when the client first becomes eligible,
-- and stays available in account settings. The once-only state is one
-- immutable row per client, written by a single idempotent SECURITY DEFINER
-- RPC that derives the client from the signed identity (no client argument).
create table public.client_leaderboard_notice_seen (
  workspace_id uuid not null,
  client_id uuid not null,
  seen_at timestamptz not null default clock_timestamp() check (isfinite(seen_at)),
  primary key (workspace_id, client_id),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id) on delete restrict
);
alter table public.client_leaderboard_notice_seen owner to postgres;
alter table public.client_leaderboard_notice_seen enable row level security;
alter table public.client_leaderboard_notice_seen force row level security;
revoke all on public.client_leaderboard_notice_seen from public, anon, authenticated, service_role;
create trigger client_leaderboard_notice_seen_immutable before update or delete on public.client_leaderboard_notice_seen
  for each row execute function app_private.audit_events_immutable();
create trigger client_leaderboard_notice_seen_no_truncate before truncate on public.client_leaderboard_notice_seen
  for each statement execute function app_private.audit_events_immutable();

-- Returns first_view exactly once, and only while the client is eligible and
-- has not opted out; every later call (and every ineligible call) returns
-- not_shown without writing.
create function public.client_leaderboard_dashboard_notice() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid := auth.uid(); c public.clients%rowtype; inserted integer;
begin
  if actor is null then return '{"status":"not_permitted"}'::jsonb; end if;
  select * into c from public.clients x
    where x.auth_user_id=actor and x.approval_state='approved' and x.deactivated_at is null;
  if not found then return '{"status":"not_permitted"}'::jsonb; end if;
  if exists(select 1 from public.client_leaderboard_opt_outs o
      where o.workspace_id=c.workspace_id and o.client_id=c.id)
    or not app_private.f24_client_eligible(c.workspace_id, c.id, app_private.f24_cairo_today())
  then return '{"status":"not_shown"}'::jsonb; end if;
  insert into public.client_leaderboard_notice_seen(workspace_id, client_id)
    values (c.workspace_id, c.id) on conflict do nothing;
  get diagnostics inserted = row_count;
  return case when inserted = 1 then '{"status":"first_view"}'::jsonb
    else '{"status":"not_shown"}'::jsonb end;
end $$;
alter function public.client_leaderboard_dashboard_notice() owner to postgres;
revoke all on function public.client_leaderboard_dashboard_notice() from public, anon, authenticated, service_role;
grant execute on function public.client_leaderboard_dashboard_notice() to authenticated;
