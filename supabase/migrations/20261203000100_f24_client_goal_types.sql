-- F24 FR-018 / FR-021 (PO decision 2026-11-14):
--   "A + Add a Goals section under Client Details with a Goal Type dropdown:
--    Fat Loss, Muscle Gain, Maintenance. Show the client's F15 Near-term Goal
--    as reference. Trainers can update Goal Type."
-- A client without a goal type is not eligible. FR-021 client code is the
-- registration order (earlier registration approval ranks higher).
-- Forward-only; tenant-scoped; RLS forced and deny-by-default.

-- ---------------------------------------------------------------------------
-- 1. Goal-type store: one current goal type per client, set by coaching staff.
-- ---------------------------------------------------------------------------
create table public.client_goal_types (
  workspace_id uuid not null,
  client_id uuid not null,
  goal_type text not null check (goal_type in ('fat_loss', 'muscle_gain', 'maintenance')),
  updated_by uuid not null,
  updated_at timestamptz not null default clock_timestamp() check (isfinite(updated_at)),
  primary key (workspace_id, client_id),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id) on delete restrict
);
alter table public.client_goal_types owner to postgres;
alter table public.client_goal_types enable row level security;
alter table public.client_goal_types force row level security;
revoke all on public.client_goal_types from public, anon, authenticated, service_role;
comment on table public.client_goal_types is
  'F24 FR-018: trainer-set goal type per client (PO 2026-11-14). Reachable only through set_client_goal_type / client_goal_read.';

-- Coaching staff only (trainer, workspace owner, PO; never Sales): the
-- coaching_work capability with an active membership, or the PO.
create function public.set_client_goal_type(p_workspace_id uuid, p_client_id uuid, p_goal_type text)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid := auth.uid(); current_type text;
begin
  if actor is null or p_workspace_id is null
    or not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    return '{"status":"not_permitted"}'::jsonb;
  end if;
  if p_client_id is null or p_goal_type is null
    or p_goal_type not in ('fat_loss', 'muscle_gain', 'maintenance') then
    return '{"status":"invalid_input"}'::jsonb;
  end if;
  if not exists(select 1 from public.clients c
      where c.workspace_id=p_workspace_id and c.id=p_client_id
        and c.approval_state='approved' and c.deactivated_at is null) then
    return '{"status":"not_found"}'::jsonb;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('f24-goal:'||p_workspace_id::text||':'||p_client_id::text, 0));
  select g.goal_type into current_type from public.client_goal_types g
    where g.workspace_id=p_workspace_id and g.client_id=p_client_id;
  if current_type is not distinct from p_goal_type then
    return '{"status":"unchanged"}'::jsonb;
  end if;
  insert into public.client_goal_types(workspace_id, client_id, goal_type, updated_by)
    values (p_workspace_id, p_client_id, p_goal_type, actor)
    on conflict (workspace_id, client_id) do update
      set goal_type=excluded.goal_type, updated_by=excluded.updated_by, updated_at=clock_timestamp();
  -- Actor, time, workspace and client only; the goal type is coaching data and stays out of audit details.
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
    values (actor, 'client.goal_type_changed', 'clients', p_client_id, p_workspace_id, '{}'::jsonb);
  return '{"status":"updated"}'::jsonb;
end $$;
alter function public.set_client_goal_type(uuid, uuid, text) owner to postgres;
revoke all on function public.set_client_goal_type(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.set_client_goal_type(uuid, uuid, text) to authenticated;

-- Coaching staff read: the goal type and the id of the client's latest
-- submitted F15 assignment that asks the starter near-term-goal question
-- (T01). The answer itself is read only through F15's audited
-- public.read_form_answer; this function never returns answer values.
create function public.client_goal_read(p_workspace_id uuid, p_client_id uuid)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare goal text; reference uuid;
begin
  if auth.uid() is null or p_workspace_id is null
    or not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    return '{"status":"not_permitted"}'::jsonb;
  end if;
  if p_client_id is null or not exists(select 1 from public.clients c
      where c.workspace_id=p_workspace_id and c.id=p_client_id) then
    return '{"status":"not_found"}'::jsonb;
  end if;
  select g.goal_type into goal from public.client_goal_types g
    where g.workspace_id=p_workspace_id and g.client_id=p_client_id;
  select a.id into reference from public.form_assignments a
    where a.workspace_id=p_workspace_id and a.client_id=p_client_id
      and exists(select 1 from jsonb_array_elements(
          case when jsonb_typeof(a.version_snapshot->'questions')='array'
            then a.version_snapshot->'questions' else '[]'::jsonb end) q
        where q->>'id'='T01')
      and exists(select 1 from public.form_answer_revisions r
        where r.workspace_id=a.workspace_id and r.assignment_id=a.id)
    order by a.created_at desc, a.id desc
    limit 1;
  return jsonb_build_object('status', 'ok', 'goal_type', goal, 'reference_assignment_id', reference);
end $$;
alter function public.client_goal_read(uuid, uuid) owner to postgres;
revoke all on function public.client_goal_read(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.client_goal_read(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Eligibility facts gain the goal type and the registration approval time.
--    Same signatures, owners and grants (create or replace keeps privileges).
--    The PO pool stays server-side; no health value or score is included.
-- ---------------------------------------------------------------------------
create or replace function app_private.f24_eligibility_facts(ws uuid, cid uuid, as_of date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.clients%rowtype; sid uuid; projected text; days integer := 0;
begin
  select * into c from public.clients x where x.workspace_id=ws and x.id=cid;
  if not found then return null; end if;
  sid := app_private.f24_initial_subscription(ws, cid);
  if sid is not null then
    projected := app_private.f13_project_entitlement(ws, sid, as_of)->>'status';
    if projected = 'active' then days := app_private.f24_active_days(ws, sid, as_of, 14); end if;
  end if;
  return jsonb_build_object(
    'client_id', c.id,
    'entitlement_status', projected,
    'active_days', days,
    'opted_out', exists(select 1 from public.client_leaderboard_opt_outs o
      where o.workspace_id=ws and o.client_id=cid),
    'has_username', coalesce(c.username_normalized ~ '^[a-z0-9_.]{3,20}$', false),
    'goal_type', (select g.goal_type from public.client_goal_types g
      where g.workspace_id=ws and g.client_id=cid),
    'registration_approved_at', (select min(e.approved_at) from app_private.registration_approval_events e
      where e.workspace_id=ws and e.client_id=cid));
end $$;

-- No goal set -> not eligible (PO 2026-11-14). Mirrored in lib/leaderboard/eligibility.ts.
create or replace function app_private.f24_client_eligible(ws uuid, cid uuid, as_of date) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((
    select c.approval_state='approved' and c.deactivated_at is null
      and (f.facts->>'opted_out')::boolean = false
      and f.facts->>'entitlement_status' = 'active'
      and (f.facts->>'active_days')::integer >= 14
      and (f.facts->>'has_username')::boolean
      and f.facts->>'goal_type' is not null
    from public.clients c
    cross join lateral (select app_private.f24_eligibility_facts(ws, cid, as_of) as facts) f
    where c.workspace_id=ws and c.id=cid), false)
$$;
