-- F22 FR-006/FR-007 (review item 5): record_nutrition_export_audit applies the same
-- active-and-not-overdue condition to the plan's own client success audit as the read
-- (client_portal_nutrition_plan) and as record_workout_export_audit. Staff and Platform Owner
-- behavior, denial audits and every other check are unchanged (previous definition:
-- 20261120210000_f18_nutrition_export_audit.sql).

create or replace function public.record_nutrition_export_audit(
  p_workspace_id uuid,
  p_plan_id uuid,
  p_revision_id uuid,
  p_outcome text,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid;
  v_workspace_id uuid;
  v_client_id uuid;
begin
  v_actor_user_id := auth.uid();

  if p_outcome is null or p_outcome not in ('success', 'denied')
    or (p_outcome = 'success' and p_reason is not null)
    or (p_outcome = 'denied' and (
      p_reason is null or p_reason not in ('not_permitted', 'not_found')
    )) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  select pr.workspace_id, pr.client_id
    into v_workspace_id, v_client_id
  from public.plan_roots pr
  where pr.id = p_plan_id;

  if v_actor_user_id is null then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if p_outcome = 'denied' then
    insert into public.audit_events (
      actor_user_id,
      action,
      target_table,
      target_id,
      workspace_id,
      details
    ) values (
      v_actor_user_id,
      'plan.nutrition_export',
      'plan_revisions',
      coalesce(p_revision_id, p_plan_id, '00000000-0000-0000-0000-000000000000'::uuid),
      v_workspace_id,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'plan_id', p_plan_id,
        'revision_id', p_revision_id,
        'outcome', p_outcome,
        'reason', p_reason
      ))
    );
    return;
  end if;

  if not found then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if p_revision_id is not null and not exists (
    select 1
    from public.plan_revisions r
    where r.id = p_revision_id and r.plan_id = p_plan_id
  ) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if not coalesce(app_private.is_platform_owner(), false)
    and not exists (
      select 1
      from public.workspace_memberships wm
      join public.staff_profiles sp on sp.user_id = wm.user_id
      where wm.user_id = v_actor_user_id
        and wm.workspace_id = v_workspace_id
        and wm.revoked_at is null
        and coalesce(app_private.role_has_capability(sp.role, 'coaching_work'), false)
    )
    and not exists (
      select 1 from public.clients c
      where c.id = v_client_id
        and c.workspace_id = v_workspace_id
        and c.auth_user_id = v_actor_user_id
        and c.approval_state = 'approved'
        -- F22 FR-006: a restricted or overdue client cannot record an export that never
        -- happened; the client read is gated the same way.
        and (app_private.f22_subscription_summary(c.workspace_id, c.id) ->> 'status') = 'active'
        and not coalesce(
          (app_private.f22_subscription_summary(c.workspace_id, c.id) ->> 'overdue')::boolean, true)
    ) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  insert into public.audit_events (
    actor_user_id,
    action,
    target_table,
    target_id,
    workspace_id,
    details
  ) values (
    v_actor_user_id,
    'plan.nutrition_export',
    'plan_revisions',
    coalesce(p_revision_id, p_plan_id, '00000000-0000-0000-0000-000000000000'::uuid),
    v_workspace_id,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'plan_id', p_plan_id,
      'revision_id', p_revision_id,
      'outcome', p_outcome,
      'reason', p_reason
    ))
  );
end;
$$;

alter function public.record_nutrition_export_audit(uuid, uuid, uuid, text, text) owner to postgres;
revoke all on function public.record_nutrition_export_audit(uuid, uuid, uuid, text, text) from public, anon, service_role;
grant execute on function public.record_nutrition_export_audit(uuid, uuid, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
