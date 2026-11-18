-- F23 (spec 023) US3 / P5-C: client food replacement requests (FR-018..FR-028).
-- Built on F18 (nutrition_plan_version_contents, select_nutrition_alternative) and F19
-- (plan_drafts, save_plan_draft, plan_deliveries). Nothing F17/F18/F19-owned is altered:
-- approval prepares an F19 draft through the existing save_plan_draft RPC and the trainer
-- publishes manually with the existing publish_nutrition_revision (no auto-publish, FR-022).
-- Free selection of an existing alternative stays the F18 RPC (FR-018) and creates no row here.
-- Notifications are NOT written here: the F15 inbox has no client recipient and no generic
-- notice kind yet (spec 022 inbox, FR-036/S57-PO-10). SLA escalation is never wired (FR-028).

create table public.food_replacement_requests (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  plan_id uuid not null,
  -- The delivered revision the client was viewing when asking.
  plan_version_id uuid not null,
  -- F18 nutrition item id (canonical UUID v4 inside the document).
  item_id text not null check (item_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  -- FR-021: F15 long-text limit (1,000 code points) and 4,096 UTF-8 bytes; no attachments.
  request_text text not null check (
    btrim(request_text) <> ''
    and char_length(request_text) <= 1000
    and octet_length(request_text) <= 4096
  ),
  -- FR-027 lifecycle plus 'cancelled' for the client withdrawal allowed by FR-020.
  status text not null default 'open'
    check (status in ('open', 'rejected', 'approved', 'stale_closed', 'cancelled')),
  -- Set by the approval RPC: the alternative id placed in the F19 draft (FR-022).
  prepared_alternative_id text
    check (prepared_alternative_id is null
      or prepared_alternative_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  prepared_draft_version bigint check (prepared_draft_version is null or prepared_draft_version > 0),
  prepared_by uuid references auth.users(id) on delete restrict,
  prepared_at timestamptz check (prepared_at is null or isfinite(prepared_at)),
  requested_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp() check (isfinite(created_at)),
  resolved_at timestamptz check (resolved_at is null or isfinite(resolved_at)),
  resolved_by uuid references auth.users(id) on delete restrict,
  primary key (workspace_id, id),
  unique (id),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id) on delete restrict,
  foreign key (workspace_id, plan_id) references public.plan_roots(workspace_id, id) on delete restrict,
  foreign key (workspace_id, plan_id, plan_version_id)
    references public.plan_revisions(workspace_id, plan_id, id) on delete restrict,
  check ((status = 'open') = (resolved_at is null)),
  check ((prepared_alternative_id is null) = (prepared_at is null)
    and (prepared_alternative_id is null) = (prepared_by is null)
    and (prepared_alternative_id is null) = (prepared_draft_version is null))
);

-- FR-019 / SC-008: at most one open request per food item.
create unique index food_replacement_requests_one_open
  on public.food_replacement_requests (workspace_id, plan_id, item_id) where status = 'open';
create index food_replacement_requests_client_idx
  on public.food_replacement_requests (workspace_id, client_id, created_at desc);

-- Requests are only ever written by the SECURITY DEFINER operations below. Closed rows are
-- immutable, the request text can never be edited (FR-020), and rows are never deleted.
create function app_private.f23_guard_food_replacement_request() returns trigger
language plpgsql set search_path = '' as $$
begin
  if pg_catalog.current_setting('app.f23_food_request_write', true) is distinct from 'on' then
    raise exception 'food_replacement_direct_dml_denied' using errcode = '23514';
  end if;
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'food_replacement_history_immutable' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'open' then
      raise exception 'food_replacement_closed_immutable' using errcode = '23514';
    end if;
    if (new.id, new.workspace_id, new.client_id, new.plan_id, new.plan_version_id,
        new.item_id, new.request_text, new.requested_by, new.created_at)
      is distinct from
       (old.id, old.workspace_id, old.client_id, old.plan_id, old.plan_version_id,
        old.item_id, old.request_text, old.requested_by, old.created_at) then
      raise exception 'food_replacement_request_text_immutable' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
alter function app_private.f23_guard_food_replacement_request() owner to postgres;
revoke all on function app_private.f23_guard_food_replacement_request()
  from public, anon, authenticated, service_role;

create trigger food_replacement_requests_guard_row
  before insert or update or delete on public.food_replacement_requests
  for each row execute function app_private.f23_guard_food_replacement_request();
create trigger food_replacement_requests_guard_truncate
  before truncate on public.food_replacement_requests
  for each statement execute function app_private.f23_guard_food_replacement_request();

alter table public.food_replacement_requests enable row level security;
alter table public.food_replacement_requests force row level security;

create policy food_replacement_requests_staff_read on public.food_replacement_requests
  for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));

