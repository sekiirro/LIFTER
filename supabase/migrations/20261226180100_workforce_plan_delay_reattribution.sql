-- T009: append PO-only plan-delay reattributions through the shared P7 period fence.
create table public.workforce_plan_delay_corrections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  event_id uuid not null,
  correction_no integer not null check (correction_no > 0),
  prior_trainer_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  target_trainer_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  audit_ref uuid not null default gen_random_uuid(),
  recorded_at timestamptz not null default clock_timestamp() check (isfinite(recorded_at)),
  unique (workspace_id, event_id, correction_no),
  unique (workspace_id, idempotency_key),
  unique (workspace_id, audit_ref),
  foreign key (workspace_id, event_id)
    references public.workforce_plan_delay_events(workspace_id, id) on delete restrict
);
alter table public.workforce_plan_delay_corrections owner to postgres;
alter table public.workforce_plan_delay_corrections enable row level security;
alter table public.workforce_plan_delay_corrections force row level security;
revoke all on public.workforce_plan_delay_corrections from public, anon, authenticated, service_role;

create trigger workforce_plan_delay_corrections_immutable
  before update or delete on public.workforce_plan_delay_corrections
  for each row execute function app_private.guard_workforce_plan_delay_immutable();
create trigger workforce_plan_delay_corrections_no_truncate
  before truncate on public.workforce_plan_delay_corrections
  for each statement execute function app_private.guard_workforce_plan_delay_immutable();

