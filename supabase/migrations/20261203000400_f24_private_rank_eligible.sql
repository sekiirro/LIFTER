-- F24 S57-PO-12 (PO 2026-11-15): "Every eligible client sees their private
-- full rank; only the public Top 5 is visible to others."
-- With S57-PO-6 ("Opt-out ... preserves their private rank"), the private
-- rank is returned only to a client who is in the current approved ranking
-- AND is still eligible today apart from the opt-out (active F13
-- entitlement, 14 active days, Q14 username, goal type). Ineligible clients
-- (for example frozen or expired since approval) get nothing. Forward-only.

-- Eligible apart from the opt-out: the single definition both walls use.
create function app_private.f24_client_rankable(ws uuid, cid uuid, as_of date) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((
    select c.approval_state='approved' and c.deactivated_at is null
      and f.facts->>'entitlement_status' = 'active'
      and (f.facts->>'active_days')::integer >= 14
      and (f.facts->>'has_username')::boolean
      and f.facts->>'goal_type' is not null
    from public.clients c
    cross join lateral (select app_private.f24_eligibility_facts(ws, cid, as_of) as facts) f
    where c.workspace_id=ws and c.id=cid), false)
$$;
alter function app_private.f24_client_rankable(uuid, uuid, date) owner to postgres;
revoke all on function app_private.f24_client_rankable(uuid, uuid, date) from public, anon, authenticated, service_role;

-- Leaderboard eligibility = rankable and not opted out (same signature,
-- owner and grants).
create or replace function app_private.f24_client_eligible(ws uuid, cid uuid, as_of date) returns boolean
language sql stable security definer set search_path='' as $$
  select app_private.f24_client_rankable(ws, cid, as_of)
    and not exists(select 1 from public.client_leaderboard_opt_outs o
      where o.workspace_id=ws and o.client_id=cid)
$$;

-- Private rank: own entry of the current approved ranking, only while the
-- caller is still eligible (opt-out aside). Same signature and grants.
create or replace function public.client_leaderboard_my_rank() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.clients%rowtype; pub public.leaderboard_publications%rowtype; my_rank integer; total integer;
begin
  if auth.uid() is null then return '{"status":"not_permitted"}'::jsonb; end if;
  select * into c from public.clients x
    where x.auth_user_id=auth.uid() and x.approval_state='approved' and x.deactivated_at is null;
  if not found then return '{"status":"not_permitted"}'::jsonb; end if;
  select p.* into pub from public.leaderboard_current_publications cur
    join public.leaderboard_publications p on p.workspace_id=cur.workspace_id and p.id=cur.publication_id
    where cur.workspace_id=c.workspace_id and p.state='approved';
  if not found then return '{"status":"none"}'::jsonb; end if;
  select e.rank into my_rank from public.leaderboard_entries e
    where e.workspace_id=c.workspace_id and e.publication_id=pub.id and e.client_id=c.id;
  if my_rank is null
    or not app_private.f24_client_rankable(c.workspace_id, c.id, app_private.f24_cairo_today()) then
    return '{"status":"not_ranked"}'::jsonb;
  end if;
  select count(*)::integer into total from public.leaderboard_entries e
    where e.workspace_id=c.workspace_id and e.publication_id=pub.id;
  return jsonb_build_object('status', 'ranked',
    'period_month', to_char(pub.period_month, 'YYYY-MM-DD'), 'rank', my_rank, 'total', total);
end $$;
