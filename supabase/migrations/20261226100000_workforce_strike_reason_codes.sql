-- 341-B9 / S71-PO-14/15 / S71-R40: strike corrections store fixed reason codes only.
-- S71-R11 moves this follow-up above the P7 train. LIFTER has no real clients
-- (S71-R10), so the existing free-text column is converted directly with no
-- legacy-data migration path.

drop function public.correct_workforce_strike(uuid, uuid, text, uuid, text, uuid);

alter table public.workforce_strike_corrections
  rename column reason to reason_code;
alter table public.workforce_strike_corrections
  drop constraint workforce_strike_corrections_reason_check;
alter table public.workforce_strike_corrections
  add constraint workforce_strike_corrections_reason_code_check
  check (reason_code in (
    'client_caused_delay',
    'system_issue',
    'wrong_trainer',
    'duplicate',
    'po_exception'
  ));

create function public.correct_workforce_strike(
  p_workspace_id uuid,
  p_strike_id uuid,
  p_operation text,
  p_target_trainer_user_id uuid,
  p_reason_code text,
  p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  event_row public.workforce_strike_events%rowtype;
  prior public.workforce_strike_corrections%rowtype;
  request_hash bytea;
  next_no integer;
  latest_void integer;
  latest_reinstate integer;
  current_trainer uuid;
  audit_reference uuid;
  correction_id uuid;
  violation_constraint text;
begin
  if actor is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_workspace_id is null or p_strike_id is null or p_idempotency_key is null
    or p_operation not in ('void', 'reinstate', 'reattribute')
    or ((p_operation = 'reattribute') <> (p_target_trainer_user_id is not null)) then
    return jsonb_build_object('status', 'invalid_input');
  end if;
  if p_reason_code is null or pg_catalog.btrim(p_reason_code) = '' then
    raise exception 'invalid_reason_code' using errcode = '22023';
  end if;
  request_hash := extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'workspace_id', p_workspace_id, 'strike_id', p_strike_id,
      'operation', p_operation, 'target_trainer_user_id', p_target_trainer_user_id,
      'reason', p_reason_code, 'actor', actor
    )::text, 'UTF8'), 'sha256');

  select * into prior from public.workforce_strike_corrections c
  where c.workspace_id = p_workspace_id and c.idempotency_key = p_idempotency_key;
  if found then
    if prior.request_hash <> request_hash then
      return jsonb_build_object('status', 'idempotency_conflict');
    end if;
    return jsonb_build_object(
      'status', 'ok', 'correction_id', prior.id, 'audit_ref', prior.audit_ref, 'replayed', true
    );
  end if;

  select * into event_row from public.workforce_strike_events e
  where e.workspace_id = p_workspace_id and e.id = p_strike_id for update;
  if auth.uid() is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if not found then return jsonb_build_object('status', 'not_permitted'); end if;

  -- Recheck replay after acquiring the strike serialization row.
  select * into prior from public.workforce_strike_corrections c
  where c.workspace_id = p_workspace_id and c.idempotency_key = p_idempotency_key;
  if found then
    if prior.request_hash <> request_hash then
      return jsonb_build_object('status', 'idempotency_conflict');
    end if;
    return jsonb_build_object(
      'status', 'ok', 'correction_id', prior.id, 'audit_ref', prior.audit_ref, 'replayed', true
    );
  end if;

  select coalesce(max(c.correction_no) filter (where c.correction_kind = 'void'), 0),
    coalesce(max(c.correction_no) filter (where c.correction_kind = 'reinstate'), 0),
    coalesce((array_agg(c.target_trainer_user_id order by c.correction_no desc)
      filter (where c.correction_kind = 'reattribute'))[1], event_row.trainer_user_id)
    into latest_void, latest_reinstate, current_trainer
  from public.workforce_strike_corrections c
  where c.workspace_id = p_workspace_id and c.strike_id = p_strike_id;
  if p_operation = 'reinstate' and latest_void <= latest_reinstate then
    return jsonb_build_object('status', 'invalid_correction');
  end if;
  if p_operation = 'reattribute' then
    if p_target_trainer_user_id = current_trainer or not exists (
      select 1 from public.staff_profiles sp
      join public.workspace_memberships m on m.user_id = sp.user_id
      where sp.user_id = p_target_trainer_user_id
        and sp.role = 'trainer'::public.staff_role
        and m.workspace_id = p_workspace_id and m.user_id = p_target_trainer_user_id
        and m.granted_at <= event_row.breach_at
        and (m.revoked_at is null or m.revoked_at > event_row.breach_at)
    ) then
      return jsonb_build_object('status', 'invalid_target');
    end if;
  end if;
  select coalesce(max(c.correction_no), 0) + 1 into next_no
  from public.workforce_strike_corrections c
  where c.workspace_id = p_workspace_id and c.strike_id = p_strike_id;
  audit_reference := gen_random_uuid();
  insert into public.workforce_strike_corrections(
    workspace_id, strike_id, correction_no, correction_kind, target_trainer_user_id,
    actor_user_id, reason_code, idempotency_key, request_hash, audit_ref
  ) values (
    p_workspace_id, p_strike_id, next_no, p_operation, p_target_trainer_user_id,
    actor, p_reason_code, p_idempotency_key, request_hash, audit_reference
  ) returning id into correction_id;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (actor, 'workforce.strike_corrected', 'workforce_strike_corrections', correction_id,
    p_workspace_id, jsonb_build_object('reference', audit_reference));
  return jsonb_build_object(
    'status', 'ok', 'correction_id', correction_id, 'audit_ref', audit_reference, 'replayed', false
  );
exception
  when check_violation then
    get stacked diagnostics violation_constraint = constraint_name;
    if violation_constraint = 'workforce_strike_corrections_reason_code_check' then
      raise exception 'invalid_reason_code' using errcode = '22023';
    end if;
    raise;
end
$$;
alter function public.correct_workforce_strike(uuid, uuid, text, uuid, text, uuid) owner to postgres;
revoke all on function public.correct_workforce_strike(uuid, uuid, text, uuid, text, uuid) from public, anon, service_role;
grant execute on function public.correct_workforce_strike(uuid, uuid, text, uuid, text, uuid) to authenticated;
