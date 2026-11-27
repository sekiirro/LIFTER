-- T022/T023: reverse the durable Sales fact and persist full-refund PO review.

create table public.p7_refund_fault_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  acquisition_key uuid not null,
  purchase_id uuid not null,
  state text not null default 'open' check (state in ('open','resolved')),
  opened_at timestamptz not null default clock_timestamp() check (isfinite(opened_at)),
  unique (workspace_id,id),
  unique (workspace_id,acquisition_key),
  foreign key (workspace_id,client_id) references public.clients(workspace_id,id) on delete cascade,
  foreign key (workspace_id,purchase_id,client_id)
    references public.subscriptions(workspace_id,id,client_id) on delete cascade
);
alter table public.p7_refund_fault_reviews owner to postgres;
alter table public.p7_refund_fault_reviews enable row level security;
alter table public.p7_refund_fault_reviews force row level security;
revoke all on public.p7_refund_fault_reviews from public,anon,authenticated,service_role;

create table public.p7_refund_fault_review_resolutions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  review_id uuid not null,
  staff_fault boolean not null,
  staff_deductions jsonb not null check (jsonb_typeof(staff_deductions)='array'),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  request_key uuid not null,
  canonical_args_hash bytea not null check (octet_length(canonical_args_hash)=32),
  result_receipt jsonb not null check (jsonb_typeof(result_receipt)='object'),
  resolved_at timestamptz not null default clock_timestamp() check (isfinite(resolved_at)),
  unique (workspace_id,id),
  unique (workspace_id,review_id),
  unique (workspace_id,request_key),
  foreign key (workspace_id,review_id)
    references public.p7_refund_fault_reviews(workspace_id,id) on delete cascade
);
alter table public.p7_refund_fault_review_resolutions owner to postgres;
alter table public.p7_refund_fault_review_resolutions enable row level security;
alter table public.p7_refund_fault_review_resolutions force row level security;
revoke all on public.p7_refund_fault_review_resolutions from public,anon,authenticated,service_role;

create function app_private.p7_guard_refund_review_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='DELETE' and app_private.retention_purge_context_allows(tg_relid,'DELETE') then
    return old;
  end if;
  if tg_op='UPDATE' and tg_table_name='p7_refund_fault_reviews' then
    if old.state='open' and new.state='resolved'
      and (to_jsonb(new)-'state')=(to_jsonb(old)-'state')
      and exists(select 1 from public.p7_refund_fault_review_resolutions x
        where x.workspace_id=old.workspace_id and x.review_id=old.id) then
      return new;
    end if;
  end if;
  raise exception 'p7_refund_review_immutable' using errcode='23514';
end
$$;
alter function app_private.p7_guard_refund_review_mutation() owner to postgres;
revoke all on function app_private.p7_guard_refund_review_mutation()
  from public,anon,authenticated,service_role;
create trigger p7_refund_fault_reviews_immutable
  before update or delete on public.p7_refund_fault_reviews
  for each row execute function app_private.p7_guard_refund_review_mutation();
create trigger p7_refund_fault_review_resolutions_immutable
  before update or delete on public.p7_refund_fault_review_resolutions
  for each row execute function app_private.p7_guard_refund_review_mutation();

create function app_private.p7_reject_refund_review_truncate()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'p7_refund_review_immutable' using errcode='23514';
end
$$;
alter function app_private.p7_reject_refund_review_truncate() owner to postgres;
revoke all on function app_private.p7_reject_refund_review_truncate()
  from public,anon,authenticated,service_role;
create trigger p7_refund_fault_reviews_no_truncate
  before truncate on public.p7_refund_fault_reviews
  for each statement execute function app_private.p7_reject_refund_review_truncate();
create trigger p7_refund_fault_review_resolutions_no_truncate
  before truncate on public.p7_refund_fault_review_resolutions
  for each statement execute function app_private.p7_reject_refund_review_truncate();

insert into app_private.retention_purge_allowlist(table_oid,can_delete,can_update,traverse)
values
  ('public.p7_refund_fault_reviews'::regclass,true,false,true),
  ('public.p7_refund_fault_review_resolutions'::regclass,true,false,true)