-- The client self-read predicate is a definer helper so the policy never reads public.clients as
-- the caller (F18 uses the same pattern for its selection tables).
create function app_private.f23_is_own_client(p_workspace_id uuid, p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clients c
    where c.workspace_id = p_workspace_id and c.id = p_client_id
      and c.auth_user_id = (select auth.uid()) and c.approval_state = 'approved'
  )
$$;
alter function app_private.f23_is_own_client(uuid, uuid) owner to postgres;
revoke all on function app_private.f23_is_own_client(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function app_private.f23_is_own_client(uuid, uuid) to authenticated;

create policy food_replacement_requests_self_read on public.food_replacement_requests
  for select to authenticated
  using ((select app_private.f23_is_own_client(workspace_id, client_id)));

revoke all on public.food_replacement_requests from public, anon, authenticated, service_role;
grant select on public.food_replacement_requests to authenticated;

comment on table public.food_replacement_requests is
  'F23 US3 client food replacement requests: lifecycle open/rejected/approved/stale_closed plus client cancel; written only by definer operations.';

-- Locates an item id inside an F18 nutrition document (single_day or seven_day).
create function app_private.f23_nutrition_item_path(p_document jsonb, p_item_id text) returns text[]
language plpgsql immutable set search_path = '' as $$
declare d integer; m integer; i integer; v_items jsonb;
begin
  if p_document is null or jsonb_typeof(p_document) <> 'object' or p_item_id is null then
    return null;
  end if;
  if p_document->>'structure' = 'single_day' then
    if jsonb_typeof(p_document->'meals') = 'array' then
      for m in 0 .. jsonb_array_length(p_document->'meals') - 1 loop
        v_items := p_document #> array['meals', m::text, 'items'];
        if jsonb_typeof(v_items) = 'array' then
          for i in 0 .. jsonb_array_length(v_items) - 1 loop
            if v_items->i->>'id' = p_item_id then
              return array['meals', m::text, 'items', i::text];
            end if;
          end loop;
        end if;
      end loop;
    end if;
  elsif p_document->>'structure' = 'seven_day' then
    if jsonb_typeof(p_document->'days') = 'array' then
      for d in 0 .. jsonb_array_length(p_document->'days') - 1 loop
        if jsonb_typeof(p_document #> array['days', d::text, 'meals']) = 'array' then
          for m in 0 .. jsonb_array_length(p_document #> array['days', d::text, 'meals']) - 1 loop
            v_items := p_document #> array['days', d::text, 'meals', m::text, 'items'];
            if jsonb_typeof(v_items) = 'array' then
              for i in 0 .. jsonb_array_length(v_items) - 1 loop
                if v_items->i->>'id' = p_item_id then
                  return array['days', d::text, 'meals', m::text, 'items', i::text];
                end if;
              end loop;
            end if;
          end loop;
        end if;
      end loop;
    end if;
  end if;
  return null;
end $$;
alter function app_private.f23_nutrition_item_path(jsonb, text) owner to postgres;
revoke all on function app_private.f23_nutrition_item_path(jsonb, text)
  from public, anon, authenticated, service_role;

-- Deterministic canonical UUID v4 for an approval's new alternative id, so a retried
-- approval with the same operation key reproduces the same draft content.
create function app_private.f23_derived_uuid_v4(p_seed text) returns text
language sql immutable set search_path = '' as $$
  with digest as (select md5(coalesce(p_seed, '')) as value)
  select substr(value, 1, 8) || '-' || substr(value, 9, 4) || '-4' || substr(value, 14, 3)
    || '-8' || substr(value, 18, 3) || '-' || substr(value, 21, 12) from digest
$$;
alter function app_private.f23_derived_uuid_v4(text) owner to postgres;
revoke all on function app_private.f23_derived_uuid_v4(text)
  from public, anon, authenticated, service_role;

create function app_private.f23_food_request_audit(
  p_actor uuid, p_action text, p_request public.food_replacement_requests, p_outcome text
) returns void language sql security definer set search_path = '' as $$
  -- Ids and codes only; the free-text request never enters the audit log.
  insert into public.audit_events (actor_user_id, action, target_table, target_id, workspace_id, details)
  values (p_actor, p_action, 'food_replacement_requests', p_request.id, p_request.workspace_id,
    jsonb_build_object('client_id', p_request.client_id, 'plan_id', p_request.plan_id,
      'revision_id', p_request.plan_version_id, 'item_id', p_request.item_id, 'outcome', p_outcome));
$$;
alter function app_private.f23_food_request_audit(uuid, text, public.food_replacement_requests, text) owner to postgres;
revoke all on function app_private.f23_food_request_audit(uuid, text, public.food_replacement_requests, text)
  from public, anon, authenticated, service_role;

-- Client submits a free-text request for a new alternative (FR-019, FR-021).
create function public.submit_food_replacement_request(
  p_plan_version_id uuid, p_item_id text, p_request_text text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  v_rev public.plan_revisions%rowtype;
  v_client public.clients%rowtype;
  v_root public.plan_roots%rowtype;
  v_text text;
  v_active_count integer;
  v_active_sub_id uuid;
  v_latest_rev_id uuid;
  v_delivered_rev_id uuid;
  v_document jsonb;
  v_existing public.food_replacement_requests%rowtype;
  v_created public.food_replacement_requests%rowtype;
begin
  if actor is null or p_plan_version_id is null then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  -- Wall: the caller must be the approved, active client that owns this nutrition revision.
  -- A foreign or unknown revision and a foreign client are indistinguishable (42501).
  select r.* into v_rev from public.plan_revisions r
  where r.id = p_plan_version_id and r.plan_kind = 'nutrition';
  if not found then raise exception 'not_permitted' using errcode = '42501'; end if;
  select c.* into v_client from public.clients c
  where c.workspace_id = v_rev.workspace_id and c.auth_user_id = actor
    and c.approval_state = 'approved' and c.deactivated_at is null
  for update;
  if not found then raise exception 'not_permitted' using errcode = '42501'; end if;
  select p.* into v_root from public.plan_roots p
  where p.workspace_id = v_rev.workspace_id and p.id = v_rev.plan_id
    and p.client_id = v_client.id and p.plan_kind = 'nutrition';
  if not found then raise exception 'not_permitted' using errcode = '42501'; end if;

  select count(distinct app_private.f19_resolve_subscription_id(s.workspace_id, s.id))::integer,
         (array_agg(distinct app_private.f19_resolve_subscription_id(s.workspace_id, s.id)))[1]
  into v_active_count, v_active_sub_id
  from public.subscriptions s
  cross join lateral app_private.f13_project_entitlement(
    s.workspace_id, s.id, (statement_timestamp() at time zone 'Africa/Cairo')::date) as e(value)
  where s.workspace_id = v_client.workspace_id and s.client_id = v_client.id
    and e.value->>'status' in ('active', 'frozen');
  if v_active_count <> 1 or v_active_sub_id is null then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  v_text := btrim(p_request_text);
  if v_text is null or v_text = '' or char_length(v_text) > 1000 or octet_length(v_text) > 4096
    or p_item_id is null or p_item_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return '{"status":"invalid"}'::jsonb;
  end if;

  -- The request must target the revision the client currently has delivered and that is the latest.
  select r.id into v_latest_rev_id from public.plan_revisions r
  where r.workspace_id = v_root.workspace_id and r.plan_id = v_root.id
  order by r.revision_number desc limit 1;
  select d.revision_id into v_delivered_rev_id
  from public.plan_deliveries d
  join public.plan_revisions r
    on r.workspace_id = d.workspace_id and r.plan_id = d.plan_id and r.id = d.revision_id
  where d.workspace_id = v_root.workspace_id and d.client_id = v_root.client_id and d.plan_id = v_root.id
    and app_private.f19_resolve_subscription_id(d.workspace_id, d.subscription_id) = v_active_sub_id
  order by r.revision_number desc, d.delivered_at desc limit 1;
  if v_latest_rev_id is distinct from p_plan_version_id
    or v_delivered_rev_id is distinct from p_plan_version_id then
    return '{"status":"stale_version"}'::jsonb;
  end if;

  select c.document into v_document from public.nutrition_plan_version_contents c
  where c.workspace_id = v_root.workspace_id and c.plan_id = v_root.id and c.revision_id = p_plan_version_id;
  if not found or app_private.f23_nutrition_item_path(v_document, p_item_id) is null then
    return '{"status":"invalid"}'::jsonb;
  end if;

  select q.* into v_existing from public.food_replacement_requests q
  where q.workspace_id = v_root.workspace_id and q.plan_id = v_root.id
    and q.item_id = p_item_id and q.status = 'open';
  if found then
    return jsonb_build_object('status', 'already_open', 'request_id', v_existing.id);
  end if;

  perform pg_catalog.set_config('app.f23_food_request_write', 'on', true);
  insert into public.food_replacement_requests (
    workspace_id, client_id, plan_id, plan_version_id, item_id, request_text, requested_by
  ) values (
    v_root.workspace_id, v_client.id, v_root.id, p_plan_version_id, p_item_id, v_text, actor
  ) returning * into v_created;
  perform app_private.f23_food_request_audit(actor, 'progress.food_replacement_opened', v_created, 'open');
  perform pg_catalog.set_config('app.f23_food_request_write', '', true);
  return jsonb_build_object('status', 'created', 'request_id', v_created.id);
end $$;

-- Client cancels an own open request (FR-020); there is no in-place edit.
create function public.cancel_food_replacement_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); v_request public.food_replacement_requests%rowtype;
begin
  if actor is null or p_request_id is null then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select q.* into v_request from public.food_replacement_requests q where q.id = p_request_id;
  -- Another client's (or workspace's) request is indistinguishable from a missing one.
  if not found or not exists (
    select 1 from public.clients c
    where c.workspace_id = v_request.workspace_id and c.id = v_request.client_id
      and c.auth_user_id = actor and c.approval_state = 'approved' and c.deactivated_at is null
  ) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select q.* into v_request from public.food_replacement_requests q
  where q.workspace_id = v_request.workspace_id and q.id = p_request_id for update;
  if v_request.status <> 'open' then
    return jsonb_build_object('status', 'not_open');
  end if;
  perform pg_catalog.set_config('app.f23_food_request_write', 'on', true);
  update public.food_replacement_requests q
  set status = 'cancelled', resolved_at = clock_timestamp(), resolved_by = actor
  where q.workspace_id = v_request.workspace_id and q.id = v_request.id
  returning * into v_request;
  perform app_private.f23_food_request_audit(actor, 'progress.food_replacement_cancelled', v_request, 'cancelled');
  perform pg_catalog.set_config('app.f23_food_request_write', '', true);
  return jsonb_build_object('status', 'cancelled');
end $$;

-- Authorized trainer or workspace owner rejects an open request (FR-027).
create function public.reject_food_replacement_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); v_request public.food_replacement_requests%rowtype;
begin
  if actor is null or p_request_id is null then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select q.* into v_request from public.food_replacement_requests q where q.id = p_request_id;
  if not found or not app_private.has_workspace_access(v_request.workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select q.* into v_request from public.food_replacement_requests q
  where q.workspace_id = v_request.workspace_id and q.id = p_request_id for update;
  if v_request.status <> 'open' then
    return jsonb_build_object('status', 'not_open');
  end if;
  perform pg_catalog.set_config('app.f23_food_request_write', 'on', true);
  update public.food_replacement_requests q
  set status = 'rejected', resolved_at = clock_timestamp(), resolved_by = actor
  where q.workspace_id = v_request.workspace_id and q.id = v_request.id
  returning * into v_request;
  perform app_private.f23_food_request_audit(actor, 'progress.food_replacement_rejected', v_request, 'rejected');
  perform pg_catalog.set_config('app.f23_food_request_write', '', true);
  return jsonb_build_object('status', 'rejected');
end $$;

-- Trainer approval (FR-022/FR-023): prepares an F19 DRAFT that carries the new alternative within
-- the max-3 cap. It never publishes; the trainer uses F18 Ready & Publish. The request stays open
-- until that published revision contains the alternative (see the reconcile trigger below).
create function public.approve_food_replacement_request(
  p_request_id uuid,
  p_food_id uuid,
  p_food_version integer,
  p_quantity jsonb,
  p_replace_alternative_id text,
  p_expected_draft_version bigint,
  p_operation_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  v_request public.food_replacement_requests%rowtype;
  v_draft public.plan_drafts%rowtype;
  v_path text[];
  v_item jsonb;
  v_alts jsonb;
  v_next_alts jsonb;
  v_alt jsonb;
  v_alt_id text;
  v_doc jsonb;
  v_new_version bigint;
begin
  if actor is null or p_request_id is null then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select q.* into v_request from public.food_replacement_requests q where q.id = p_request_id;
  if not found or not app_private.has_workspace_access(v_request.workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_food_id is null or p_food_version is null or p_food_version < 1 or p_quantity is null
    or jsonb_typeof(p_quantity) <> 'object' or p_operation_key is null
    or p_expected_draft_version is null or p_expected_draft_version < 1 then
    return '{"status":"invalid"}'::jsonb;
  end if;
  select q.* into v_request from public.food_replacement_requests q
  where q.workspace_id = v_request.workspace_id and q.id = p_request_id for update;
  v_alt_id := app_private.f23_derived_uuid_v4('f23-food-replacement:' || p_request_id || ':' || p_operation_key);
  -- Exact replay of the same approval: report the draft already prepared.
  if v_request.status = 'open' and v_request.prepared_alternative_id = v_alt_id then
    return jsonb_build_object('status', 'prepared', 'draft_version', v_request.prepared_draft_version,
      'alternative_id', v_alt_id, 'replay', true);
  end if;
  if v_request.status <> 'open' then
    return jsonb_build_object('status', 'not_open');
  end if;
  if v_request.prepared_alternative_id is not null then
    return jsonb_build_object('status', 'already_prepared');
  end if;

  select d.* into v_draft from public.plan_drafts d
  where d.workspace_id = v_request.workspace_id and d.plan_id = v_request.plan_id for update;
  if not found then return '{"status":"unavailable"}'::jsonb; end if;
  if v_draft.draft_version <> p_expected_draft_version then
    return jsonb_build_object('status', 'stale_version', 'draft_version', v_draft.draft_version);
  end if;

  v_path := app_private.f23_nutrition_item_path(v_draft.content, v_request.item_id);
  if v_path is null then
    return '{"status":"target_missing"}'::jsonb;
  end if;
  v_item := v_draft.content #> v_path;
  v_alts := case when jsonb_typeof(v_item->'alternatives') = 'array' then v_item->'alternatives' else '[]'::jsonb end;
  v_alt := jsonb_build_object('id', v_alt_id, 'foodId', p_food_id::text,
    'foodVersion', p_food_version, 'quantity', p_quantity);

  if p_replace_alternative_id is null then
    -- FR-023: never exceed the cap, even temporarily.
    if jsonb_array_length(v_alts) >= 3 then
      return '{"status":"cap_reached"}'::jsonb;
    end if;
    v_next_alts := v_alts || jsonb_build_array(v_alt);
  else
    if not exists (select 1 from jsonb_array_elements(v_alts) a where a.value->>'id' = p_replace_alternative_id) then
      return '{"status":"invalid_replace"}'::jsonb;
    end if;
    select jsonb_agg(case when a.value->>'id' = p_replace_alternative_id then v_alt else a.value end
      order by a.ord) into v_next_alts
    from jsonb_array_elements(v_alts) with ordinality as a(value, ord);
  end if;
  if jsonb_array_length(v_next_alts) > 3 then
    return '{"status":"cap_reached"}'::jsonb;
  end if;
  v_doc := jsonb_set(v_draft.content, v_path || array['alternatives'], v_next_alts);

  -- F18 owns document validity (units, food versions, unique ids); a rejection leaves the draft untouched.
  begin
    perform app_private.nutrition_validate_document(v_doc);
    perform app_private.nutrition_build_snapshot_map(v_doc);
  exception when sqlstate '22023' then
    return '{"status":"invalid_alternative"}'::jsonb;
  end;

  -- F19 draft CAS and operation-key idempotency; staff authorization is re-checked there too.
  v_new_version := public.save_plan_draft(v_request.plan_id, p_expected_draft_version, v_doc, p_operation_key);

  perform pg_catalog.set_config('app.f23_food_request_write', 'on', true);
  update public.food_replacement_requests q
  set prepared_alternative_id = v_alt_id, prepared_draft_version = v_new_version,
      prepared_by = actor, prepared_at = clock_timestamp()
  where q.workspace_id = v_request.workspace_id and q.id = v_request.id
  returning * into v_request;
  perform app_private.f23_food_request_audit(actor, 'progress.food_replacement_prepared', v_request, 'draft_prepared');
  perform pg_catalog.set_config('app.f23_food_request_write', '', true);
  return jsonb_build_object('status', 'prepared', 'draft_version', v_new_version, 'alternative_id', v_alt_id);
end $$;

-- FR-025 and the approved-via-published-revision state: when F18 publishes a nutrition revision,
-- open requests of that plan close as stale (target removed) or approved (prepared alternative present).
create function app_private.f23_reconcile_food_requests() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.food_replacement_requests%rowtype;
  v_path text[];
  v_next text;
  v_closed public.food_replacement_requests%rowtype;
begin
  perform pg_catalog.set_config('app.f23_food_request_write', 'on', true);
  for r in
    select q.* from public.food_replacement_requests q
    where q.workspace_id = new.workspace_id and q.plan_id = new.plan_id and q.status = 'open'
    order by q.created_at, q.id for update
  loop
    v_path := app_private.f23_nutrition_item_path(new.document, r.item_id);
    v_next := null;
    if v_path is null then
      v_next := 'stale_closed';
    elsif r.prepared_alternative_id is not null and exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(new.document #> (v_path || array['alternatives'])) = 'array'
          then new.document #> (v_path || array['alternatives']) else '[]'::jsonb end) a
      where a.value->>'id' = r.prepared_alternative_id
    ) then
      v_next := 'approved';
    end if;
    if v_next is not null then
      update public.food_replacement_requests q
      set status = v_next, resolved_at = clock_timestamp(), resolved_by = new.created_by
      where q.workspace_id = r.workspace_id and q.id = r.id
      returning * into v_closed;
      perform app_private.f23_food_request_audit(new.created_by,
        case v_next when 'approved' then 'progress.food_replacement_approved'
          else 'progress.food_replacement_stale_closed' end, v_closed, v_next);
    elsif r.prepared_alternative_id is not null then
      -- The trainer published a revision without the prepared alternative: the request is not
      -- satisfied yet, so clear the stale preparation and let it be prepared again.
      update public.food_replacement_requests q
      set prepared_alternative_id = null, prepared_draft_version = null, prepared_by = null, prepared_at = null
      where q.workspace_id = r.workspace_id and q.id = r.id;
    end if;
  end loop;
  perform pg_catalog.set_config('app.f23_food_request_write', '', true);
  return null;
end $$;
alter function app_private.f23_reconcile_food_requests() owner to postgres;
revoke all on function app_private.f23_reconcile_food_requests()
  from public, anon, authenticated, service_role;

create trigger f23_reconcile_food_requests after insert on public.nutrition_plan_version_contents
  for each row execute function app_private.f23_reconcile_food_requests();

alter function public.submit_food_replacement_request(uuid, text, text) owner to postgres;
alter function public.cancel_food_replacement_request(uuid) owner to postgres;
alter function public.reject_food_replacement_request(uuid) owner to postgres;
alter function public.approve_food_replacement_request(uuid, uuid, integer, jsonb, text, bigint, uuid) owner to postgres;
revoke all on function public.submit_food_replacement_request(uuid, text, text),
  public.cancel_food_replacement_request(uuid),
  public.reject_food_replacement_request(uuid),
  public.approve_food_replacement_request(uuid, uuid, integer, jsonb, text, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_food_replacement_request(uuid, text, text),
  public.cancel_food_replacement_request(uuid),
  public.reject_food_replacement_request(uuid),
  public.approve_food_replacement_request(uuid, uuid, integer, jsonb, text, bigint, uuid)
  to authenticated;
