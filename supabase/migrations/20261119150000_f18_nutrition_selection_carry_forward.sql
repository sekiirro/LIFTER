-- F18 T011: carry client selections only across stable item and alternative ids.
create or replace function public.publish_nutrition_revision(
  p_plan_id uuid,
  p_expected_draft_version bigint,
  p_expected_published_version bigint,
  p_operation_key uuid,
  p_caller_payload jsonb default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  root public.plan_roots%rowtype;
  v_receipt jsonb;
  v_revision_id uuid;
  v_document jsonb;
  v_snapshot_map jsonb;
  v_computed_values jsonb;
  v_source_revision_id uuid;
  v_source_revision_number bigint;
  v_source_content jsonb;
  v_selection public.client_nutrition_alternative_selections%rowtype;
  v_active_count integer := 0;
  v_active_subscription_id uuid;
  v_selection_count integer := 0;
  v_carried_selection boolean := false;
begin
  -- p_caller_payload is intentionally ignored: caller-supplied snapshots, totals, or documents are never trusted.
  if actor is null then
    return jsonb_build_object('status', 'not_permitted');
  end if;

  select * into root
  from public.plan_roots p
  where p.id = p_plan_id;
  if not found
    or root.plan_kind <> 'nutrition'
    or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then
    return jsonb_build_object('status', 'not_permitted');
  end if;

  v_receipt := app_private.ready_and_publish_plan_impl(
    p_plan_id,
    p_expected_draft_version,
    p_expected_published_version,
    p_operation_key
  );

  if coalesce(v_receipt->>'status', '') <> 'ok' then
    return v_receipt;
  end if;

  v_revision_id := (v_receipt->>'revision_id')::uuid;

  -- Exact authorized replay: content and audit already exist for this revision.
  if exists (
    select 1
    from public.nutrition_plan_version_contents c
    where c.workspace_id = root.workspace_id
      and c.revision_id = v_revision_id
  ) then
    return v_receipt;
  end if;

  select r.content into v_document
  from public.plan_revisions r
  where r.workspace_id = root.workspace_id
    and r.plan_id = root.id
    and r.id = v_revision_id;

  perform app_private.nutrition_validate_document(v_document);
  v_snapshot_map := app_private.nutrition_build_snapshot_map(v_document);
  v_computed_values := app_private.nutrition_compute_values(v_document, v_snapshot_map, null);

  insert into public.nutrition_plan_version_contents (
    workspace_id, plan_id, revision_id, schema_version, algorithm_version,
    document, snapshot_map, computed_values, created_by
  ) values (
    root.workspace_id, root.id, v_revision_id, 1, 1,
    v_document, v_snapshot_map, v_computed_values, actor
  );

  -- The preceding revision is identified only after the F19 plan-root lock has been acquired.
  -- Selection and publish therefore serialize on the same root; no stale selection can interleave.
  v_source_revision_number := (v_receipt->>'revision_number')::bigint - 1;
  if v_source_revision_number > 0 then
    select r.id into v_source_revision_id
    from public.plan_revisions r
    where r.workspace_id = root.workspace_id
      and r.plan_id = root.id
      and r.revision_number = v_source_revision_number;

    if found then
      select c.document into v_source_content
      from public.nutrition_plan_version_contents c
      where c.workspace_id = root.workspace_id
        and c.plan_id = root.id
        and c.revision_id = v_source_revision_id;

      -- Recheck the client's current account and entitlement inside this transaction.
      select count(distinct app_private.f19_resolve_subscription_id(s.workspace_id, s.id))::integer,
             (array_agg(distinct app_private.f19_resolve_subscription_id(s.workspace_id, s.id)))[1]
      into v_active_count, v_active_subscription_id
      from public.clients c
      join public.subscriptions s
        on s.workspace_id = c.workspace_id
       and s.client_id = c.id
      cross join lateral app_private.f13_project_entitlement(
        s.workspace_id, s.id, (statement_timestamp() at time zone 'Africa/Cairo')::date
      ) as e(value)
      where c.workspace_id = root.workspace_id
        and c.id = root.client_id
        and c.approval_state = 'approved'
        and c.auth_user_id is not null
        and c.deactivated_at is null
        and e.value->>'status' in ('active', 'frozen');

      if v_active_count = 1
        and v_active_subscription_id is not null
        and v_active_subscription_id = nullif(v_receipt->>'subscription_id', '')::uuid
        and exists (
          select 1
          from public.plan_deliveries d
          where d.workspace_id = root.workspace_id
            and d.plan_id = root.id
            and d.revision_id = v_revision_id
            and d.client_id = root.client_id
            and app_private.f19_resolve_subscription_id(d.workspace_id, d.subscription_id) = v_active_subscription_id
        ) then
        perform pg_catalog.set_config('app.nutrition_selection_write', 'on', true);

        for v_selection in
          select s.*
          from public.client_nutrition_alternative_selections s
          where s.workspace_id = root.workspace_id
            and s.plan_id = root.id
            and s.plan_version_id = v_source_revision_id
            and exists (
              select 1
              from (
                select meal_el.value as meal
                from jsonb_array_elements(
                  case
                    when v_source_content->>'structure' = 'single_day'
                      then coalesce(v_source_content->'meals', '[]'::jsonb)
                    else coalesce((
                      select jsonb_agg(meal_el.value)
                      from jsonb_array_elements(coalesce(v_source_content->'days', '[]'::jsonb)) day_el,
                           jsonb_array_elements(coalesce(day_el.value->'meals', '[]'::jsonb)) meal_el
                    ), '[]'::jsonb)
                  end
                ) meal_el
              ) source_meals,
              jsonb_array_elements(coalesce(source_meals.meal->'items', '[]'::jsonb)) source_item,
              jsonb_array_elements(coalesce(source_item.value->'alternatives', '[]'::jsonb)) source_alt
              where source_item.value->>'id' = s.item_id
                and source_alt.value->>'id' = s.alternative_id
            )
            and exists (
              select 1
              from (
                select meal_el.value as meal
                from jsonb_array_elements(
                  case
                    when v_document->>'structure' = 'single_day'
                      then coalesce(v_document->'meals', '[]'::jsonb)
                    else coalesce((
                      select jsonb_agg(meal_el.value)
                      from jsonb_array_elements(coalesce(v_document->'days', '[]'::jsonb)) day_el,
                           jsonb_array_elements(coalesce(day_el.value->'meals', '[]'::jsonb)) meal_el
                    ), '[]'::jsonb)
                  end
                ) meal_el
              ) target_meals,
              jsonb_array_elements(coalesce(target_meals.meal->'items', '[]'::jsonb)) target_item,
              jsonb_array_elements(coalesce(target_item.value->'alternatives', '[]'::jsonb)) target_alt
              where target_item.value->>'id' = s.item_id
                and target_alt.value->>'id' = s.alternative_id
            )
        loop
          insert into public.client_nutrition_alternative_selections (
            workspace_id, plan_id, plan_version_id, client_id, item_id, alternative_id,
            created_by, created_at, updated_at
          ) values (
            v_selection.workspace_id, v_selection.plan_id, v_revision_id, v_selection.client_id,
            v_selection.item_id, v_selection.alternative_id, v_selection.created_by, now(), now()
          );
          v_selection_count := v_selection_count + 1;
        end loop;

        if v_selection_count > 0 then
          insert into public.client_nutrition_selection_revision_counters (
            workspace_id, plan_id, plan_version_id, selection_revision, updated_at
          ) values (
            root.workspace_id, root.id, v_revision_id, 1, now()
          );
          v_carried_selection := true;
        end if;
      end if;
    end if;
  end if;

  insert into public.audit_events (
    actor_user_id, action, target_table, target_id, workspace_id, details
  ) values (
    actor,
    'plan.nutrition_publish',
    'nutrition_plan_version_contents',
    v_revision_id,
    root.workspace_id,
    jsonb_build_object(
      'plan_id', root.id,
      'revision_id', v_revision_id,
      'revision_number', (v_receipt->>'revision_number')::bigint,
      'delivery_id', (v_receipt->>'delivery_id')::uuid,
      'changed_fields', case
        when v_carried_selection then jsonb_build_array('document', 'selection')
        else jsonb_build_array('document')
      end
    )
  );

  return v_receipt;
end $$;
