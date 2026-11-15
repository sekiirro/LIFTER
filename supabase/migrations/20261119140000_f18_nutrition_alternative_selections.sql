-- F18 T010: Client nutrition alternative selections, durable per-revision counter, and select_nutrition_alternative RPC.

create table public.client_nutrition_alternative_selections (
  workspace_id uuid not null,
  plan_id uuid not null,
  plan_version_id uuid not null,
  client_id uuid not null,
  item_id text not null check (btrim(item_id) <> ''),
  alternative_id text not null check (btrim(alternative_id) <> ''),
  created_at timestamptz not null default now() check (isfinite(created_at)),
  updated_at timestamptz not null default now() check (isfinite(updated_at)),
  created_by uuid not null references auth.users(id) on delete restrict,
  primary key (workspace_id, plan_version_id, item_id),
  foreign key (workspace_id, plan_id)
    references public.plan_roots(workspace_id, id) on delete restrict,
  foreign key (workspace_id, client_id)
    references public.clients(workspace_id, id) on delete restrict,
  foreign key (workspace_id, plan_id, plan_version_id)
    references public.plan_revisions(workspace_id, plan_id, id) on delete restrict
);

create table public.client_nutrition_selection_revision_counters (
  workspace_id uuid not null,
  plan_id uuid not null,
  plan_version_id uuid not null,
  selection_revision integer not null default 0 check (selection_revision >= 0),
  updated_at timestamptz not null default now() check (isfinite(updated_at)),
  primary key (workspace_id, plan_version_id),
  foreign key (workspace_id, plan_id, plan_version_id)
    references public.plan_revisions(workspace_id, plan_id, id) on delete restrict
);

create function app_private.f18_guard_nutrition_selection() returns trigger
language plpgsql set search_path = '' as $$
begin
  if pg_catalog.current_setting('app.nutrition_selection_write', true) is distinct from 'on' then
    raise exception 'nutrition_selection_direct_dml_denied' using errcode = '23514';
  end if;
  if tg_table_name = 'client_nutrition_selection_revision_counters' then
    if tg_op in ('DELETE', 'TRUNCATE') then
      raise exception 'nutrition_selection_counter_immutable_delete' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and new.selection_revision <= old.selection_revision then
      raise exception 'nutrition_selection_counter_non_monotonic' using errcode = '23514';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

alter function app_private.f18_guard_nutrition_selection() owner to postgres;
revoke all on function app_private.f18_guard_nutrition_selection()
  from public, anon, authenticated, service_role;

create trigger client_nutrition_alternative_selections_guard_dml
  before insert or update or delete on public.client_nutrition_alternative_selections
  for each row execute function app_private.f18_guard_nutrition_selection();

create trigger client_nutrition_alternative_selections_no_truncate
  before truncate on public.client_nutrition_alternative_selections
  for each statement execute function app_private.f18_guard_nutrition_selection();

create trigger client_nutrition_selection_counters_guard_dml
  before insert or update or delete on public.client_nutrition_selection_revision_counters
  for each row execute function app_private.f18_guard_nutrition_selection();

create trigger client_nutrition_selection_counters_no_truncate
  before truncate on public.client_nutrition_selection_revision_counters
  for each statement execute function app_private.f18_guard_nutrition_selection();

alter table public.client_nutrition_alternative_selections enable row level security;
alter table public.client_nutrition_alternative_selections force row level security;

create policy client_nutrition_selections_staff_read
  on public.client_nutrition_alternative_selections
  for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));

create policy client_nutrition_selections_self_read
  on public.client_nutrition_alternative_selections
  for select to authenticated
  using (exists (
    select 1
    from public.clients c
    where c.workspace_id = client_nutrition_alternative_selections.workspace_id
      and c.id = client_nutrition_alternative_selections.client_id
      and c.auth_user_id = (select auth.uid())
      and c.approval_state = 'approved'
  ));

revoke all on public.client_nutrition_alternative_selections
  from public, anon, authenticated, service_role;
grant select on public.client_nutrition_alternative_selections to authenticated;

alter table public.client_nutrition_selection_revision_counters enable row level security;
alter table public.client_nutrition_selection_revision_counters force row level security;

create policy client_nutrition_selection_counters_staff_read
  on public.client_nutrition_selection_revision_counters
  for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));

create policy client_nutrition_selection_counters_self_read
  on public.client_nutrition_selection_revision_counters
  for select to authenticated
  using (exists (
    select 1
    from public.plan_roots p
    join public.clients c
      on c.workspace_id = p.workspace_id
     and c.id = p.client_id
    where p.workspace_id = client_nutrition_selection_revision_counters.workspace_id
      and p.id = client_nutrition_selection_revision_counters.plan_id
      and c.auth_user_id = (select auth.uid())
      and c.approval_state = 'approved'
  ));

