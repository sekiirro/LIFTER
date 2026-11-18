-- F16/F17 client-safe workout projection (consumed by F22 T017/T023-T028).
--
-- F16 FR-029/F16-MCQ-9 and F17 FR-017 left the authenticated-client wrapper
-- to the downstream client boundary: clients never read the catalog or staff
-- RPCs, and the F17 staff exporter denies the client role. This migration adds
-- the wrapper. It is a client-derived (no client, workspace or entitlement id
-- is accepted from the caller), F13-gated read of ONLY the caller's own
-- delivered workout revision, returning:
--   * the revision document projected through an allowlist (no staff-only
--     keys can ride along in coach-authored JSON), and
--   * for every exercise the document references (including alternatives),
--     the exercise name (name_en) and its CURRENT authorized video, resolved
--     through the F16 plan-authorized resolvers scoped to the client's own
--     workspace (FR-029, S37-PO-1 Q2 = A, F16-MCQ-9 = a).
-- No other catalog field (description, notes, defaults, effective fields,
-- provenance, versions, lifecycle) is ever returned. Adds no table, status,
-- delivery entity, renderer or export engine.
--
-- Every client-facing failure that could reveal another client's data
-- (foreign plan, undelivered revision, draft-only plan, a nutrition plan id,
-- unknown id, unresolvable or foreign exercise reference) is one `not_found`.

-- The authenticated, approved and not deactivated client row (F11/F13 wall).
create function app_private.f17_client_portal_client()
returns table(workspace_id uuid, client_id uuid)
language sql stable security definer set search_path = '' as $$
  select c.workspace_id, c.id
  from public.clients c
  where auth.uid() is not null
    and c.auth_user_id = auth.uid()
    and c.approval_state = 'approved'
    and c.deactivated_at is null
$$;

-- F13 authoritative subscription summary for one client; null (fail closed)
-- unless exactly one continuous subscription is resolvable. Same selection
-- rule as the F22 portal summary so both client reads agree.
create function app_private.f17_client_subscription_summary(p_workspace_id uuid, p_client_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (statement_timestamp() at time zone 'Africa/Cairo')::date;
  current_count integer;
  resolved_count integer;
  chosen uuid;
  projection jsonb;
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
  return jsonb_build_object(
    'subscription_id', chosen,
    'status', projection->>'status',
    'effective_end_exclusive', projection->>'effective_end_exclusive');
end $$;

-- Allowlist projections of the F17 document schema v1. Only the keys the F17
-- parser accepts are copied; anything else coach-authored JSON might carry is
-- dropped here, before it can reach a client session.
create function app_private.f17_client_safe_reference(p_ref jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select case when pg_catalog.jsonb_typeof(p_ref) = 'object' then
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'source', p_ref -> 'source',
      'identity_id', p_ref -> 'identity_id',
      'version', p_ref -> 'version',
      'overrideVersion', p_ref -> 'overrideVersion',
      'overrideWorkspaceId', p_ref -> 'overrideWorkspaceId',
      'workspace_id', p_ref -> 'workspace_id'))
  end
$$;

create function app_private.f17_client_safe_set(p_set jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', p_set -> 'id',
    'type', p_set -> 'type',
    'load', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'mode', p_set #> '{load,mode}',
      'value', p_set #> '{load,value}',
      'unit', p_set #> '{load,unit}'))))
$$;

create function app_private.f17_client_safe_item(p_item jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', p_item -> 'id',
    'name', p_item -> 'name',
    'description', p_item -> 'description',
    'notes', p_item -> 'notes',
    'restSec', p_item -> 'restSec',
    'rir', p_item -> 'rir',
    'reps', case when pg_catalog.jsonb_typeof(p_item -> 'reps') = 'object' then
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'value', p_item #> '{reps,value}',
        'min', p_item #> '{reps,min}',
        'max', p_item #> '{reps,max}')) end,
    'exercise', app_private.f17_client_safe_reference(p_item -> 'exercise'),
    'alternatives', (
      select coalesce(pg_catalog.jsonb_agg(
          app_private.f17_client_safe_reference(a.value) order by a.ordinality),
        '[]'::jsonb)
      from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(p_item -> 'alternatives') = 'array'
          then p_item -> 'alternatives' else '[]'::jsonb end) with ordinality a(value, ordinality)),
    'sets', (
      select coalesce(pg_catalog.jsonb_agg(
          app_private.f17_client_safe_set(s.value) order by s.ordinality),
        '[]'::jsonb)
      from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(p_item -> 'sets') = 'array'
          then p_item -> 'sets' else '[]'::jsonb end) with ordinality s(value, ordinality))))
$$;

