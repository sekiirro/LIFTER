-- S73 T013 backend: PO-only append-only manual point changes.
-- S73-PO-4 item 1 (A): manual changes require a trimmed free-text reason,
-- 1..500 characters, stored on the ledger row. Automatic reason codes and the
-- separate strike/plan-delay reason-code contracts remain unchanged.

alter table public.p7_adjustment_entries
  alter column reason_code drop not null,
  drop constraint p7_adjustment_entries_reason_code_check,
  add column reason text,
  add column actor_user_id uuid references auth.users(id) on delete restrict,
  add column operation text,
  add column idempotency_key uuid,
  add column original_entry_id uuid,
  add column original_entry_kind text,
  add constraint p7_adjustment_entries_reason_code_check
    check (reason_code is null or length(reason_code) between 1 and 80),
  add constraint p7_adjustment_entries_reason_check
    check (reason is null or (reason = pg_catalog.btrim(reason, E' \t\n\r') and length(reason) between 1 and 500)),
  add constraint p7_adjustment_entries_reason_presence_check
    check ((reason_code is not null) <> (reason is not null)),
  add constraint p7_adjustment_entries_operation_check
    check (operation is null or operation in ('add','deduct','correct','reattribute')),
  add constraint p7_adjustment_entries_original_entry_kind_check
    check (original_entry_kind is null or original_entry_kind in ('earned','adjustment')),
  add constraint p7_adjustment_entries_manual_lineage_check
    check (case
      when operation in ('correct','reattribute')
        then original_entry_id is not null and original_entry_kind is not null
      else original_entry_id is null and original_entry_kind is null
    end),
  add constraint p7_adjustment_entries_manual_actor_check
    check ((operation is null) = (actor_user_id is null));

create index p7_adjustment_entries_original_entry_idx
  on public.p7_adjustment_entries(workspace_id, original_entry_id)
  where original_entry_id is not null;
create unique index p7_adjustment_entries_manual_idempotency_idx
  on public.p7_adjustment_entries(workspace_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.p7_adjustment_entries.reason is
  'Required trimmed free-text written reason for manual PO point changes (S73-PO-4 A), 1..500 characters.';
comment on column public.p7_adjustment_entries.actor_user_id is
  'Platform PO actor for manual point changes; null for automatic producers.';
comment on column public.p7_adjustment_entries.original_entry_id is
  'Immutable earned/adjustment row corrected or reattributed by this append-only entry.';

create function public.p7_post_point_adjustment(
  p_workspace_id uuid,
  p_staff_user_id uuid,
  p_operation text,
  p_points text,
  p_effective_month date,
  p_original_entry_kind text,
  p_original_entry_id uuid,
  p_reason text,
  p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  written_reason text := pg_catalog.btrim(coalesce(p_reason,''), E' \t\n\r');
  points_value numeric(10,2);
  request_hash text;
  prior public.p7_adjustment_entries%rowtype;
  original_staff uuid;
  target_period date;
  lineage_month date;
  entry_id uuid;
  routed_month date;
  routed_original date;
begin
  if actor is null or not app_private.is_platform_owner()
    or not app_private.has_workspace_access(p_workspace_id,null) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if written_reason = '' then
    return jsonb_build_object('status','reason_required',
      'message','A reason is required.','message_ar','لازم تكتب السبب.');
  end if;
  if p_workspace_id is null or p_staff_user_id is null or p_idempotency_key is null
    or p_operation not in ('add','deduct','correct')
    or length(written_reason) > 500
    or p_points is null or p_points !~ '^-?(0|[1-9][0-9]{0,7})\.[0-9]{2}$'
    or (p_operation in ('add','deduct') and (
      p_effective_month is null or extract(day from p_effective_month) <> 1
      or p_original_entry_kind is not null or p_original_entry_id is not null))
    or (p_operation = 'correct' and (
      p_effective_month is not null or p_original_entry_kind not in ('earned','adjustment')
      or p_original_entry_id is null)) then
    return jsonb_build_object('status','invalid_input');
  end if;
  points_value := p_points::numeric;
  if points_value = 0
    or (p_operation = 'add' and points_value < 0)
    or (p_operation = 'deduct' and points_value > 0) then
    return jsonb_build_object('status','invalid_input');
  end if;
  if not exists (
    select 1 from public.staff_profiles sp
    join public.workspace_memberships m on m.user_id=sp.user_id
    where sp.user_id=p_staff_user_id and sp.role in ('trainer','sales')
      and m.workspace_id=p_workspace_id and m.revoked_at is null
  ) then
    return jsonb_build_object('status','invalid_target');
  end if;

  request_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object('workspace_id',p_workspace_id,'staff_user_id',p_staff_user_id,
      'operation',p_operation,'points',p_points,'effective_month',p_effective_month,
      'original_entry_kind',p_original_entry_kind,'original_entry_id',p_original_entry_id,
      'reason',written_reason,'actor',actor)::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'p7-point-key:' || p_idempotency_key::text,0));
  if auth.uid() is distinct from actor or not app_private.is_platform_owner()
    or not app_private.has_workspace_access(p_workspace_id,null) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select * into prior from public.p7_adjustment_entries
  where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key;
  if found then
    if prior.source_hash is distinct from request_hash then
      return jsonb_build_object('status','key_conflict');
    end if;
    return jsonb_build_object('status','ok','entry_id',prior.id,
      'operation',prior.operation,'points',prior.points::text,
      'effective_month',prior.effective_month,'original_month',prior.original_month,
      'replayed',true);
  end if;

  if p_operation = 'correct' then
    if p_original_entry_kind = 'earned' then
      select e.staff_user_id,e.effective_month,e.original_month
        into original_staff,target_period,lineage_month
      from public.p7_earned_points e
      where e.workspace_id=p_workspace_id and e.id=p_original_entry_id for update;
    else
      select a.staff_user_id,a.effective_month,a.original_month
        into original_staff,target_period,lineage_month
      from public.p7_adjustment_entries a
      where a.workspace_id=p_workspace_id and a.id=p_original_entry_id for update;
    end if;
    if not found or original_staff is distinct from p_staff_user_id then
      return jsonb_build_object('status','invalid_lineage');
    end if;
    lineage_month := coalesce(lineage_month,target_period);
  else
    target_period := p_effective_month;
    lineage_month := null;
  end if;

  perform app_private.p7_lock_period(p_workspace_id,target_period);
  if auth.uid() is distinct from actor or not app_private.is_platform_owner()
    or not app_private.has_workspace_access(p_workspace_id,null) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.staff_profiles sp
    join public.workspace_memberships m on m.user_id=sp.user_id
    where sp.user_id=p_staff_user_id and sp.role in ('trainer','sales')
      and m.workspace_id=p_workspace_id and m.revoked_at is null
  ) then
    return jsonb_build_object('status','invalid_target');
  end if;
  insert into public.p7_adjustment_entries(workspace_id,staff_user_id,points,
    effective_month,original_month,source_key,source_hash,reason,actor_user_id,
    operation,idempotency_key,original_entry_id,original_entry_kind)
  values(p_workspace_id,p_staff_user_id,points_value,target_period,lineage_month,
    p_idempotency_key,request_hash,written_reason,actor,p_operation,p_idempotency_key,
    p_original_entry_id,p_original_entry_kind)
  returning id,effective_month,original_month into entry_id,routed_month,routed_original;
  if auth.uid() is distinct from actor or not app_private.is_platform_owner()
    or not app_private.has_workspace_access(p_workspace_id,null) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
  values(actor,'workforce.point_adjustment_recorded','p7_adjustment_entries',entry_id,
    p_workspace_id,jsonb_build_object('reference',entry_id::text));
  return jsonb_build_object('status','ok','entry_id',entry_id,'operation',p_operation,
    'points',points_value::text,'effective_month',routed_month,
    'original_month',routed_original,'replayed',false);
