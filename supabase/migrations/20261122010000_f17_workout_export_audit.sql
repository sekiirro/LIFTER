-- F17 T039: published-only workout export audit (FR-017; SC-008).
--
-- Mirrors the merged F18 T023 export-audit recorder contract with a
-- workout-specific allowlist. The recorder accepts only identity, format,
-- outcome and a closed denial reason code. No content, notes, exercise names,
-- URLs, client data or PII filenames can enter an export audit event.

create or replace function app_private.f17_audit_allowlist_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  allowed_keys text[] := array['plan_id', 'revision_id', 'format', 'outcome', 'reason'];
  key text;
  value jsonb;
begin
  if new.action <> 'plan.workout_export' then
    return new;
  end if;

  if new.target_table is distinct from 'plan_revisions' or new.actor_user_id is null then
    raise exception 'workout_audit_target_not_allowlisted' using errcode = '23514';
  end if;
  if jsonb_typeof(new.details) <> 'object' then
    raise exception 'workout_audit_details_not_object' using errcode = '23514';
  end if;
  for key, value in select e.key, e.value from jsonb_each(new.details) e loop
    if not key = any(allowed_keys) then
      raise exception 'workout_audit_field_not_allowlisted' using errcode = '23514';
    end if;
    if key in ('plan_id', 'revision_id') then
      if jsonb_typeof(value) <> 'string'
         or value #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'workout_audit_id_invalid' using errcode = '23514';
      end if;
    elsif key = 'format' then
      if value #>> '{}' not in ('pdf', 'excel', 'ai_prompt') then
        raise exception 'workout_audit_code_invalid' using errcode = '23514';
      end if;
    elsif key = 'outcome' then
      if value #>> '{}' not in ('success', 'denied') then
        raise exception 'workout_audit_code_invalid' using errcode = '23514';
      end if;
    elsif key = 'reason' then
      if value #>> '{}' not in ('not_permitted', 'not_found') then
        raise exception 'workout_audit_code_invalid' using errcode = '23514';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

alter function app_private.f17_audit_allowlist_guard() owner to postgres;
revoke all on function app_private.f17_audit_allowlist_guard()
  from public, anon, authenticated, service_role;

drop trigger if exists f17_workout_export_audit_allowlist on public.audit_events;
create trigger f17_workout_export_audit_allowlist before insert on public.audit_events
  for each row execute function app_private.f17_audit_allowlist_guard();

-- The one write path for workout export audit events. SECURITY DEFINER is
-- required because authenticated callers may only SELECT from audit_events.
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
  if v_plan_id is null and p_revision_id is not null then
    select r.plan_id into v_plan_id
    from public.plan_revisions r
    where r.id = p_revision_id and r.plan_kind = 'workout';
  end if;

  select pr.workspace_id into v_workspace_id
  from public.plan_roots pr
  where pr.id = v_plan_id;

  if p_outcome = 'denied' then
    insert into public.audit_events (
      actor_user_id, action, target_table, target_id, workspace_id, details
    ) values (
      v_actor,
      'plan.workout_export',
      'plan_revisions',
      coalesce(p_revision_id, v_plan_id, '00000000-0000-0000-0000-000000000000'::uuid),
      v_workspace_id,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'plan_id', v_plan_id,
        'revision_id', p_revision_id,
        'format', p_format,
        'outcome', p_outcome,
        'reason', p_reason
      ))
    );
    return;
  end if;

  -- Success is only auditable for an explicitly selected published workout
  -- revision; a draft or a foreign kind can never reach this branch.
  if v_plan_id is null or p_revision_id is null or not exists (
    select 1 from public.plan_revisions r
    where r.id = p_revision_id and r.plan_id = v_plan_id and r.plan_kind = 'workout'
  ) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if not coalesce(app_private.is_platform_owner(), false)
     and not exists (
       select 1
       from public.workspace_memberships wm
       join public.staff_profiles sp on sp.user_id = wm.user_id
       where wm.user_id = v_actor
         and wm.workspace_id = v_workspace_id
         and wm.revoked_at is null
         and coalesce(app_private.role_has_capability(sp.role, 'coaching_work'), false)
     ) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  insert into public.audit_events (
    actor_user_id, action, target_table, target_id, workspace_id, details
  ) values (
    v_actor,
    'plan.workout_export',
    'plan_revisions',
    coalesce(p_revision_id, v_plan_id, '00000000-0000-0000-0000-000000000000'::uuid),
    v_workspace_id,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'plan_id', v_plan_id,
      'revision_id', p_revision_id,
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
