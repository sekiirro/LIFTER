-- S60-R14: denied selection audit events only include identifiers verified in
-- the immutable revision document. Successful selection audit payloads remain
-- unchanged.
create or replace function app_private.f18_selection_audit(
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
  with target_document as (
    select c.document
    from public.nutrition_plan_version_contents c
    where c.revision_id = p_revision_id
      and (p_plan_id is null or c.plan_id = p_plan_id)
      and (p_workspace_id is null or c.workspace_id = p_workspace_id)
  ),
  document_meals as (
    select meal.value as meal
    from target_document d
    cross join lateral pg_catalog.jsonb_array_elements(
      case
        when d.document->>'structure' = 'single_day'
          then coalesce(d.document->'meals', '[]'::jsonb)
        else coalesce((
          select pg_catalog.jsonb_agg(meal.value)
          from pg_catalog.jsonb_array_elements(
            coalesce(d.document->'days', '[]'::jsonb)
          ) as day_entry(value)
          cross join lateral pg_catalog.jsonb_array_elements(
            coalesce(day_entry.value->'meals', '[]'::jsonb)
          ) as meal(value)
        ), '[]'::jsonb)
      end
    ) as meal(value)
  ),
  document_items as (
    select item.value as item
    from document_meals meal
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(meal.meal->'items', '[]'::jsonb)
    ) as item(value)
  )
  insert into public.audit_events (
    actor_user_id, action, target_table, target_id, workspace_id, details
  ) values (
    p_actor,
    'client.nutrition_select',
    'client_nutrition_alternative_selections',
    coalesce(p_revision_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_workspace_id,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'plan_id', p_plan_id,
      'revision_id', p_revision_id,
      'item_id', case
        when p_outcome = 'denied' then (
          select i.item->>'id'
          from document_items i
          where i.item->>'id' = p_item_id
          limit 1
        )
        else p_item_id
      end,
      'alternative_id', case
        when p_outcome = 'denied' then (
          select alternative.value->>'id'
          from document_items i
          cross join lateral pg_catalog.jsonb_array_elements(
            coalesce(i.item->'alternatives', '[]'::jsonb)
          ) as alternative(value)
          where i.item->>'id' = p_item_id
            and alternative.value->>'id' = p_alternative_id
          limit 1
        )
        else p_alternative_id
      end,
      'outcome', p_outcome,
      'reason', p_reason,
      'selection_revision', p_selection_revision,
      'changed_fields', p_changed_fields
    ))
  );
$$;

alter function app_private.f18_selection_audit(uuid, uuid, uuid, uuid, text, text, text, text, integer, jsonb)
  owner to postgres;
revoke all on function app_private.f18_selection_audit(uuid, uuid, uuid, uuid, text, text, text, text, integer, jsonb)
  from public, anon, authenticated, service_role;