revoke all on public.client_nutrition_selection_revision_counters
  from public, anon, authenticated, service_role;
grant select on public.client_nutrition_selection_revision_counters to authenticated;

create function app_private.f18_selection_audit(
  p_actor uuid,
  p_workspace_id uuid,
  p_plan_id uuid,
  p_revision_id uuid,
  p_item_id text,
  p_alternative_id text,
  p_outcome text,
  p_reason text default null,
  p_selection_revision integer default null,
  p_changed_fields jsonb default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_events (
    actor_user_id, action, target_table, target_id, workspace_id, details
  ) values (
    p_actor,
    'client.nutrition_select',
    'client_nutrition_alternative_selections',
    coalesce(p_revision_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_workspace_id,
    jsonb_strip_nulls(jsonb_build_object(
      'plan_id', p_plan_id,
      'revision_id', p_revision_id,
      'item_id', p_item_id,
      'alternative_id', p_alternative_id,
      'outcome', p_outcome,
      'reason', p_reason,
      'selection_revision', p_selection_revision,
      'changed_fields', p_changed_fields
    ))
  );
$$;

alter function app_private.f18_selection_audit(uuid, uuid, uuid, uuid, text, text, text, text, integer, jsonb) owner to postgres;
revoke all on function app_private.f18_selection_audit(uuid, uuid, uuid, uuid, text, text, text, text, integer, jsonb)
  from public, anon, authenticated, service_role;

create function public.select_nutrition_alternative(
  p_plan_version_id uuid,
  p_item_id text,
  p_alternative_id text,
  p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  v_client public.clients%rowtype;
  v_client_count integer;
  v_active_count integer;
  v_active_sub_id uuid;
  v_rev public.plan_revisions%rowtype;
  v_root public.plan_roots%rowtype;
  v_request_hash text;
  v_prior app_private.operation_keys%rowtype;
  v_latest_rev_id uuid;
  v_delivered_rev_id uuid;
  v_document jsonb;
  v_item jsonb;
  v_item_found boolean := false;
  v_alt_valid boolean := false;
  v_current public.client_nutrition_alternative_selections%rowtype;
  v_current_found boolean := false;
  v_is_noop boolean := false;
  v_sel_rev integer := 0;
  v_result jsonb;
begin
  if actor is null then
    return jsonb_build_object('status', 'not_permitted');
  end if;

  if p_operation_key is null
    or substring(p_operation_key::text from 15 for 1) <> '4'
    or substring(p_operation_key::text from 20 for 1) not in ('8', '9', 'a', 'b') then
    perform app_private.f18_selection_audit(
      actor, null, null, p_plan_version_id, p_item_id, p_alternative_id, 'denied', 'invalid_operation_key'
    );
    return jsonb_build_object('status', 'not_permitted');
  end if;

  select count(*)::integer into v_client_count
  from public.clients c
  where c.auth_user_id = actor
    and c.approval_state = 'approved';

  if v_client_count <> 1 then
    perform app_private.f18_selection_audit(
      actor, null, null, p_plan_version_id, p_item_id, p_alternative_id, 'denied', 'not_client'
    );
    return jsonb_build_object('status', 'not_permitted');
  end if;

  select * into v_client
  from public.clients c
  where c.auth_user_id = actor
    and c.approval_state = 'approved'
  for update;

  select count(distinct app_private.f19_resolve_subscription_id(s.workspace_id, s.id))::integer,
         (array_agg(distinct app_private.f19_resolve_subscription_id(s.workspace_id, s.id)))[1]
  into v_active_count, v_active_sub_id
  from public.subscriptions s
  cross join lateral app_private.f13_project_entitlement(
    s.workspace_id, s.id, (statement_timestamp() at time zone 'Africa/Cairo')::date
  ) as e(value)
  where s.workspace_id = v_client.workspace_id
    and s.client_id = v_client.id
    and e.value->>'status' in ('active', 'frozen');

  if v_active_count <> 1 or v_active_sub_id is null then
    perform app_private.f18_selection_audit(
      actor, v_client.workspace_id, null, p_plan_version_id, p_item_id, p_alternative_id, 'denied', 'inactive_subscription'
    );
    return jsonb_build_object('status', 'not_permitted');
  end if;

  if p_plan_version_id is null then
    perform app_private.f18_selection_audit(
      actor, v_client.workspace_id, null, null, p_item_id, p_alternative_id, 'denied', 'missing_revision'
    );
    return jsonb_build_object('status', 'not_permitted');
  end if;

  select r.* into v_rev
  from public.plan_revisions r
  where r.id = p_plan_version_id
    and r.workspace_id = v_client.workspace_id
    and r.plan_kind = 'nutrition';

  if not found then
    perform app_private.f18_selection_audit(
      actor, v_client.workspace_id, null, p_plan_version_id, p_item_id, p_alternative_id, 'denied', 'not_permitted'
    );
    return jsonb_build_object('status', 'not_permitted');
  end if;

  select * into v_root
  from public.plan_roots p
  where p.workspace_id = v_client.workspace_id
    and p.id = v_rev.plan_id
    and p.client_id = v_client.id
    and p.plan_kind = 'nutrition'
  for update;

  if not found then
    perform app_private.f18_selection_audit(
      actor, v_client.workspace_id, null, p_plan_version_id, p_item_id, p_alternative_id, 'denied', 'foreign_plan'
    );
    return jsonb_build_object('status', 'not_permitted');
  end if;

  v_request_hash := 'sha256:' || encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        jsonb_build_array('client.nutrition_select', p_plan_version_id, p_item_id, p_alternative_id)::text,
        'UTF8'
      )
    ),
    'hex'
  );

  select * into v_prior
  from app_private.operation_keys k
  where k.actor_user_id = actor
    and k.operation_key = p_operation_key
  for update;

  if found then
    if v_prior.action is distinct from 'client.nutrition_select'
      or v_prior.request_hash is distinct from v_request_hash then
      perform app_private.f18_selection_audit(
        actor, v_root.workspace_id, v_root.id, p_plan_version_id, p_item_id, p_alternative_id, 'denied', 'key_conflict'
      );
      return jsonb_build_object('status', 'key_conflict');
    end if;
    if v_prior.result is not null then
      return v_prior.result;
    end if;
    return jsonb_build_object('status', 'not_permitted');
  end if;

  insert into app_private.operation_keys (
    actor_user_id, action, operation_key, request_hash
  ) values (
    actor, 'client.nutrition_select', p_operation_key, v_request_hash
  );

  select r.id into v_latest_rev_id
  from public.plan_revisions r
  where r.workspace_id = v_root.workspace_id
    and r.plan_id = v_root.id
  order by r.revision_number desc
  limit 1;

  select d.revision_id into v_delivered_rev_id
  from public.plan_deliveries d
  join public.plan_revisions r
    on r.workspace_id = d.workspace_id
   and r.plan_id = d.plan_id
   and r.id = d.revision_id
  where d.workspace_id = v_root.workspace_id
    and d.client_id = v_root.client_id
    and d.plan_id = v_root.id
    and app_private.f19_resolve_subscription_id(d.workspace_id, d.subscription_id) = v_active_sub_id
  order by r.revision_number desc, d.delivered_at desc
  limit 1;

  if v_latest_rev_id is distinct from p_plan_version_id
    or v_delivered_rev_id is distinct from p_plan_version_id then
    perform app_private.f18_selection_audit(
      actor, v_root.workspace_id, v_root.id, p_plan_version_id, p_item_id, p_alternative_id, 'denied', 'stale_version'
    );
    v_result := jsonb_build_object('status', 'stale_version');
    update app_private.operation_keys
    set result = v_result
    where actor_user_id = actor and operation_key = p_operation_key and result is null;
    return v_result;
  end if;

  select c.document into v_document
  from public.nutrition_plan_version_contents c
  where c.workspace_id = v_root.workspace_id
    and c.plan_id = v_root.id
    and c.revision_id = p_plan_version_id;

  if not found or p_item_id is null or btrim(p_item_id) = '' then
    perform app_private.f18_selection_audit(
      actor, v_root.workspace_id, v_root.id, p_plan_version_id, p_item_id, p_alternative_id, 'denied', 'invalid_selection'
    );
    v_result := jsonb_build_object('status', 'invalid_selection');
    update app_private.operation_keys
    set result = v_result
    where actor_user_id = actor and operation_key = p_operation_key and result is null;
    return v_result;
  end if;

  for v_item in
    select i.value
    from (
      select m.value as meal
      from jsonb_array_elements(
        case
          when v_document->>'structure' = 'single_day' then coalesce(v_document->'meals', '[]'::jsonb)
          else coalesce((
            select jsonb_agg(meal_el.value)
            from jsonb_array_elements(coalesce(v_document->'days', '[]'::jsonb)) d_el,
                 jsonb_array_elements(coalesce(d_el.value->'meals', '[]'::jsonb)) meal_el
          ), '[]'::jsonb)
        end
      ) m
    ) meals,
    jsonb_array_elements(coalesce(meals.meal->'items', '[]'::jsonb)) i
  loop
    if (v_item->>'id') = p_item_id then
      v_item_found := true;
      if p_alternative_id is null then
        v_alt_valid := true;
      else
        select exists (
          select 1
          from jsonb_array_elements(coalesce(v_item->'alternatives', '[]'::jsonb)) a
          where (a.value->>'id') = p_alternative_id
        ) into v_alt_valid;
      end if;
      exit;
    end if;
  end loop;

  if not v_item_found or not v_alt_valid then
    perform app_private.f18_selection_audit(
      actor, v_root.workspace_id, v_root.id, p_plan_version_id, p_item_id, p_alternative_id, 'denied', 'invalid_selection'
    );
    v_result := jsonb_build_object('status', 'invalid_selection');
    update app_private.operation_keys
    set result = v_result
    where actor_user_id = actor and operation_key = p_operation_key and result is null;
    return v_result;
  end if;

  select * into v_current
  from public.client_nutrition_alternative_selections s
  where s.workspace_id = v_root.workspace_id
    and s.plan_version_id = p_plan_version_id
    and s.item_id = p_item_id
  for update;
  v_current_found := found;

  v_is_noop := (p_alternative_id is not null and v_current_found and v_current.alternative_id = p_alternative_id)
    or (p_alternative_id is null and not v_current_found);

  if v_is_noop then
    select coalesce(c.selection_revision, 0) into v_sel_rev
    from public.client_nutrition_selection_revision_counters c
    where c.workspace_id = v_root.workspace_id
      and c.plan_version_id = p_plan_version_id;
    v_sel_rev := coalesce(v_sel_rev, 0);
    v_result := jsonb_build_object(
      'status', 'ok',
      'selection_revision', v_sel_rev,
      'noop', true,
      'selected_alternative_id', case when v_current_found then v_current.alternative_id else null end
    );
    update app_private.operation_keys
    set result = v_result
    where actor_user_id = actor and operation_key = p_operation_key and result is null;
    return v_result;
  end if;

  perform pg_catalog.set_config('app.nutrition_selection_write', 'on', true);

  if p_alternative_id is null then
    delete from public.client_nutrition_alternative_selections s
    where s.workspace_id = v_root.workspace_id
      and s.plan_version_id = p_plan_version_id
      and s.item_id = p_item_id;
  else
    insert into public.client_nutrition_alternative_selections (
      workspace_id, plan_id, plan_version_id, client_id, item_id, alternative_id,
      created_by, created_at, updated_at
    ) values (
      v_root.workspace_id, v_root.id, p_plan_version_id, v_root.client_id, p_item_id, p_alternative_id,
      actor, now(), now()
    )
    on conflict (workspace_id, plan_version_id, item_id) do update
      set alternative_id = excluded.alternative_id,
          updated_at = now();
  end if;

  insert into public.client_nutrition_selection_revision_counters (
    workspace_id, plan_id, plan_version_id, selection_revision, updated_at
  ) values (
    v_root.workspace_id, v_root.id, p_plan_version_id, 1, now()
  )
  on conflict (workspace_id, plan_version_id) do update
    set selection_revision = public.client_nutrition_selection_revision_counters.selection_revision + 1,
        updated_at = now()
  returning selection_revision into v_sel_rev;

  perform app_private.f18_selection_audit(
    actor,
    v_root.workspace_id,
    v_root.id,
    p_plan_version_id,
    p_item_id,
    p_alternative_id,
    case when p_alternative_id is null then 'cleared' else 'selected' end,
    null,
    v_sel_rev,
    jsonb_build_array('selection')
  );

  v_result := jsonb_build_object(
    'status', 'ok',
    'selection_revision', v_sel_rev,
    'noop', false,
    'selected_alternative_id', p_alternative_id
  );
  update app_private.operation_keys
  set result = v_result
  where actor_user_id = actor and operation_key = p_operation_key and result is null;
  return v_result;
end $$;

alter function public.select_nutrition_alternative(uuid, text, text, uuid) owner to postgres;
revoke all on function public.select_nutrition_alternative(uuid, text, text, uuid)
  from public, anon, service_role;
grant execute on function public.select_nutrition_alternative(uuid, text, text, uuid)
  to authenticated;

comment on table public.client_nutrition_alternative_selections is
  'F18 T010 version-scoped client alternative selections (no row = coach default).';
comment on table public.client_nutrition_selection_revision_counters is
  'F18 T010 durable per-revision selection counter; survives selection row deletion.';
