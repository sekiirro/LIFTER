-- F22 T018 (FR-006, FR-007): consume the F13 FR-028 independent overdue input
-- (app_private.f13_client_overdue_state, 20261125020000). F22 computes no overdue
-- itself. The subscription summary gains a boolean `overdue`; every client plan
-- read (overview, one plan, one nutrition plan) returns the restricted projection
-- when the client is overdue, even if F13 projects `active`. Status and end date
-- are unchanged. Overdue is derived only after the summary resolved a subscription
-- of the same workspace-scoped client, so a foreign client id returns null first.
-- The three read bodies are otherwise the previous definitions.

create or replace function app_private.f22_subscription_summary(p_workspace_id uuid, p_client_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (statement_timestamp() at time zone 'Africa/Cairo')::date;
  current_count integer;
  resolved_count integer;
  chosen uuid;
  projection jsonb;
  summary jsonb;
  overdue_state jsonb;
begin
  with resolved as (
    select distinct app_private.f19_resolve_subscription_id(s.workspace_id, s.id) as sid
    from public.subscriptions s
    where s.workspace_id = p_workspace_id and s.client_id = p_client_id
  ), projected as (
    select r.sid, app_private.f13_project_entitlement(p_workspace_id, r.sid, today) as value
    from resolved r
  )
  select count(*) filter (where p.value->>'status' in ('active', 'frozen'))::integer,
    count(*)::integer,
    coalesce(
      (array_agg(p.sid order by p.sid) filter (where p.value->>'status' in ('active', 'frozen')))[1],
      (array_agg(p.sid order by p.sid))[1])
    into current_count, resolved_count, chosen
  from projected p;
  if current_count > 1 or (current_count = 0 and resolved_count <> 1) or chosen is null then
    return null;
  end if;
  projection := app_private.f13_project_entitlement(p_workspace_id, chosen, today);
  summary := jsonb_build_object(
    'subscription_id', chosen,
    'status', projection->>'status',
    'effective_end_exclusive', projection->>'effective_end_exclusive');
  if projection->>'status' = 'refunded' then
    summary := summary || jsonb_build_object('refund_scope',
      coalesce(app_private.f22_refund_scope(p_workspace_id, chosen), 'partial'));
  end if;
  -- F13 FR-028 overdue is independent of the projected status (FR-006): it only
  -- restricts plan content and exports and never changes status or the end date.
  overdue_state := app_private.f13_client_overdue_state(p_workspace_id, p_client_id, today);
  return summary || jsonb_build_object('overdue',
    coalesce((overdue_state->>'overdue')::boolean, false));
end $;

create or replace function public.client_portal_overview()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  client_row record;
  summary jsonb;
  plans jsonb;
begin
  select * into client_row from app_private.f22_portal_client();
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  summary := app_private.f22_subscription_summary(client_row.workspace_id, client_row.client_id);
  if summary is null then return jsonb_build_object('status', 'invalid'); end if;
  if summary->>'status' is distinct from 'active' or coalesce((summary->>'overdue')::boolean, true) then
    return jsonb_build_object('status', 'restricted',
      'subscription', summary - 'subscription_id');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'plan_id', x.plan_id, 'plan_kind', x.plan_kind,
      'revision_number', x.revision_number, 'published_at', x.published_at)
      order by x.plan_kind, x.published_at desc, x.plan_id), '[]'::jsonb)
    into plans
  from (
    select distinct on (d.plan_id) d.plan_id, d.plan_kind, r.revision_number, r.published_at
    from public.plan_deliveries d
    join public.plan_revisions r
      on r.workspace_id = d.workspace_id and r.plan_id = d.plan_id and r.id = d.revision_id
    where d.workspace_id = client_row.workspace_id
      and d.client_id = client_row.client_id
      and app_private.f19_resolve_subscription_id(d.workspace_id, d.subscription_id)
        = (summary->>'subscription_id')::uuid
    order by d.plan_id, r.revision_number desc
  ) x;
  return jsonb_build_object('status', 'ok',
    'subscription', summary - 'subscription_id', 'plans', plans);
end $$;

