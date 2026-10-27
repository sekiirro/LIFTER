-- P1-F10. Synthetic/local rate placeholder only; no catalog or business policy seed.
do $$ begin
  if not exists(select 1 from pg_extension where extname='pgcrypto') then
    create extension pgcrypto with schema extensions;
  elsif not exists(select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto' and n.nspname='extensions') then
    raise exception 'pgcrypto schema mismatch';
  end if;
end $$;

create table public.registration_links (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  id uuid primary key default gen_random_uuid(),
  package_version_id uuid not null,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  opened_at timestamptz,
  consumed_at timestamptz,
  price_minor bigint not null check(price_minor>0),
  currency char(3) not null check(currency ~ '^[A-Z]{3}$'),
  duration_days integer not null check(duration_days>0),
  duration_months smallint,
  commission_rate_bp integer not null check(commission_rate_bp between 0 and 10000),
  unique(workspace_id,id),
  foreign key(workspace_id,package_version_id) references public.package_versions(workspace_id,id) on delete restrict,
  check(expires_at=created_at+interval '24 hours'),
  check((duration_months in (1,3,6,8,12) and duration_days=duration_months*30) or (duration_months is null and duration_days>0))
);
create index registration_links_recent on public.registration_links(workspace_id,created_at desc,id);
create index registration_links_actor_time on public.registration_links(created_by,created_at desc);
create table public.registration_link_installments (
  workspace_id uuid not null,
  link_id uuid not null,
  seq integer not null check(seq>=1),
  amount_minor bigint not null check(amount_minor>0),
  due_offset_days integer not null check(due_offset_days>=0),
  primary key(workspace_id,link_id,seq),
  foreign key(workspace_id,link_id) references public.registration_links(workspace_id,id) on delete restrict
);
alter table public.registration_links enable row level security;
alter table public.registration_links force row level security;
alter table public.registration_link_installments enable row level security;
alter table public.registration_link_installments force row level security;
revoke all on public.registration_links, public.registration_link_installments from public,anon,authenticated,service_role;

create function app_private.registration_link_is_valid(expires_at timestamptz,opened_at timestamptz,consumed_at timestamptz,at_time timestamptz) returns boolean
language sql immutable security definer set search_path='' as $$
  select coalesce(consumed_at is null and at_time < case when opened_at < expires_at then greatest(expires_at,opened_at+interval '30 minutes') else expires_at end,false)
$$;
create function app_private.registration_link_limits() returns table(per_actor integer,win interval)
language sql immutable set search_path='' as $$
  -- ND-F10-3: LOCAL/DEV PLACEHOLDER, NOT PO-APPROVED; PRODUCTION BLOCKER.
  select 20, interval '1 hour'
$$;

create function app_private.guard_registration_link_insert() returns trigger
language plpgsql security definer set search_path='' as $$
declare v public.package_versions%rowtype; o public.package_offers%rowtype;
begin
  if auth.uid() is null or not app_private.has_workspace_access(new.workspace_id,'generate_registration_link') then
    raise exception 'not_permitted' using errcode='42501';
  end if;
  select * into v from public.package_versions where workspace_id=new.workspace_id and id=new.package_version_id;
  if not found then raise exception 'not_permitted' using errcode='42501'; end if;
  select * into o from public.package_offers where workspace_id=new.workspace_id and id=v.offer_id for update;
  if not found or not o.available or o.current_version_id is distinct from new.package_version_id then
    raise exception 'stale_terms' using errcode='22023';
  end if;
  if new.created_by is distinct from auth.uid() or new.created_at is distinct from now()
    or new.expires_at is distinct from now()+interval '24 hours' or new.opened_at is not null or new.consumed_at is not null
    or new.price_minor is distinct from v.price_minor or new.currency is distinct from v.currency
    or new.duration_days is distinct from v.duration_days or new.duration_months is distinct from v.duration_months
    or new.commission_rate_bp is distinct from v.commission_rate_bp then
    raise exception 'invalid_snapshot' using errcode='23514';
  end if;
  return new;
end $$;
create function app_private.guard_registration_link_update() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (to_jsonb(new)-'opened_at'-'consumed_at') is distinct from (to_jsonb(old)-'opened_at'-'consumed_at') then
    raise exception 'immutable' using errcode='23514';
  end if;
  if new.opened_at is not distinct from old.opened_at and new.consumed_at is not distinct from old.consumed_at then
    raise exception 'immutable' using errcode='23514';
  end if;
  if new.opened_at is distinct from old.opened_at then
    if old.opened_at is not null or new.opened_at is null or new.opened_at is distinct from now()
      or old.consumed_at is not null or now()>=old.expires_at or new.consumed_at is distinct from old.consumed_at then
      raise exception 'immutable' using errcode='23514';
    end if;
  end if;
  if new.consumed_at is distinct from old.consumed_at then
    if old.consumed_at is not null or new.consumed_at is null or new.consumed_at is distinct from now()
      or not app_private.registration_link_is_valid(old.expires_at,old.opened_at,old.consumed_at,now()) then
      raise exception 'immutable' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create function app_private.guard_registration_installment_insert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- xmin may also be a live subtransaction ID in integrity probes.
  -- Only transaction IDs exclusively held by this backend belong to this live transaction.
  if not exists(select 1 from public.registration_links l where l.workspace_id=new.workspace_id and l.id=new.link_id
    and l.opened_at is null and l.consumed_at is null and l.xmin::text in (select transactionid::text from pg_catalog.pg_locks where locktype='transactionid' and pid=pg_backend_pid() and mode='ExclusiveLock' and granted)) then
    raise exception 'immutable' using errcode='23514';
  end if;
  return new;
end $$;
create function app_private.validate_registration_link_schedule(ws uuid,link uuid) returns void
language plpgsql security definer set search_path='' as $$
declare n bigint; total numeric; price bigint; bad boolean;
begin
  select l.price_minor into price from public.registration_links l where l.workspace_id=ws and l.id=link;
  select count(*),sum(amount_minor),coalesce(bool_or(seq<>rn or due_offset_days<=previous),false) into n,total,bad
  from (select i.*,row_number() over(order by seq) rn,lag(due_offset_days) over(order by seq) previous
    from public.registration_link_installments i where workspace_id=ws and link_id=link) rows;
  if n>0 and (total<>price or bad) then raise exception 'invalid_schedule' using errcode='23514'; end if;
end $$;
create function app_private.check_registration_link_schedule() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='registration_links' then perform app_private.validate_registration_link_schedule(new.workspace_id,new.id);
  else perform app_private.validate_registration_link_schedule(new.workspace_id,new.link_id); end if;
  return new;
end $$;
create trigger registration_links_insert_guard before insert on public.registration_links for each row execute function app_private.guard_registration_link_insert();
create trigger registration_links_update_guard before update on public.registration_links for each row execute function app_private.guard_registration_link_update();
create trigger registration_installments_insert_guard before insert on public.registration_link_installments for each row execute function app_private.guard_registration_installment_insert();
create trigger registration_link_installments_no_update before update on public.registration_link_installments for each row execute function app_private.audit_events_immutable();
create trigger registration_links_no_delete before delete on public.registration_links for each row execute function app_private.forbid_delete();
create trigger registration_links_no_truncate before truncate on public.registration_links for each statement execute function app_private.forbid_delete();
create trigger registration_link_installments_no_delete before delete on public.registration_link_installments for each row execute function app_private.forbid_delete();
create trigger registration_link_installments_no_truncate before truncate on public.registration_link_installments for each statement execute function app_private.forbid_delete();
create constraint trigger registration_links_schedule after insert on public.registration_links deferrable initially deferred for each row execute function app_private.check_registration_link_schedule();
create constraint trigger registration_installments_schedule after insert on public.registration_link_installments deferrable initially deferred for each row execute function app_private.check_registration_link_schedule();

create function public.issue_registration_link(workspace_id uuid,package_version_id uuid,token_hash text,installments jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v public.package_versions%rowtype; o public.package_offers%rowtype; result uuid;
  item jsonb; position integer:=0; previous integer:=-1; offset_value integer; total numeric:=0;
  limits record;
begin
  -- Authorization precedes parsing/lookup/stale disclosure: no version or availability oracle.
  if auth.uid() is null or workspace_id is null or not app_private.has_workspace_access(workspace_id,'generate_registration_link')
    or not exists(select 1 from public.workspaces w where w.id=issue_registration_link.workspace_id) then
    raise exception 'not_permitted' using errcode='42501';
  end if;
  if installments is not null and not app_private.has_workspace_access(workspace_id,'configure_installment_schedule') then
    raise exception 'not_permitted' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('registration-links:'||auth.uid()::text,0));
  select * into limits from app_private.registration_link_limits();
  if (select count(*) from public.registration_links l where l.created_by=auth.uid() and l.created_at>now()-limits.win)>=limits.per_actor then
    raise exception 'unavailable' using errcode='P0001';
  end if;
  select * into v from public.package_versions pv where pv.workspace_id=issue_registration_link.workspace_id and pv.id=issue_registration_link.package_version_id;
  if not found then raise exception 'not_permitted' using errcode='42501'; end if;
  select * into o from public.package_offers po where po.workspace_id=v.workspace_id and po.id=v.offer_id for update;
  if not found or not o.available or o.current_version_id is distinct from package_version_id then
    raise exception 'stale_terms' using errcode='22023';
  end if;
  if token_hash is null or token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_input' using errcode='22023'; end if;
  if installments is not null then
    if jsonb_typeof(installments)<>'array' then raise exception 'invalid_input' using errcode='22023'; end if;
    if jsonb_array_length(installments)=0 then raise exception 'invalid_input' using errcode='22023'; end if;
    for item in select value from jsonb_array_elements(installments) loop
      position:=position+1;
      if jsonb_typeof(item)<>'object' then raise exception 'invalid_input' using errcode='22023'; end if;
      if (select count(*) from jsonb_object_keys(item))<>3 or not (item ?& array['seq','amount_minor','due_offset_days'])
        or jsonb_typeof(item->'seq') is distinct from 'number' or item->>'seq' !~ '^[0-9]+$'
        or (item->>'seq')::numeric<>position
        or jsonb_typeof(item->'amount_minor') is distinct from 'string' or item->>'amount_minor' !~ '^[0-9]+$'
        or length(ltrim(item->>'amount_minor','0'))>19
        or (item->>'amount_minor')::numeric not between 1 and 9223372036854775807
        or jsonb_typeof(item->'due_offset_days') is distinct from 'number' or item->>'due_offset_days' !~ '^[0-9]+$'
        or (item->>'due_offset_days')::numeric not between 0 and 2147483647 then
        raise exception 'invalid_input' using errcode='22023';
      end if;
      offset_value:=(item->>'due_offset_days')::integer;
      if offset_value<=previous then raise exception 'invalid_input' using errcode='22023'; end if;
      previous:=offset_value; total:=total+(item->>'amount_minor')::numeric;
    end loop;
    if total<>v.price_minor then raise exception 'invalid_input' using errcode='22023'; end if;
  end if;
  insert into public.registration_links(workspace_id,package_version_id,token_hash,created_by,expires_at,price_minor,currency,duration_days,duration_months,commission_rate_bp)
    values(v.workspace_id,v.id,token_hash,auth.uid(),now()+interval '24 hours',v.price_minor,v.currency,v.duration_days,v.duration_months,v.commission_rate_bp)
    on conflict on constraint registration_links_token_hash_key do nothing returning id into result;
  if result is null then raise exception 'unavailable' using errcode='P0001'; end if;
  if installments is not null then
    insert into public.registration_link_installments(workspace_id,link_id,seq,amount_minor,due_offset_days)
      select v.workspace_id,result,(value->>'seq')::integer,(value->>'amount_minor')::bigint,(value->>'due_offset_days')::integer from jsonb_array_elements(installments);
  end if;
  return result;
end $$;

create function public.registration_link_open(token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare link public.registration_links%rowtype; workspace_name text;
begin
  if token is null or token !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' then return '{"status":"invalid"}'::jsonb; end if;
  select * into link from public.registration_links l where l.token_hash=encode(extensions.digest(token,'sha256'),'hex') for update;
  if not found or not app_private.registration_link_is_valid(link.expires_at,link.opened_at,link.consumed_at,now()) then return '{"status":"invalid"}'::jsonb; end if;
  if link.opened_at is null then
    update public.registration_links l set opened_at=now() where l.id=link.id and l.opened_at is null;
  end if;
  select w.name into workspace_name from public.workspaces w where w.id=link.workspace_id;
  return jsonb_build_object('status','valid','workspace_name',workspace_name);
end $$;

create policy registration_links_select_scoped on public.registration_links for select to authenticated using(app_private.has_workspace_access(workspace_id,'generate_registration_link'));
create policy registration_link_installments_select_scoped on public.registration_link_installments for select to authenticated using(app_private.has_workspace_access(workspace_id,'generate_registration_link'));
grant select(workspace_id,id,package_version_id,created_by,created_at,expires_at,opened_at,consumed_at,price_minor,currency,duration_days,duration_months) on public.registration_links to authenticated;
grant select(workspace_id,link_id,seq,amount_minor,due_offset_days) on public.registration_link_installments to authenticated;
create view public.registration_links_safe with(security_invoker=true) as select workspace_id,id,package_version_id,created_by,created_at,expires_at,opened_at,consumed_at,price_minor::text,currency,duration_days,duration_months from public.registration_links;
create view public.registration_link_installments_safe with(security_invoker=true) as select workspace_id,link_id,seq,amount_minor::text,due_offset_days from public.registration_link_installments;
revoke all on public.registration_links_safe,public.registration_link_installments_safe from public,anon,authenticated,service_role;
grant select on public.registration_links_safe,public.registration_link_installments_safe to authenticated;
create function public.get_registration_link_commissions(workspace_id uuid) returns table(link_id uuid,commission_rate_bp integer)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or workspace_id is null or not app_private.has_workspace_access(workspace_id,'generate_registration_link')
    or not (app_private.is_platform_owner() or app_private.current_staff_role()='workspace_owner'::public.staff_role)
    or not exists(select 1 from public.workspaces w where w.id=get_registration_link_commissions.workspace_id) then
    raise exception 'not_permitted' using errcode='42501';
  end if;
  return query select l.id,l.commission_rate_bp from public.registration_links l where l.workspace_id=get_registration_link_commissions.workspace_id;
end $$;

revoke execute on function app_private.registration_link_is_valid(timestamptz,timestamptz,timestamptz,timestamptz),app_private.registration_link_limits(),app_private.guard_registration_link_insert(),app_private.guard_registration_link_update(),app_private.guard_registration_installment_insert(),app_private.validate_registration_link_schedule(uuid,uuid),app_private.check_registration_link_schedule(),public.issue_registration_link(uuid,uuid,text,jsonb),public.registration_link_open(text),public.get_registration_link_commissions(uuid) from public,anon,authenticated,service_role;
alter function app_private.registration_link_is_valid(timestamptz,timestamptz,timestamptz,timestamptz) owner to postgres;
alter function app_private.registration_link_limits() owner to postgres;
alter function app_private.guard_registration_link_insert() owner to postgres;
alter function app_private.guard_registration_link_update() owner to postgres;
alter function app_private.guard_registration_installment_insert() owner to postgres;
alter function app_private.validate_registration_link_schedule(uuid,uuid) owner to postgres;
alter function app_private.check_registration_link_schedule() owner to postgres;
alter function public.issue_registration_link(uuid,uuid,text,jsonb) owner to postgres;
alter function public.registration_link_open(text) owner to postgres;
alter function public.get_registration_link_commissions(uuid) owner to postgres;
grant execute on function public.issue_registration_link(uuid,uuid,text,jsonb),public.get_registration_link_commissions(uuid) to authenticated;
grant execute on function public.registration_link_open(text) to anon,authenticated;

create or replace function app_private.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  event_action text;
  event_target uuid;
  event_workspace uuid;
  event_details jsonb := '{}'::jsonb;
  changed jsonb := '{}'::jsonb;
begin
  if tg_table_schema = 'public' and tg_table_name = 'workspaces' then
    event_target := new.id;
    event_workspace := new.id;
    if tg_op = 'INSERT' then
      event_action := 'workspace.created';
    elsif tg_op = 'UPDATE' then
      if new.name is distinct from old.name then
        changed := changed || jsonb_build_object('name', jsonb_build_object('from', old.name, 'to', new.name));
      end if;
      if new.slug is distinct from old.slug then
        changed := changed || jsonb_build_object('slug', jsonb_build_object('from', old.slug, 'to', new.slug));
      end if;
      if changed = '{}'::jsonb then return new; end if;
      event_action := 'workspace.updated';
      event_details := jsonb_build_object('changed', changed);
    end if;
  elsif tg_table_schema = 'public' and tg_table_name = 'staff_profiles' then
    event_target := new.user_id;
    if tg_op = 'INSERT' then
      event_action := 'staff_role.assigned';
      event_details := jsonb_build_object('role', new.role);
    elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
      event_action := 'staff_role.changed';
      event_details := jsonb_build_object('from', old.role, 'to', new.role);
    else
      return new;
    end if;
  elsif tg_table_schema = 'public' and tg_table_name = 'workspace_memberships' then
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('user_id', new.user_id);
    if tg_op = 'INSERT' then
      event_action := 'membership.granted';
    elsif tg_op = 'UPDATE' and old.revoked_at is null and new.revoked_at is not null then
      event_action := 'membership.revoked';
    else
      return new;
    end if;
  elsif tg_table_schema = 'public' and tg_table_name = 'recovery_link_issuances' then
    if tg_op <> 'INSERT' then return new; end if;
    event_action := 'recovery_link.generated';
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('target_user_id', new.target_user_id);
  elsif tg_table_schema = 'public' and tg_table_name = 'packages' then
    event_action := 'package.created';
    event_target := new.id;
    event_details := jsonb_build_object('code', new.code);
  elsif tg_table_schema = 'public' and tg_table_name = 'package_versions' then
    event_action := 'package_version.published';
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('offer_id', new.offer_id,
      'package_id', (select o.package_id from public.package_offers o where o.workspace_id = new.workspace_id and o.id = new.offer_id),
      'version', new.version, 'price_minor', new.price_minor::text, 'currency', new.currency,
      'commission_rate_bp', new.commission_rate_bp, 'duration_days', new.duration_days);
  elsif tg_table_schema = 'public' and tg_table_name = 'package_offers' then
    if tg_op <> 'UPDATE' or new.available is not distinct from old.available then return new; end if;
    event_action := 'package_offer.availability_changed';
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('available', new.available);
  elsif tg_table_schema = 'public' and tg_table_name = 'registration_links' then
    event_target := new.id;
    event_workspace := new.workspace_id;
    if tg_op = 'INSERT' then
      event_action := 'registration_link.issued';
      event_details := jsonb_build_object('package_version_id',new.package_version_id,
        'offer_id',(select v.offer_id from public.package_versions v where v.workspace_id=new.workspace_id and v.id=new.package_version_id),
        'installment_count',(select count(*) from public.registration_link_installments i where i.workspace_id=new.workspace_id and i.link_id=new.id),
        'price_minor',new.price_minor::text,'currency',new.currency);
    elsif old.opened_at is null and new.opened_at is not null then
      event_action := 'registration_link.opened';
    else return new;
    end if;
  elsif tg_table_schema = 'public' and tg_table_name = 'jobs' then
    if tg_op = 'UPDATE' and new.status = 'dead' and old.status is distinct from new.status then
      event_action := 'job.dead_lettered';
      event_target := new.id;
      event_workspace := new.workspace_id;
      event_details := jsonb_build_object('kind', new.kind, 'error', new.last_error, 'attempts', new.attempts);
    else
      return new;
    end if;
  else
    raise exception 'No audit mapping for %.%', tg_table_schema, tg_table_name;
  end if;

  insert into public.audit_events (actor_user_id, action, target_table, target_id, workspace_id, details)
  values (auth.uid(), event_action, tg_table_name, event_target, event_workspace, event_details);
  return new;
end;
$$;
alter function app_private.audit_row_change() owner to postgres;
revoke execute on function app_private.audit_row_change() from public, anon, authenticated, service_role;

create constraint trigger audit_registration_links_issued after insert on public.registration_links deferrable initially deferred for each row execute function app_private.audit_row_change();
create trigger audit_registration_links_opened after update on public.registration_links for each row execute function app_private.audit_row_change();
