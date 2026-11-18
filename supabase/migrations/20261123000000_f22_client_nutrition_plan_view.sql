-- F22 T017/T027/T029: client-wall read of one own delivered nutrition revision
-- with the F18 immutable content and the client's own alternative selections
-- for that exact revision. The F18 content table is staff-read only, so the
-- client portal and its exports need this client-derived, entitlement-gated
-- read. It composes existing F18/F19/F13 data and adds no table, status,
-- delivery entity, renderer or export engine: the F18 print/Excel builders
-- consume the returned projection unchanged.
--
-- Every client-facing failure that could reveal another client's data (foreign
-- plan, undelivered revision, draft-only plan, a workout plan id, unknown id)
-- shares one `not_found`.
create function public.client_portal_nutrition_plan(
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
  if summary->>'status' is distinct from 'active' then
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

alter function public.client_portal_nutrition_plan(uuid, integer) owner to postgres;
revoke all on function public.client_portal_nutrition_plan(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.client_portal_nutrition_plan(uuid, integer) to authenticated;
comment on function public.client_portal_nutrition_plan(uuid, integer) is
  'F22 client self-read of one own delivered nutrition revision (F18 content + own selections for that revision); restricted unless F13 projects active.';

notify pgrst, 'reload schema';