on conflict (table_oid) do update set can_delete=excluded.can_delete,
  can_update=excluded.can_update,traverse=excluded.traverse;

create or replace function app_private.p7_retention_has_open_dispute(
  p_workspace_id uuid,p_client_id uuid
) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.p7_refund_fault_reviews r
    where r.workspace_id=p_workspace_id and r.client_id=p_client_id and r.state='open')
$$;
alter function app_private.p7_retention_has_open_dispute(uuid,uuid) owner to postgres;
revoke all on function app_private.p7_retention_has_open_dispute(uuid,uuid)
  from public,anon,authenticated,service_role;
comment on function app_private.p7_retention_has_open_dispute(uuid,uuid) is
  'F26 hold extension: an open P7 follow-up dispute or full-refund staff-fault review pauses purge of tied client records.';

create function public.p7_list_open_refund_fault_reviews(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not app_private.is_platform_owner()
    or not app_private.has_workspace_access(p_workspace_id,null) then
    return jsonb_build_object('status','not_permitted');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'review_id',r.id,'acquisition_key',r.acquisition_key,
    'purchase_id',r.purchase_id,'opened_at',r.opened_at
  ) order by r.opened_at,r.id),'[]'::jsonb) into result
  from public.p7_refund_fault_reviews r
  where r.workspace_id=p_workspace_id and r.state='open';
  return jsonb_build_object('status','ok','reviews',result);
end
$$;
alter function public.p7_list_open_refund_fault_reviews(uuid) owner to postgres;
revoke all on function public.p7_list_open_refund_fault_reviews(uuid) from public,anon,service_role;
grant execute on function public.p7_list_open_refund_fault_reviews(uuid) to authenticated;

