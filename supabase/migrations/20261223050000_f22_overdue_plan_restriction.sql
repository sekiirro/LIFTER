-- F22 T018 (FR-006, FR-007): consume the F13 FR-028 independent overdue input
-- (app_private.f13_client_overdue_state, 20261125020000). F22 computes no overdue
-- itself. The subscription summary gains a boolean `overdue`; every client plan
-- read (overview, one plan, one nutrition plan) returns the restricted projection
-- when the client is overdue, even if F13 projects `active`. Status and end date
-- are unchanged. Overdue is derived only after the summary resolved a subscription
-- of the same workspace-scoped client, so a foreign client id returns null first.
-- The four read bodies (overview, plan, nutrition plan, workout plan) and the workout export
-- audit recorder are otherwise the previous definitions. client_portal_plan no longer returns
-- raw workout revision content: it goes through the F17 client allowlist
-- (app_private.f17_client_safe_workout_document), like client_portal_workout_plan.

-- Summary without overdue: the previous f22_subscription_summary body. The staff directory
-- uses it so overdue is not derived for every matched client (it is a client-wall fact).
create function app_private.f22_subscription_core(p_workspace_id uuid, p_client_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (statement_timestamp() at time zone 'Africa/Cairo')::date;
  current_count integer;
  resolved_count integer;
  chosen uuid;
  projection jsonb;
  summary jsonb;
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
  return summary;
end $$;

create or replace function app_private.f22_subscription_summary(p_workspace_id uuid, p_client_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (statement_timestamp() at time zone 'Africa/Cairo')::date;
  core jsonb;
  overdue_state jsonb;
begin
  core := app_private.f22_subscription_core(p_workspace_id, p_client_id);
  if core is null then return null; end if;
  -- F13 FR-028 overdue is independent of the projected status (FR-006): it only
  -- restricts plan content and exports and never changes status or the end date.
  -- A missing F13 value fails closed (overdue).
  overdue_state := app_private.f13_client_overdue_state(p_workspace_id, p_client_id, today);
  return core || jsonb_build_object('overdue',
    coalesce((overdue_state->>'overdue')::boolean, true));
end $$;

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
      'content', case when selected.plan_kind = 'workout'
        then app_private.f17_client_safe_workout_document(selected.content)
        else selected.content end),
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

create or replace function public.client_portal_workout_plan(
  p_plan_id uuid,
  p_revision_number integer default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uuid_pattern constant text :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  client_row record;
  summary jsonb;
  selected record;
  safe_document jsonb;
  ref_row record;
  source_value text;
  identity_value text;
  override_value text;
  private_workspace_value text;
  survivor_id uuid;
  name_value text;
  video_value text;
  found_exercise boolean;
  exercise_rows jsonb := '[]'::jsonb;
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
  select r.id as revision_id, r.revision_number, r.published_at, r.content into selected
  from public.plan_deliveries d
  join public.plan_roots pr
    on pr.workspace_id = d.workspace_id and pr.id = d.plan_id
  join public.plan_revisions r
    on r.workspace_id = d.workspace_id and r.plan_id = d.plan_id and r.id = d.revision_id
  where d.workspace_id = client_row.workspace_id
    and d.client_id = client_row.client_id
    and d.plan_id = p_plan_id
    and d.plan_kind = 'workout'
    and r.plan_kind = 'workout'
    and pr.client_id = client_row.client_id
    and app_private.f19_resolve_subscription_id(d.workspace_id, d.subscription_id)
      = (summary->>'subscription_id')::uuid
    and (p_revision_number is null or r.revision_number = p_revision_number)
  order by r.revision_number desc limit 1;
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  safe_document := app_private.f17_client_safe_workout_document(selected.content);
  if safe_document is null then return jsonb_build_object('status', 'not_found'); end if;

  begin
    for ref_row in
      select distinct ref.value
      from pg_catalog.jsonb_array_elements(safe_document -> 'days') d(value)
      cross join lateral pg_catalog.jsonb_array_elements(d.value -> 'items') i(value)
      cross join lateral (
        select i.value -> 'exercise' as value
        union all
        select a.value from pg_catalog.jsonb_array_elements(i.value -> 'alternatives') a(value)
      ) ref
    loop
      if pg_catalog.jsonb_typeof(ref_row.value) is distinct from 'object' then
        return jsonb_build_object('status', 'not_found');
      end if;
      source_value := ref_row.value ->> 'source';
      identity_value := ref_row.value ->> 'identity_id';
      if source_value is null or source_value not in ('global', 'workspace_private')
        or identity_value is null or identity_value !~* uuid_pattern then
        return jsonb_build_object('status', 'not_found');
      end if;
      name_value := null;
      video_value := null;
      override_value := ref_row.value ->> 'overrideWorkspaceId';
      private_workspace_value := ref_row.value ->> 'workspace_id';

      if source_value = 'global' then
        -- A workspace-scoped component that does not equal the client's own
        -- workspace denies the whole call (F16 FR-029).
        if private_workspace_value is not null
          or (override_value is not null
            and (override_value !~* uuid_pattern
              or override_value::uuid <> client_row.workspace_id)) then
          return jsonb_build_object('status', 'not_found');
        end if;
        survivor_id := app_private.f17_client_resolve_global_exercise(identity_value::uuid);
        if survivor_id is null then return jsonb_build_object('status', 'not_found'); end if;
        select v.payload ->> 'name_en' into name_value
        from public.exercises e
        join public.exercise_versions v
          on v.exercise_id = e.id and v.version = e.current_version
        where e.id = survivor_id;
        select r.video_url into video_value
        from app_private.catalog_resolve_exercise_video(
          survivor_id, client_row.workspace_id, true) r;
      else
        if override_value is not null or private_workspace_value is null
          or private_workspace_value !~* uuid_pattern
          or private_workspace_value::uuid <> client_row.workspace_id then
          return jsonb_build_object('status', 'not_found');
        end if;
        select v.payload ->> 'name_en' into name_value
        from public.workspace_exercises e
        join public.workspace_exercise_versions v
          on v.workspace_id = e.workspace_id
         and v.workspace_exercise_id = e.id
         and v.version = e.current_version
        where e.workspace_id = client_row.workspace_id and e.id = identity_value::uuid;
        found_exercise := found;
        if not found_exercise then return jsonb_build_object('status', 'not_found'); end if;
        select r.video_url into video_value
        from app_private.catalog_resolve_workspace_exercise_video(
          client_row.workspace_id, identity_value::uuid, true) r;
      end if;
      if name_value is null or name_value = '' then
        return jsonb_build_object('status', 'not_found');
      end if;
      exercise_rows := exercise_rows || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'source', source_value,
          'identity_id', identity_value,
          'workspace_id', ref_row.value -> 'workspace_id',
          'overrideWorkspaceId', ref_row.value -> 'overrideWorkspaceId',
          'name', name_value,
          'video_url', video_value)));
    end loop;
  exception when others then
    return jsonb_build_object('status', 'not_found');
  end;

  return jsonb_build_object('status', 'ok',
    'subscription', summary - 'subscription_id',
    'plan', jsonb_build_object('plan_id', p_plan_id,
      'workspace_id', client_row.workspace_id,
      'revision_id', selected.revision_id,
      'revision_number', selected.revision_number,
      'published_at', selected.published_at),
    'document', safe_document,
    'exercises', exercise_rows);