create or replace function public.client_portal_plan(p_plan_id uuid, p_revision_number integer default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  client_row record;
  summary jsonb;
  revisions jsonb;
  selected record;
begin
  select * into client_row from app_private.f22_portal_client();
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  summary := app_private.f22_subscription_summary(client_row.workspace_id, client_row.client_id);
  if summary is null then return jsonb_build_object('status', 'invalid'); end if;
  if summary->>'status' is distinct from 'active' or coalesce((summary->>'overdue')::boolean, true) then
    return jsonb_build_object('status', 'restricted',
      'subscription', summary - 'subscription_id');
  end if;
  if p_plan_id is null or (p_revision_number is not null and p_revision_number < 1) then
    return jsonb_build_object('status', 'not_found');
  end if;
  select v.* into selected
  from app_private.f22_delivered_revisions(client_row.workspace_id, client_row.client_id,
    p_plan_id, (summary->>'subscription_id')::uuid) v
  where p_revision_number is null or v.revision_number = p_revision_number
  order by v.revision_number desc limit 1;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'revision_number', v.revision_number, 'published_at', v.published_at)
      order by v.revision_number desc), '[]'::jsonb)
    into revisions
  from app_private.f22_delivered_revisions(client_row.workspace_id, client_row.client_id,
    p_plan_id, (summary->>'subscription_id')::uuid) v;
  return jsonb_build_object('status', 'ok',
    'subscription', summary - 'subscription_id',
    'plan', jsonb_build_object('plan_id', p_plan_id, 'plan_kind', selected.plan_kind,
      'revision_number', selected.revision_number, 'published_at', selected.published_at,
      'content', selected.content),
    'revisions', revisions);
end $$;

create or replace function public.client_portal_nutrition_plan(
  p_plan_id uuid,
  p_revision_number integer default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  client_row record;
  summary jsonb;
  selected record;
  content_row record;
  selections jsonb;
begin
  select * into client_row from app_private.f22_portal_client();
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  summary := app_private.f22_subscription_summary(client_row.workspace_id, client_row.client_id);
  if summary is null then return jsonb_build_object('status', 'invalid'); end if;
  if summary->>'status' is distinct from 'active' or coalesce((summary->>'overdue')::boolean, true) then
    return jsonb_build_object('status', 'restricted',
      'subscription', summary - 'subscription_id');
  end if;
  if p_plan_id is null or (p_revision_number is not null and p_revision_number < 1) then
    return jsonb_build_object('status', 'not_found');
  end if;
  select v.revision_number, v.published_at, r.id as revision_id into selected
  from app_private.f22_delivered_revisions(client_row.workspace_id, client_row.client_id,
    p_plan_id, (summary->>'subscription_id')::uuid) v
  join public.plan_revisions r
    on r.workspace_id = client_row.workspace_id
   and r.plan_id = p_plan_id
   and r.revision_number = v.revision_number
  where v.plan_kind = 'nutrition'
    and (p_revision_number is null or v.revision_number = p_revision_number)
  order by v.revision_number desc limit 1;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select c.document, c.snapshot_map, c.computed_values into content_row
  from public.nutrition_plan_version_contents c
  where c.workspace_id = client_row.workspace_id
    and c.plan_id = p_plan_id
    and c.revision_id = selected.revision_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'item_id', s.item_id, 'alternative_id', s.alternative_id)
      order by s.item_id), '[]'::jsonb)
    into selections
  from public.client_nutrition_alternative_selections s
  where s.workspace_id = client_row.workspace_id
    and s.plan_version_id = selected.revision_id
    and s.client_id = client_row.client_id;
  return jsonb_build_object('status', 'ok',
    'subscription', summary - 'subscription_id',
    'plan', jsonb_build_object('plan_id', p_plan_id,
      'workspace_id', client_row.workspace_id,
      'client_id', client_row.client_id,
      'revision_id', selected.revision_id,
      'revision_number', selected.revision_number,
      'published_at', selected.published_at),
    'content', jsonb_build_object('document', content_row.document,
      'snapshot_map', content_row.snapshot_map,
      'computed_values', content_row.computed_values),
    'selections', selections);
end $$;

alter function app_private.f22_subscription_summary(uuid, uuid) owner to postgres;
alter function public.client_portal_overview() owner to postgres;
alter function public.client_portal_plan(uuid, integer) owner to postgres;
alter function public.client_portal_nutrition_plan(uuid, integer) owner to postgres;

notify pgrst, 'reload schema';