create function app_private.f17_client_safe_workout_document(p_doc jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select case
    when pg_catalog.jsonb_typeof(p_doc) = 'object'
      and pg_catalog.jsonb_typeof(p_doc -> 'days') = 'array' then
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'schema_version', p_doc -> 'schema_version',
      'notes', p_doc -> 'notes',
      'days', (
        select coalesce(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'id', d.value -> 'id',
            'kind', d.value -> 'kind',
            'title', d.value -> 'title',
            'notes', d.value -> 'notes',
            'items', (
              select coalesce(pg_catalog.jsonb_agg(
                  app_private.f17_client_safe_item(i.value) order by i.ordinality),
                '[]'::jsonb)
              from pg_catalog.jsonb_array_elements(
                case when pg_catalog.jsonb_typeof(d.value -> 'items') = 'array'
                  then d.value -> 'items' else '[]'::jsonb end) with ordinality i(value, ordinality))))
          order by d.ordinality), '[]'::jsonb)
        from pg_catalog.jsonb_array_elements(p_doc -> 'days') with ordinality d(value, ordinality))))
  end
$$;

-- Global exercise resolution with F16 staff-detail parity (merge survivor; a
-- removed requested exercise resolves to itself) but WITHOUT the staff catalog
-- read gate, which clients can never pass. Only reachable from the client
-- projection below, which has already authorized the plan.
create function app_private.f17_client_resolve_global_exercise(p_exercise_id uuid)
returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  terminal_id uuid;
  terminal_state text;
  cycle_found boolean;
  own_state text;
begin
  with recursive chain(id, superseded_by, lifecycle_state, path, cycle) as (
    select e.id, e.superseded_by, e.lifecycle_state, array[e.id], false
    from public.exercises e where e.id = p_exercise_id
    union all
    select e.id, e.superseded_by, e.lifecycle_state, c.path || e.id, e.id = any(c.path)
    from chain c join public.exercises e on e.id = c.superseded_by
    where c.superseded_by is not null and not c.cycle
  )
  select id, lifecycle_state, coalesce(bool_or(cycle) over (), false)
    into terminal_id, terminal_state, cycle_found
  from chain where superseded_by is null order by cardinality(path) desc limit 1;
  if terminal_id is not null and not cycle_found and terminal_state = 'active' then
    return terminal_id;
  end if;
  select e.lifecycle_state into own_state from public.exercises e where e.id = p_exercise_id;
  if own_state = 'removed' then return p_exercise_id; end if;
  return null;
end $$;

-- One own delivered workout revision at a selected delivered revision number
-- (latest by default) with the client-safe document and exercise projection.
create function public.client_portal_workout_plan(
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
  select * into client_row from app_private.f17_client_portal_client();
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  summary := app_private.f17_client_subscription_summary(client_row.workspace_id, client_row.client_id);
  if summary is null then return jsonb_build_object('status', 'invalid'); end if;
  if summary->>'status' is distinct from 'active' then
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

alter function app_private.f17_client_portal_client() owner to postgres;
alter function app_private.f17_client_subscription_summary(uuid, uuid) owner to postgres;
alter function app_private.f17_client_safe_reference(jsonb) owner to postgres;
alter function app_private.f17_client_safe_set(jsonb) owner to postgres;
alter function app_private.f17_client_safe_item(jsonb) owner to postgres;
alter function app_private.f17_client_safe_workout_document(jsonb) owner to postgres;
alter function app_private.f17_client_resolve_global_exercise(uuid) owner to postgres;
alter function public.client_portal_workout_plan(uuid, integer) owner to postgres;
revoke all on function app_private.f17_client_portal_client()
  from public, anon, authenticated, service_role;
revoke all on function app_private.f17_client_subscription_summary(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.f17_client_safe_reference(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function app_private.f17_client_safe_set(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function app_private.f17_client_safe_item(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function app_private.f17_client_safe_workout_document(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function app_private.f17_client_resolve_global_exercise(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.client_portal_workout_plan(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.client_portal_workout_plan(uuid, integer) to authenticated;
comment on function public.client_portal_workout_plan(uuid, integer) is
  'F16/F17 client self-read of one own delivered workout revision: allowlisted document plus name and current video per referenced exercise; restricted unless F13 projects active.';

-- Export audit: let the plan's own approved client record a pdf/excel export
-- of a revision delivered to them (mirrors the F18 recorder). Staff behavior
-- is unchanged. A client's denial for a plan that is not theirs is recorded
-- without any foreign workspace, plan or revision identity.
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

  if p_outcome = 'denied' then
    if v_any_client and not v_own_client and not v_staff then
      -- A client probing a plan that is not theirs: no foreign identity is
      -- stored or derived.
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

alter function public.record_workout_export_audit(uuid, uuid, uuid, text, text, text)
  owner to postgres;
revoke all on function public.record_workout_export_audit(uuid, uuid, uuid, text, text, text)
  from public, anon, service_role;
grant execute on function public.record_workout_export_audit(uuid, uuid, uuid, text, text, text)
  to authenticated;

notify pgrst, 'reload schema';