end
$$;
alter function public.p7_post_point_adjustment(uuid,uuid,text,text,date,text,uuid,text,uuid) owner to postgres;
revoke all on function public.p7_post_point_adjustment(uuid,uuid,text,text,date,text,uuid,text,uuid)
  from public,anon,service_role;
grant execute on function public.p7_post_point_adjustment(uuid,uuid,text,text,date,text,uuid,text,uuid)
  to authenticated;

create function public.p7_reattribute_point_entry(
  p_workspace_id uuid,
  p_original_entry_kind text,
  p_original_entry_id uuid,
  p_target_staff_user_id uuid,
  p_reason text,
  p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  written_reason text := pg_catalog.btrim(coalesce(p_reason,''), E' \t\n\r');
  request_hash text;
  reverse_hex text;
  target_hex text;
  reverse_key uuid;
  target_key uuid;
  prior public.p7_adjustment_entries%rowtype;
  replacement public.p7_adjustment_entries%rowtype;
  original_staff uuid;
  original_points numeric(10,2);
  original_period date;
  lineage_month date;
  reversal_id uuid;
  replacement_id uuid;
  routed_month date;
  routed_original date;
begin
  if actor is null or not app_private.is_platform_owner()
    or not app_private.has_workspace_access(p_workspace_id,null) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if written_reason = '' then
    return jsonb_build_object('status','reason_required',
      'message','A reason is required.','message_ar','لازم تكتب السبب.');
  end if;
  if p_workspace_id is null or p_original_entry_id is null or p_target_staff_user_id is null
    or p_idempotency_key is null or length(written_reason) > 500
    or p_original_entry_kind not in ('earned','adjustment') then
    return jsonb_build_object('status','invalid_input');
  end if;
  if not exists (
    select 1 from public.staff_profiles sp
    join public.workspace_memberships m on m.user_id=sp.user_id
    where sp.user_id=p_target_staff_user_id and sp.role in ('trainer','sales')
      and m.workspace_id=p_workspace_id and m.revoked_at is null
  ) then
    return jsonb_build_object('status','invalid_target');
  end if;

  request_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object('workspace_id',p_workspace_id,'original_entry_kind',p_original_entry_kind,
      'original_entry_id',p_original_entry_id,'target_staff_user_id',p_target_staff_user_id,
      'reason',written_reason,'actor',actor)::text,'UTF8'),'sha256'),'hex');
  reverse_hex := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    p_idempotency_key::text || ':reattribute:reverse','UTF8'),'sha256'),'hex');
  target_hex := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    p_idempotency_key::text || ':reattribute:target','UTF8'),'sha256'),'hex');
  reverse_key := (pg_catalog.substr(reverse_hex,1,8)||'-'||pg_catalog.substr(reverse_hex,9,4)||'-'||
    pg_catalog.substr(reverse_hex,13,4)||'-'||pg_catalog.substr(reverse_hex,17,4)||'-'||
    pg_catalog.substr(reverse_hex,21,12))::uuid;
  target_key := (pg_catalog.substr(target_hex,1,8)||'-'||pg_catalog.substr(target_hex,9,4)||'-'||
    pg_catalog.substr(target_hex,13,4)||'-'||pg_catalog.substr(target_hex,17,4)||'-'||
    pg_catalog.substr(target_hex,21,12))::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'p7-point-key:' || p_idempotency_key::text,0));
  if auth.uid() is distinct from actor or not app_private.is_platform_owner()
    or not app_private.has_workspace_access(p_workspace_id,null) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select * into prior from public.p7_adjustment_entries
  where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key;
  if found then
    if prior.source_hash is distinct from request_hash then
      return jsonb_build_object('status','key_conflict');
    end if;
    select * into replacement from public.p7_adjustment_entries
    where workspace_id=p_workspace_id and source_key=target_key;
    if not found then raise exception 'p7_reattribution_receipt_incomplete' using errcode='40001'; end if;
    return jsonb_build_object('status','ok','original_entry_id',p_original_entry_id,
      'reversal_id',prior.id,'replacement_id',replacement.id,
      'effective_month',prior.effective_month,'original_month',prior.original_month,
      'replayed',true);
  end if;

  if p_original_entry_kind = 'earned' then
    select e.staff_user_id,e.points,e.effective_month,e.original_month
      into original_staff,original_points,original_period,lineage_month
    from public.p7_earned_points e
    where e.workspace_id=p_workspace_id and e.id=p_original_entry_id for update;
  else
    select a.staff_user_id,a.points,a.effective_month,a.original_month
      into original_staff,original_points,original_period,lineage_month
    from public.p7_adjustment_entries a
    where a.workspace_id=p_workspace_id and a.id=p_original_entry_id for update;
  end if;
  if not found or original_staff = p_target_staff_user_id then
    return jsonb_build_object('status','invalid_lineage');
  end if;
  lineage_month := coalesce(lineage_month,original_period);
  perform app_private.p7_lock_period(p_workspace_id,original_period);
  if auth.uid() is distinct from actor or not app_private.is_platform_owner()
    or not app_private.has_workspace_access(p_workspace_id,null) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.staff_profiles sp
    join public.workspace_memberships m on m.user_id=sp.user_id
    where sp.user_id=p_target_staff_user_id and sp.role in ('trainer','sales')
      and m.workspace_id=p_workspace_id and m.revoked_at is null
  ) then
    return jsonb_build_object('status','invalid_target');
  end if;

  insert into public.p7_adjustment_entries(workspace_id,staff_user_id,points,
    effective_month,original_month,source_key,source_hash,reason,actor_user_id,
    operation,idempotency_key,original_entry_id,original_entry_kind)
  values(p_workspace_id,original_staff,-original_points,original_period,lineage_month,
    reverse_key,request_hash,written_reason,actor,'reattribute',p_idempotency_key,
    p_original_entry_id,p_original_entry_kind)
  returning id,effective_month,original_month into reversal_id,routed_month,routed_original;
  insert into public.p7_adjustment_entries(workspace_id,staff_user_id,points,
    effective_month,original_month,source_key,source_hash,reason,actor_user_id,
    operation,idempotency_key,original_entry_id,original_entry_kind)
  values(p_workspace_id,p_target_staff_user_id,original_points,original_period,lineage_month,
    target_key,request_hash,written_reason,actor,'reattribute',null,
    p_original_entry_id,p_original_entry_kind)
  returning id into replacement_id;
  if auth.uid() is distinct from actor or not app_private.is_platform_owner()
    or not app_private.has_workspace_access(p_workspace_id,null) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
  values(actor,'workforce.points_reattributed','p7_adjustment_entries',reversal_id,
    p_workspace_id,jsonb_build_object('reference',reversal_id::text));
  return jsonb_build_object('status','ok','original_entry_id',p_original_entry_id,
    'reversal_id',reversal_id,'replacement_id',replacement_id,
    'effective_month',routed_month,'original_month',routed_original,'replayed',false);
end
$$;
alter function public.p7_reattribute_point_entry(uuid,text,uuid,uuid,text,uuid) owner to postgres;
revoke all on function public.p7_reattribute_point_entry(uuid,text,uuid,uuid,text,uuid)
  from public,anon,service_role;
grant execute on function public.p7_reattribute_point_entry(uuid,text,uuid,uuid,text,uuid)
  to authenticated;