create function public.reattribute_workforce_plan_delay(
  p_workspace_id uuid,
  p_event_id uuid,
  p_target_trainer_user_id uuid,
  p_reason text,
  p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  event_row public.workforce_plan_delay_events%rowtype;
  prior_target uuid;
  correction_id uuid;
  correction_no integer;
  prior public.workforce_plan_delay_corrections%rowtype;
  audit_reference uuid;
  request_hash text;
  effect_hex text;
  reverse_key uuid;
  target_key uuid;
begin
  if actor is null or not app_private.is_platform_owner() then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  if p_workspace_id is null or p_event_id is null or p_target_trainer_user_id is null
    or p_idempotency_key is null or p_reason is null or length(btrim(p_reason)) not between 1 and 500
    or not exists (
      select 1 from public.workspace_memberships m
      join public.staff_profiles sp on sp.user_id=m.user_id
      where m.workspace_id=p_workspace_id and m.user_id=p_target_trainer_user_id
        and m.revoked_at is null and sp.role='trainer'
    ) then
    return jsonb_build_object('status', 'invalid_input');
  end if;

  request_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    p_workspace_id::text||':'||p_event_id::text||':'||p_target_trainer_user_id::text||':'||p_reason,'UTF8'),'sha256'),'hex');
  select * into prior from public.workforce_plan_delay_corrections
    where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key;
  if found then
    if prior.request_hash <> request_hash then return jsonb_build_object('status','invalid_replay'); end if;
    return jsonb_build_object('status','ok','correction_id',prior.id,'audit_ref',prior.audit_ref,'replayed',true);
  end if;

  select * into event_row from public.workforce_plan_delay_events
    where workspace_id=p_workspace_id and id=p_event_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if actor is distinct from auth.uid() or not app_private.is_platform_owner()
    or not app_private.has_workspace_access(p_workspace_id,null)
    or not exists (
      select 1 from public.workspace_memberships m
      join public.staff_profiles sp on sp.user_id=m.user_id
      where m.workspace_id=p_workspace_id and m.user_id=p_target_trainer_user_id
        and m.revoked_at is null and sp.role='trainer'
    ) then
    return jsonb_build_object('status','not_permitted');
  end if;
  perform app_private.p7_lock_period(p_workspace_id, app_private.p7_month_for_trigger(event_row.breach_at));
  if actor is distinct from auth.uid() or not app_private.is_platform_owner()
    or not app_private.has_workspace_access(p_workspace_id,null)
    or not exists (
      select 1 from public.workspace_memberships m
      join public.staff_profiles sp on sp.user_id=m.user_id
      where m.workspace_id=p_workspace_id and m.user_id=p_target_trainer_user_id
        and m.revoked_at is null and sp.role='trainer'
    ) then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  select * into prior from public.workforce_plan_delay_corrections
    where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key;
  if found then
    if prior.request_hash <> request_hash then return jsonb_build_object('status','invalid_replay'); end if;
    return jsonb_build_object('status','ok','correction_id',prior.id,'audit_ref',prior.audit_ref,'replayed',true);
  end if;

  select c.target_trainer_user_id into prior_target
  from public.workforce_plan_delay_corrections c
  where c.workspace_id=p_workspace_id and c.event_id=p_event_id
  order by c.correction_no desc limit 1;
  prior_target := coalesce(prior_target,event_row.trainer_user_id);
  select coalesce(max(c.correction_no),0)+1 into correction_no
  from public.workforce_plan_delay_corrections c where c.workspace_id=p_workspace_id and c.event_id=p_event_id;

  insert into public.workforce_plan_delay_corrections(
    workspace_id,event_id,correction_no,prior_trainer_user_id,target_trainer_user_id,
    actor_user_id,reason,idempotency_key,request_hash
  ) values (
    p_workspace_id,p_event_id,correction_no,prior_target,p_target_trainer_user_id,
    actor,p_reason,p_idempotency_key,request_hash
  ) returning id,audit_ref into correction_id,audit_reference;

  effect_hex := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(correction_id::text||':reverse','UTF8'),'sha256'),'hex');
  reverse_key := (pg_catalog.substr(effect_hex,1,8)||'-'||pg_catalog.substr(effect_hex,9,4)||'-'||
    pg_catalog.substr(effect_hex,13,4)||'-'||pg_catalog.substr(effect_hex,17,4)||'-'||
    pg_catalog.substr(effect_hex,21,12))::uuid;
  effect_hex := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(correction_id::text||':target','UTF8'),'sha256'),'hex');
  target_key := (pg_catalog.substr(effect_hex,1,8)||'-'||pg_catalog.substr(effect_hex,9,4)||'-'||
    pg_catalog.substr(effect_hex,13,4)||'-'||pg_catalog.substr(effect_hex,17,4)||'-'||
    pg_catalog.substr(effect_hex,21,12))::uuid;

  insert into public.p7_adjustment_entries(workspace_id,staff_user_id,points,effective_month,original_month,
    source_key,source_hash,reason_code)
  values (p_workspace_id,prior_target,1.00,app_private.p7_month_for_trigger(event_row.breach_at),
    app_private.p7_month_for_trigger(event_row.breach_at),reverse_key,request_hash,'plan_delay');
  insert into public.p7_adjustment_entries(workspace_id,staff_user_id,points,effective_month,original_month,
    source_key,source_hash,reason_code)
  values (p_workspace_id,p_target_trainer_user_id,-1.00,app_private.p7_month_for_trigger(event_row.breach_at),
    app_private.p7_month_for_trigger(event_row.breach_at),target_key,request_hash,'plan_delay');
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
  values(actor,'workforce.plan_delay_reattributed','workforce_plan_delay_corrections',correction_id,p_workspace_id,
    pg_catalog.jsonb_build_object('reference',audit_reference));
  return jsonb_build_object('status','ok','correction_id',correction_id,'audit_ref',audit_reference,'replayed',false);
end
$$;
alter function public.reattribute_workforce_plan_delay(uuid,uuid,uuid,text,uuid) owner to postgres;
revoke all on function public.reattribute_workforce_plan_delay(uuid,uuid,uuid,text,uuid) from public, anon, service_role;
grant execute on function public.reattribute_workforce_plan_delay(uuid,uuid,uuid,text,uuid) to authenticated;

comment on table public.workforce_plan_delay_corrections is
  'Append-only PO reattribution history; point effects are appended to the shared signed adjustment ledger.';