end $$;

-- The workout export audit follows the same entitlement as the read (FR-006).
create or replace function public.record_workout_export_audit(
  p_workspace_id uuid,
  p_plan_id uuid,
  p_revision_id uuid,
  p_format text,
  p_outcome text,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_workspace_id uuid;
  v_plan_id uuid := p_plan_id;
  v_client_id uuid;
  v_revision_id uuid := p_revision_id;
  v_own_client boolean := false;
  v_any_client boolean := false;
  v_staff boolean := false;
begin
  if v_actor is null
     or p_format is null or p_format not in ('pdf', 'excel', 'ai_prompt')
     or p_outcome is null or p_outcome not in ('success', 'denied')
     or (p_outcome = 'success' and p_reason is not null)
     or (p_outcome = 'denied' and (
       p_reason is null or p_reason not in ('not_permitted', 'not_found')
     )) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  -- A denied request may not know the plan id (draft/foreign revision). Derive
  -- it from the requested published revision when possible.
  if v_plan_id is null and v_revision_id is not null then
    select r.plan_id into v_plan_id
    from public.plan_revisions r
    where r.id = v_revision_id and r.plan_kind = 'workout';
  end if;

  select pr.workspace_id, pr.client_id into v_workspace_id, v_client_id
  from public.plan_roots pr
  where pr.id = v_plan_id;

  v_staff := coalesce(app_private.is_platform_owner(), false)
    or exists (
      select 1
      from public.workspace_memberships wm
      join public.staff_profiles sp on sp.user_id = wm.user_id
      where wm.user_id = v_actor
        and wm.workspace_id = v_workspace_id
        and wm.revoked_at is null
        and coalesce(app_private.role_has_capability(sp.role, 'coaching_work'), false)
    );
  v_any_client := exists (
    select 1 from public.clients c
    where c.auth_user_id = v_actor and c.approval_state = 'approved'
  );
  v_own_client := v_any_client and v_workspace_id is not null and exists (
    select 1 from public.clients c
    where c.id = v_client_id
      and c.workspace_id = v_workspace_id
      and c.auth_user_id = v_actor
      and c.approval_state = 'approved'
      and c.deactivated_at is null
  );

  if not v_staff and v_revision_id is not null and not exists (
    select 1 from public.plan_revisions r
    where r.id = v_revision_id and r.plan_id = v_plan_id
  ) then
    -- A revision id that does not belong to the given plan is never stored.
    v_revision_id := null;
  end if;

  if p_outcome = 'denied' then
    if not v_staff and not v_own_client then
      -- Any non-staff caller (foreign client, pending client, foreign
      -- trainer, anyone else) probing a plan that is not theirs: no foreign
      -- workspace, plan or revision identity is stored or derived.
      v_workspace_id := null;
      v_plan_id := null;
      v_revision_id := null;
    end if;
    insert into public.audit_events (
      actor_user_id, action, target_table, target_id, workspace_id, details
    ) values (
      v_actor,
      'plan.workout_export',
      'plan_revisions',
      coalesce(v_revision_id, v_plan_id, '00000000-0000-0000-0000-000000000000'::uuid),
      v_workspace_id,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'plan_id', v_plan_id,
        'revision_id', v_revision_id,
        'format', p_format,
        'outcome', p_outcome,
        'reason', p_reason
      ))
    );
    return;
  end if;

  -- Success is only auditable for an explicitly selected published workout
  -- revision; a draft or a foreign kind can never reach this branch.
  if v_plan_id is null or v_revision_id is null or not exists (
    select 1 from public.plan_revisions r
    where r.id = v_revision_id and r.plan_id = v_plan_id and r.plan_kind = 'workout'
  ) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if not v_staff and not (
    v_own_client
    and p_format in ('pdf', 'excel')
    and exists (
      select 1 from public.plan_deliveries d
      where d.workspace_id = v_workspace_id
        and d.client_id = v_client_id
        and d.plan_id = v_plan_id
        and d.revision_id = v_revision_id
        and d.plan_kind = 'workout'
    )
    -- A lapsed or restricted client cannot record an export that never
    -- happened: the client read is gated on F13 active, so is its audit.
    and (app_private.f22_subscription_summary(v_workspace_id, v_client_id) ->> 'status') = 'active'
    and not coalesce((app_private.f22_subscription_summary(v_workspace_id, v_client_id) ->> 'overdue')::boolean, true)
  ) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  insert into public.audit_events (
    actor_user_id, action, target_table, target_id, workspace_id, details
  ) values (
    v_actor,
    'plan.workout_export',
    'plan_revisions',
    v_revision_id,
    v_workspace_id,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'plan_id', v_plan_id,
      'revision_id', v_revision_id,
      'format', p_format,
      'outcome', p_outcome,
      'reason', p_reason
    ))
  );
end;
$$;

alter function app_private.f22_subscription_core(uuid, uuid) owner to postgres;
revoke all on function app_private.f22_subscription_core(uuid, uuid)
  from public, anon, authenticated, service_role;
alter function app_private.f22_subscription_summary(uuid, uuid) owner to postgres;
alter function public.client_portal_overview() owner to postgres;
alter function public.client_portal_plan(uuid, integer) owner to postgres;
alter function public.client_portal_nutrition_plan(uuid, integer) owner to postgres;
alter function public.client_portal_workout_plan(uuid, integer) owner to postgres;
alter function public.record_workout_export_audit(uuid, uuid, uuid, text, text, text)
  owner to postgres;

notify pgrst, 'reload schema';