create function public.p7_resolve_refund_fault_review(request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid; ws uuid; review_id uuid; request_id uuid; expected_revision integer;
  staff_fault_value boolean; deductions jsonb; review_row public.p7_refund_fault_reviews%rowtype;
  prior public.p7_refund_fault_review_resolutions%rowtype; item jsonb; target uuid;
  points_value numeric(10,2); period date; resolution_id uuid; binding bytea;
  canonical jsonb; receipt jsonb; deduction_refs jsonb := '[]'::jsonb; entry_id uuid;
begin
  actor:=auth.uid();
  if actor is null or not app_private.is_platform_owner() then
    return jsonb_build_object('status','not_permitted');
  end if;
  if jsonb_typeof(request) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(request))<>6
    or exists(select 1 from jsonb_object_keys(request) k where k not in
      ('workspace_id','review_id','request_key','expected_revision','staff_fault','staff_deductions'))
    or jsonb_typeof(request->'workspace_id') is distinct from 'string'
    or jsonb_typeof(request->'review_id') is distinct from 'string'
    or jsonb_typeof(request->'request_key') is distinct from 'string'
    or jsonb_typeof(request->'expected_revision') is distinct from 'number'
    or jsonb_typeof(request->'staff_fault') is distinct from 'boolean'
    or jsonb_typeof(request->'staff_deductions') is distinct from 'array'
    or (request->>'workspace_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (request->>'review_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (request->>'request_key') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (request->>'expected_revision') !~ '^(0|[1-9][0-9]{0,8})$' then
    return jsonb_build_object('status','invalid_input');
  end if;
  ws:=(request->>'workspace_id')::uuid;
  review_id:=(request->>'review_id')::uuid;
  request_id:=(request->>'request_key')::uuid;
  expected_revision:=(request->>'expected_revision')::integer;
  staff_fault_value:=(request->>'staff_fault')::boolean;
  deductions:=request->'staff_deductions';
  if not app_private.has_workspace_access(ws,null) then
    return jsonb_build_object('status','not_permitted');
  end if;
  if exists(select 1 from jsonb_array_elements(deductions) d
    where jsonb_typeof(d) is distinct from 'object') then
    return jsonb_build_object('status','invalid_input');
  end if;
  if exists(select 1 from jsonb_array_elements(deductions) d
    where (select count(*) from jsonb_object_keys(d))<>2
      or jsonb_typeof(d->'staff_user_id') is distinct from 'string'
      or jsonb_typeof(d->'points') is distinct from 'string'
      or (d->>'staff_user_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (d->>'points') !~ '^-(0\.(0[1-9]|[1-9][0-9])|[1-9][0-9]{0,7}\.[0-9]{2})$')
    or exists(select 1 from jsonb_array_elements(deductions) d group by d->>'staff_user_id' having count(*)>1)
    or (not staff_fault_value and jsonb_array_length(deductions)<>0) then
    return jsonb_build_object('status','invalid_input');
  end if;

  canonical:=jsonb_build_object('workspace_id',ws,'review_id',review_id,
    'expected_revision',expected_revision,'staff_fault',staff_fault_value,
    'staff_deductions',deductions);
  binding:=extensions.digest(convert_to(canonical::text,'UTF8'),'sha256');
  select * into prior from public.p7_refund_fault_review_resolutions r
    where r.workspace_id=ws and r.request_key=request_id;
  if found then
    if prior.review_id<>review_id or prior.canonical_args_hash is distinct from binding then
      return jsonb_build_object('status','key_conflict');
    end if;
    return prior.result_receipt;
  end if;

  select * into review_row from public.p7_refund_fault_reviews r
    where r.workspace_id=ws and r.id=review_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into prior from public.p7_refund_fault_review_resolutions r
    where r.workspace_id=ws and r.request_key=request_id;
  if found then
    if prior.review_id<>review_id or prior.canonical_args_hash is distinct from binding then
      return jsonb_build_object('status','key_conflict');
    end if;
    return prior.result_receipt;
  end if;
  if review_row.state<>'open' or expected_revision<>0 then
    return jsonb_build_object('status','stale_state');
  end if;
  for item in select value from jsonb_array_elements(deductions) loop
    target:=(item->>'staff_user_id')::uuid;
    points_value:=(item->>'points')::numeric;
    if points_value=0 or not exists(
      select 1 from public.staff_profiles p
      join public.workspace_memberships m on m.user_id=p.user_id
      where p.user_id=target and p.role in ('trainer'::public.staff_role,'sales'::public.staff_role)
        and m.workspace_id=ws
    ) then
      return jsonb_build_object('status','invalid_input');
    end if;
  end loop;

  resolution_id:=gen_random_uuid();
  period:=app_private.p7_month_for_trigger(clock_timestamp());
  perform app_private.p7_lock_period(ws,period);
  for item in select value from jsonb_array_elements(deductions) loop
    target:=(item->>'staff_user_id')::uuid;
    points_value:=(item->>'points')::numeric;
    insert into public.p7_adjustment_entries(workspace_id,staff_user_id,points,
      effective_month,original_month,source_key,source_hash,reason_code)
    values(ws,target,points_value,period,period,gen_random_uuid(),
      encode(extensions.digest(convert_to(resolution_id::text||'|'||target::text||'|'||points_value::text,'UTF8'),'sha256'),'hex'),
      'refund_staff_fault') returning id into entry_id;
    deduction_refs:=deduction_refs||jsonb_build_array(jsonb_build_object(
      'entry_id',entry_id,'staff_user_id',target,'points',points_value::text));
  end loop;

  receipt:=jsonb_build_object('status','ok','review_id',review_id,
    'staff_fault',staff_fault_value,'deductions',deduction_refs);
  insert into public.p7_refund_fault_review_resolutions(workspace_id,review_id,
    staff_fault,staff_deductions,actor_user_id,request_key,canonical_args_hash,result_receipt)
  values(ws,review_id,staff_fault_value,deductions,actor,request_id,binding,receipt);
  update public.p7_refund_fault_reviews set state='resolved'
    where workspace_id=ws and id=review_id;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
  values(actor,'workforce.refund_fault_review_resolved','p7_refund_fault_reviews',review_id,
    ws,jsonb_build_object('reference',resolution_id::text));
  return receipt;
exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
  return jsonb_build_object('status','invalid_input');
when others then
  return jsonb_build_object('status','unavailable');
end
$$;
alter function public.p7_resolve_refund_fault_review(jsonb) owner to postgres;
revoke all on function public.p7_resolve_refund_fault_review(jsonb) from public,anon,service_role;
grant execute on function public.p7_resolve_refund_fault_review(jsonb) to authenticated;

-- Patch the F13 implementation in place, preserving its refund rules, receipt,
-- source locks, revision checks, and allocation loop. The full-refund decision
-- reuses F13's already-computed refundable balance (`available`).
do $patch_f13$
declare definition text; declaration text; full_marker text; effects_marker text;
begin
  definition:=pg_catalog.pg_get_functiondef('public.record_refund(jsonb)'::regprocedure);
  declaration:='commission_delta numeric; revision_count integer; receipt jsonb; result jsonb;';
  full_marker:='if requested::numeric>available then return jsonb_build_object(''status'',''invalid_input''); end if;';
  effects_marker:='set constraints all immediate;'||chr(10)||'  return result;';
  if pg_catalog.strpos(definition,declaration)=0 or pg_catalog.strpos(definition,full_marker)=0
    or pg_catalog.strpos(definition,effects_marker)=0 then
    raise exception 'F13 record_refund source shape changed; reviewed patch required';
  end if;
  definition:=pg_catalog.replace(definition,declaration,
    declaration||' full_refund boolean := false; acquisition record; period date; reversal_id uuid; review_id uuid;');
  definition:=pg_catalog.replace(definition,full_marker,
    full_marker||chr(10)||'  full_refund:=requested::numeric=available;');
  definition:=pg_catalog.replace(definition,effects_marker,
    'select u.id,u.recipient_sales_user_id,e.effective_month into acquisition from public.sales_productivity_units u'||chr(10)||
    '    join app_private.registration_approval_events a on a.workspace_id=u.workspace_id'||chr(10)||
    '      and a.id=u.approval_event_id and a.subscription_id='||'sid'||chr(10)||
    '    join public.p7_earned_points e on e.workspace_id=u.workspace_id and e.source_key=u.id'||chr(10)||
    '    where u.workspace_id='||'ws'||' and a.client_id='||'cid'||';'||chr(10)||
    '  if found then'||chr(10)||
    '    period:=app_private.p7_month_for_trigger(sampled);'||chr(10)||
    '    perform app_private.p7_lock_period(ws,period);'||chr(10)||
    '    insert into public.p7_adjustment_entries(workspace_id,staff_user_id,points,effective_month,original_month,source_key,source_hash,reason_code)'||chr(10)||
    '      values(ws,acquisition.recipient_sales_user_id,-1.00,period,acquisition.effective_month,acquisition.id,'||chr(10)||
    '        encode(extensions.digest(convert_to(ws::text||''|''||acquisition.id::text||''|-1.00|p7-sales-refund-v1'',''UTF8''),''sha256''),''hex''),''sales_acquisition_refund'')'||chr(10)||
    '      on conflict(workspace_id,source_key) do nothing returning id into reversal_id;'||chr(10)||
    '    if reversal_id is not null then'||chr(10)||
    '      insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)'||chr(10)||
    '        values(auth.uid(),''workforce.sales_acquisition_reversed'',''p7_adjustment_entries'',reversal_id,ws,jsonb_build_object(''reference'',acquisition.id::text));'||chr(10)||
    '    end if;'||chr(10)||
    '    if full_refund then'||chr(10)||
    '      insert into public.p7_refund_fault_reviews(workspace_id,client_id,acquisition_key,purchase_id)'||chr(10)||
    '        values(ws,cid,acquisition.id,sid) on conflict(workspace_id,acquisition_key) do nothing returning id into review_id;'||chr(10)||
    '      if review_id is not null then'||chr(10)||
    '        insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)'||chr(10)||
    '          values(auth.uid(),''workforce.refund_fault_review_opened'',''p7_refund_fault_reviews'',review_id,ws,jsonb_build_object(''reference'',acquisition.id::text));'||chr(10)||
    '      end if;'||chr(10)||
    '    end if;'||chr(10)||
    '  end if;'||chr(10)||effects_marker);
  execute definition;
end
$patch_f13$;

comment on table public.p7_refund_fault_reviews is
  'Purgeable PO-only review opened by a full F13 acquisition refund; acquisition_key is an opaque F10 source unit id.';
comment on table public.p7_refund_fault_review_resolutions is
  'Immutable PO answer and individual signed point deductions for one full-refund review.';
