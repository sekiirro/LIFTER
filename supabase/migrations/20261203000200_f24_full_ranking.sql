-- F24 full ranking (PO decision 2026-11-14):
--   "Rank ALL eligible clients monthly. Each client sees their private rank
--    and total participants; public Leaderboard shows Top 5 only. Opt-out
--    hides the client publicly, preserves their private rank, and
--    automatically promotes the next eligible client (#6 -> #5). PO approves
--    the full ranking; promotions require no reapproval."
-- Forward-only. Candidates and approved publications store the full ranking;
-- the public Top 5 is derived at read time; a client reads only their own
-- private rank and the participant total.

-- 1. Entries hold the full ranking (rank 1..n), no longer capped at 5.
alter table public.leaderboard_entries drop constraint leaderboard_entries_rank_check;
alter table public.leaderboard_entries add constraint leaderboard_entries_rank_positive check (rank >= 1);

-- 2. Public Top 5, computed at read time: the first five entries (by approved
--    rank) that are still visible, renumbered 1..5. An opt-out, deactivation
--    or lost username drops the entry and the next eligible entry moves up,
--    with no reapproval. Rank and username only.
create function app_private.f24_public_entries(ws uuid, pid uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('rank', t.public_rank, 'username', t.username) order by t.public_rank), '[]'::jsonb)
  from (
    select v.username, row_number() over (order by v.rank) as public_rank
    from (
      select e.rank, app_private.f24_visible_username(e.workspace_id, e.client_id) as username
      from public.leaderboard_entries e
      where e.workspace_id=ws and e.publication_id=pid
    ) v
    where v.username is not null
  ) t
  where t.public_rank <= 5
$$;
alter function app_private.f24_public_entries(uuid, uuid) owner to postgres;
revoke all on function app_private.f24_public_entries(uuid, uuid) from public, anon, authenticated, service_role;

-- Client and staff viewers now read the derived public Top 5.
create or replace function app_private.f24_current_view(ws uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pub public.leaderboard_publications%rowtype; entries jsonb;
begin
  select p.* into pub from public.leaderboard_current_publications cur
    join public.leaderboard_publications p on p.workspace_id=cur.workspace_id and p.id=cur.publication_id
    where cur.workspace_id=ws and p.state='approved';
  if not found then return '{"status":"empty"}'::jsonb; end if;
  entries := app_private.f24_public_entries(ws, pub.id);
  if jsonb_array_length(entries) = 0 then return '{"status":"empty"}'::jsonb; end if;
  return jsonb_build_object('status', 'available',
    'period_month', to_char(pub.period_month, 'YYYY-MM-DD'), 'entries', entries);
end $$;

-- 3. Candidate: the full ranking of all eligible clients (1..n). Same walls
--    as before; only the Top-5 size cap becomes a sanity bound.
create or replace function public.create_leaderboard_candidate(
  p_workspace_id uuid, p_client_ids uuid[], p_operation_key uuid
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid := auth.uid(); today date := app_private.f24_cairo_today();
  existing public.leaderboard_publications%rowtype; pid uuid; n integer; i integer;
begin
  if actor is null or not app_private.is_platform_owner() then
    return '{"status":"not_permitted"}'::jsonb;
  end if;
  if p_workspace_id is null or p_operation_key is null or p_client_ids is null
    or not exists(select 1 from public.workspaces w where w.id=p_workspace_id) then
    return '{"status":"invalid_input"}'::jsonb;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('f24-leaderboard:'||p_workspace_id::text, 0));
  select * into existing from public.leaderboard_publications p
    where p.workspace_id=p_workspace_id and p.operation_key=p_operation_key;
  if found then
    return jsonb_build_object('status', 'replayed', 'publication_id', existing.id);
  end if;
  n := coalesce(cardinality(p_client_ids), 0);
  if n < 1 or n > 5000 or exists(select 1 from unnest(p_client_ids) x where x is null)
    or (select count(distinct x) from unnest(p_client_ids) x) <> n then
    return '{"status":"invalid_input"}'::jsonb;
  end if;
  if exists(select 1 from public.leaderboard_publications p
      where p.workspace_id=p_workspace_id and p.state='pending') then
    return '{"status":"pending_exists"}'::jsonb;
  end if;
  for i in 1..n loop
    if not app_private.f24_client_eligible(p_workspace_id, p_client_ids[i], today) then
      return '{"status":"ineligible_client"}'::jsonb;
    end if;
  end loop;
  insert into public.leaderboard_publications(workspace_id, period_month, operation_key, created_by)
    values (p_workspace_id, date_trunc('month', today)::date, p_operation_key, actor)
    returning id into pid;
  for i in 1..n loop
    insert into public.leaderboard_entries(workspace_id, publication_id, client_id, rank)
      values (p_workspace_id, pid, p_client_ids[i], i);
  end loop;
  return jsonb_build_object('status', 'created', 'publication_id', pid);
end $$;

-- 4. PO pool: the FR-019 incumbents are the past winners, i.e. the clients
--    currently shown in the public Top 5 (not the whole approved ranking).
create or replace function public.leaderboard_candidate_pool(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare today date := app_private.f24_cairo_today(); pool jsonb; incumbents jsonb;
begin
  if auth.uid() is null or not app_private.is_platform_owner() or p_workspace_id is null
    or not exists(select 1 from public.workspaces w where w.id=p_workspace_id) then
    return '{"status":"not_permitted"}'::jsonb;
  end if;
  select coalesce(jsonb_agg(app_private.f24_eligibility_facts(c.workspace_id, c.id, today) order by c.id), '[]'::jsonb)
    into pool
    from public.clients c
    where c.workspace_id=p_workspace_id and c.approval_state='approved' and c.deactivated_at is null;
  select coalesce(jsonb_agg(t.client_id order by t.public_rank), '[]'::jsonb) into incumbents
    from (
      select e.client_id, row_number() over (order by e.rank) as public_rank
      from public.leaderboard_current_publications cur
      join public.leaderboard_entries e on e.workspace_id=cur.workspace_id and e.publication_id=cur.publication_id
      where cur.workspace_id=p_workspace_id
        and app_private.f24_visible_username(e.workspace_id, e.client_id) is not null
    ) t
    where t.public_rank <= 5;
  return jsonb_build_object('status', 'ok',
    'period_month', to_char(date_trunc('month', today)::date, 'YYYY-MM-DD'),
    'pool', pool, 'incumbent_client_ids', incumbents);
end $$;

-- 5. Private rank: an approved, active client reads ONLY their own approved
--    rank and the participant total of the current approved ranking. The
--    total counts every ranked entry, opted-out clients included; an
--    opted-out client still sees their own rank. No other client's rank,
--    username, score or input is returned.
create function public.client_leaderboard_my_rank() returns jsonb
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
  if my_rank is null then return '{"status":"not_ranked"}'::jsonb; end if;
  select count(*)::integer into total from public.leaderboard_entries e
    where e.workspace_id=c.workspace_id and e.publication_id=pub.id;
  return jsonb_build_object('status', 'ranked',
    'period_month', to_char(pub.period_month, 'YYYY-MM-DD'), 'rank', my_rank, 'total', total);
end $$;
alter function public.client_leaderboard_my_rank() owner to postgres;
revoke all on function public.client_leaderboard_my_rank() from public, anon, authenticated, service_role;
grant execute on function public.client_leaderboard_my_rank() to authenticated;
