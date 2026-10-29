-- F12 U2 model only. No approval/rejection/collection/correction RPCs.
-- Applied after F11 20261031130000; no historical migration is modified.
create or replace function app_private.role_has_capability(r public.staff_role, cap text) returns boolean
language sql immutable security definer set search_path = '' as $$
  select coalesce(case
    when cap in ('set_package_pricing', 'record_refund', 'delete_client',
                 'export_client_dataset', 'manage_workspaces', 'manage_staff_access')
      then r = 'platform_owner'::public.staff_role
    when cap = 'generate_registration_link'
      then r in ('platform_owner', 'workspace_owner', 'sales', 'trainer')
    when cap in ('configure_installment_schedule', 'record_payment', 'manage_freeze')
      then r in ('platform_owner', 'workspace_owner', 'sales')
    when cap in ('generate_recovery_link', 'approve_registration')
      then r in ('platform_owner', 'workspace_owner')
    when cap = 'coaching_work'
      then r in ('platform_owner', 'workspace_owner', 'trainer')
    else false
  end, false);
$$;
alter function app_private.role_has_capability(public.staff_role,text) owner to postgres;
revoke all on function app_private.role_has_capability(public.staff_role,text) from public,anon,authenticated,service_role;
grant execute on function app_private.role_has_capability(public.staff_role,text) to authenticated;

alter table public.clients drop constraint clients_approval_state_check;
alter table public.clients add constraint clients_approval_state_check check(approval_state in ('pending-approval','approved','rejected'));

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  kind text not null default 'initial' check(kind='initial'),
  registration_link_id uuid not null,
  package_version_id uuid not null,
  price_minor bigint not null check(price_minor>0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  commission_rate_bp integer not null check(commission_rate_bp between 0 and 10000),
  duration_days integer not null check(duration_days>0),
  duration_months integer check(duration_months>0),
  created_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,id,client_id),
  foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete restrict,
  foreign key(workspace_id,registration_link_id,package_version_id) references public.registration_links(workspace_id,id,package_version_id) on delete restrict
);
create unique index f12_initial_subscription on public.subscriptions(workspace_id,client_id) where kind='initial';

create table public.subscription_installments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  subscription_id uuid not null,
  seq integer not null check(seq>0),
  amount_minor bigint not null check(amount_minor>0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  issued_day_offset integer not null check(issued_day_offset>=0),
  source_kind text not null check(source_kind in ('issued_schedule','single_payment')),
  unique(workspace_id,id),
  unique(workspace_id,subscription_id,seq),
  unique(workspace_id,subscription_id,id),
  unique(workspace_id,subscription_id,id,seq),
  foreign key(workspace_id,subscription_id) references public.subscriptions(workspace_id,id) on delete restrict
);

create table app_private.registration_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  actor_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  request_key uuid not null,
  canonical_version integer not null default 1 check(canonical_version=1),
  operation text not null check(operation in ('approve','reject','reconsider','collect','correct')),
  client_id uuid not null,
  subscription_id uuid,
  obligation_id uuid,
  event_id uuid,
  original_event_id uuid,
  expected_installment_seq integer check(expected_installment_seq>0),
  expected_revision integer check(expected_revision>=0),
  expected_previous_event_id uuid,
  canonical_args_hash bytea not null check(octet_length(canonical_args_hash)=32),
  result_receipt jsonb not null check(jsonb_typeof(result_receipt)='object'),
  recorded_at timestamptz not null default now(),
  unique(actor_user_id,request_key),
  unique(workspace_id,id),
  unique(workspace_id,client_id,id),
  unique(workspace_id,subscription_id,obligation_id,id),
  check((operation='reject' and subscription_id is null and obligation_id is null and event_id is null and original_event_id is null and expected_installment_seq is null and expected_revision is null and expected_previous_event_id is null)
    or (operation<>'reject' and subscription_id is not null and obligation_id is not null and event_id is not null and expected_installment_seq is not null and expected_revision is not null)),
  check((operation='correct')=(original_event_id is not null)),
  foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete restrict,
  foreign key(workspace_id,subscription_id,client_id) references public.subscriptions(workspace_id,id,client_id) on delete restrict deferrable initially deferred,
  foreign key(workspace_id,subscription_id,obligation_id,expected_installment_seq) references public.subscription_installments(workspace_id,subscription_id,id,seq) on delete restrict deferrable initially deferred
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  subscription_id uuid not null,
  obligation_id uuid not null,
  installment_seq integer not null check(installment_seq>0),
  revision integer not null check(revision>0),
  previous_event_id uuid,
  kind text not null check(kind in ('collection','correction_reversal')),
  reverses_event_id uuid,
  amount_minor bigint not null,
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  commission_minor bigint not null,
  collected_on date,
  effective_on date not null check(isfinite(effective_on)),
  recorded_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp() check(isfinite(recorded_at)),
  operation_id uuid not null,
  unique(workspace_id,id),
  unique(workspace_id,subscription_id,obligation_id,id),
  check((revision=1)=(previous_event_id is null)),
  check((kind='collection' and reverses_event_id is null and amount_minor>0 and commission_minor>=0 and collected_on is not null and isfinite(collected_on) and effective_on=collected_on)
    or (kind='correction_reversal' and reverses_event_id=previous_event_id and reverses_event_id is not null and amount_minor<0 and commission_minor<=0 and collected_on is null)),
  foreign key(workspace_id,subscription_id,obligation_id,installment_seq) references public.subscription_installments(workspace_id,subscription_id,id,seq) on delete restrict,
  foreign key(workspace_id,subscription_id,obligation_id,previous_event_id) references public.payment_events(workspace_id,subscription_id,obligation_id,id) on delete restrict,
  foreign key(workspace_id,subscription_id,obligation_id,reverses_event_id) references public.payment_events(workspace_id,subscription_id,obligation_id,id) on delete restrict,
  foreign key(workspace_id,subscription_id,obligation_id,operation_id) references app_private.registration_operations(workspace_id,subscription_id,obligation_id,id) on delete restrict deferrable initially deferred
);
create unique index f12_payment_revision on public.payment_events(workspace_id,obligation_id,revision);
create unique index f12_payment_root on public.payment_events(workspace_id,obligation_id) where previous_event_id is null;
create unique index f12_payment_successor on public.payment_events(workspace_id,previous_event_id) where previous_event_id is not null;
create unique index f12_payment_reversal on public.payment_events(workspace_id,reverses_event_id) where reverses_event_id is not null;
alter table app_private.registration_operations add foreign key(workspace_id,subscription_id,obligation_id,event_id) references public.payment_events(workspace_id,subscription_id,obligation_id,id) on delete restrict deferrable initially deferred;
alter table app_private.registration_operations add foreign key(workspace_id,subscription_id,obligation_id,original_event_id) references public.payment_events(workspace_id,subscription_id,obligation_id,id) on delete restrict deferrable initially deferred;
alter table app_private.registration_operations add foreign key(workspace_id,subscription_id,obligation_id,expected_previous_event_id) references public.payment_events(workspace_id,subscription_id,obligation_id,id) on delete restrict deferrable initially deferred;

create table app_private.registration_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  operation_id uuid not null,
  actor_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  kind text not null check(kind in ('approve','reject','reconsider')),
  from_state text not null,
  to_state text not null,
  rejection_reason_code text,
  transaction_id xid8 not null default pg_current_xact_id(),
  recorded_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,client_id,transaction_id),
  unique(workspace_id,operation_id),
  check((kind='approve' and from_state='pending-approval' and to_state='approved' and rejection_reason_code is null)
    or (kind='reject' and from_state='pending-approval' and to_state='rejected' and rejection_reason_code is not distinct from 'registration_rejected')
    or (kind='reconsider' and from_state='rejected' and to_state='approved' and rejection_reason_code is null)),
  foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete restrict,
  foreign key(workspace_id,client_id,operation_id) references app_private.registration_operations(workspace_id,client_id,id) on delete restrict deferrable initially deferred
);

create table app_private.registration_approval_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  subscription_id uuid not null,
  schema_version integer not null default 1 check(schema_version=1),
  kind text not null default 'registration.approved' check(kind='registration.approved'),
  approved_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,subscription_id),
  foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete restrict,
  foreign key(workspace_id,subscription_id,client_id) references public.subscriptions(workspace_id,id,client_id) on delete restrict
);
create table public.subscription_activations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  subscription_id uuid not null,
  activated_at timestamptz not null check(isfinite(activated_at)),
  delivery_event_id uuid not null,
  unique(workspace_id,id),
  unique(workspace_id,subscription_id),
  foreign key(workspace_id,subscription_id) references public.subscriptions(workspace_id,id) on delete restrict
);
-- P4 supplies the delivery FK and atomic writer in a future forward migration.

create function app_private.f12_commission_minor(amount bigint,rate integer) returns bigint
language plpgsql immutable security definer set search_path='' as $$
begin
  if amount is null or amount<=0 or rate is null or rate<0 or rate>10000 then
    raise exception 'invalid_input' using errcode='22023';
  end if;
  -- Wide exact intermediate, integer result; never a floating-point conversion.
  return div(amount::numeric*rate+5000,10000)::bigint;
end $$;

create function app_private.f12_actor_allowed(ws uuid,cap text,po_only boolean) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare actor_role public.staff_role;
begin
  if auth.uid() is null or not exists(select 1 from public.workspaces w where w.id=ws) then return false; end if;
  select s.role into actor_role from public.staff_profiles s where s.user_id=auth.uid() for share;
  if not found or (po_only and actor_role<>'platform_owner') or not app_private.role_has_capability(actor_role,cap) then return false; end if;
  if actor_role='platform_owner' then return true; end if;
  perform 1 from public.workspace_memberships m where m.workspace_id=ws and m.user_id=auth.uid() and m.revoked_at is null for share;
  return found;
end $$;

create function app_private.f12_guard_subscription() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.clients c where c.workspace_id=new.workspace_id and c.id=new.client_id for update;
  if new.created_by is distinct from auth.uid() or new.created_at is distinct from now()
    or not app_private.f12_actor_allowed(new.workspace_id,'approve_registration',false)
    or not exists(select 1 from public.clients c join public.registration_links l on l.workspace_id=c.workspace_id and l.id=c.registration_link_id
      where c.workspace_id=new.workspace_id and c.id=new.client_id and c.registration_link_id=new.registration_link_id and c.package_version_id=new.package_version_id
      and (l.price_minor,l.currency,l.commission_rate_bp,l.duration_days,l.duration_months) is not distinct from (new.price_minor,new.currency,new.commission_rate_bp,new.duration_days,new.duration_months)) then
    raise exception 'invalid_subscription_snapshot' using errcode='23514';
  end if;
  return new;
end $$;

create function app_private.f12_guard_installment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.subscriptions s where s.workspace_id=new.workspace_id and s.id=new.subscription_id and s.xmin::text=pg_current_xact_id()::xid::text) then
    raise exception 'immutable_installment_schedule' using errcode='23514';
  end if;
  return new;
end $$;

create function app_private.f12_validate_subscription(ws uuid,sid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.subscriptions%rowtype; l public.registration_links%rowtype; n bigint;
begin
  select * into strict s from public.subscriptions where workspace_id=ws and id=sid;
  select l0.* into strict l from public.clients c join public.registration_links l0 on l0.workspace_id=c.workspace_id and l0.id=c.registration_link_id
    where c.workspace_id=ws and c.id=s.client_id and c.registration_link_id=s.registration_link_id and c.package_version_id=s.package_version_id;
  if (s.price_minor,s.currency,s.commission_rate_bp,s.duration_days,s.duration_months) is distinct from (l.price_minor,l.currency,l.commission_rate_bp,l.duration_days,l.duration_months) then
    raise exception 'invalid_subscription_snapshot' using errcode='23514';
  end if;
  if not exists(select 1 from public.clients c join app_private.registration_decisions d on d.workspace_id=c.workspace_id and d.client_id=c.id
    where c.workspace_id=ws and c.id=s.client_id and c.approval_state='approved' and d.to_state='approved' and d.transaction_id=pg_current_xact_id()) then
    raise exception 'missing_approval_decision' using errcode='23514';
  end if;
  select count(*) into n from public.subscription_installments i where i.workspace_id=ws and i.subscription_id=sid;
  if n=0 or not exists(select 1 from public.subscription_installments i where i.workspace_id=ws and i.subscription_id=sid
    having min(i.seq)=1 and max(i.seq)=n and sum(i.amount_minor::numeric)=s.price_minor and bool_and(i.currency=s.currency)) then
    raise exception 'invalid_installment_total' using errcode='23514';
  end if;
  if exists(select 1 from public.registration_link_installments i where i.workspace_id=ws and i.link_id=l.id) then
    if exists((select seq,amount_minor,due_offset_days from public.registration_link_installments where workspace_id=ws and link_id=l.id
      except select seq,amount_minor,issued_day_offset from public.subscription_installments where workspace_id=ws and subscription_id=sid)
      union all (select seq,amount_minor,issued_day_offset from public.subscription_installments where workspace_id=ws and subscription_id=sid
      except select seq,amount_minor,due_offset_days from public.registration_link_installments where workspace_id=ws and link_id=l.id))
      or exists(select 1 from public.subscription_installments where workspace_id=ws and subscription_id=sid and source_kind<>'issued_schedule') then
      raise exception 'invalid_issued_schedule' using errcode='23514';
    end if;
  elsif n<>1 or not exists(select 1 from public.subscription_installments where workspace_id=ws and subscription_id=sid and seq=1 and amount_minor=s.price_minor and issued_day_offset=0 and source_kind='single_payment') then
    raise exception 'invalid_single_payment' using errcode='23514';
  end if;
end $$;
create function app_private.f12_check_subscription() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='subscriptions' then perform app_private.f12_validate_subscription(new.workspace_id,new.id);
  else perform app_private.f12_validate_subscription(new.workspace_id,new.subscription_id); end if;
  return new;
end $$;

create function app_private.f12_validate_payment(ws uuid,eid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e public.payment_events%rowtype; p public.payment_events%rowtype; i public.subscription_installments%rowtype; s public.subscriptions%rowtype;
begin
  select * into strict e from public.payment_events where workspace_id=ws and id=eid;
  select * into strict i from public.subscription_installments where workspace_id=ws and subscription_id=e.subscription_id and id=e.obligation_id;
  select * into strict s from public.subscriptions where workspace_id=ws and id=e.subscription_id;
  if e.currency<>i.currency or e.installment_seq<>i.seq then raise exception 'invalid_payment_binding' using errcode='23514'; end if;
  if e.previous_event_id is not null then
    select * into strict p from public.payment_events where workspace_id=ws and subscription_id=e.subscription_id and obligation_id=e.obligation_id and id=e.previous_event_id;
    if e.revision<>p.revision+1 or e.kind=p.kind then raise exception 'invalid_payment_chain' using errcode='23514'; end if;
  elsif e.revision<>1 or e.kind<>'collection' then raise exception 'invalid_payment_root' using errcode='23514'; end if;
  if e.kind='collection' then
    if e.amount_minor<>i.amount_minor or e.commission_minor<>app_private.f12_commission_minor(i.amount_minor,s.commission_rate_bp)
      or e.collected_on>(e.recorded_at at time zone 'Africa/Cairo')::date then
      raise exception 'invalid_collection_value' using errcode='23514';
    end if;
  elsif e.previous_event_id is null or p.kind<>'collection' or e.reverses_event_id is distinct from p.id
    or e.amount_minor<>-p.amount_minor or e.commission_minor<>-p.commission_minor or e.currency<>p.currency
    or e.effective_on<>(e.recorded_at at time zone 'Africa/Cairo')::date then
    raise exception 'invalid_exact_reversal' using errcode='23514';
  end if;
  if not exists(select 1 from app_private.registration_operations o where o.workspace_id=ws and o.id=e.operation_id
    and o.actor_user_id=e.recorded_by and o.client_id=s.client_id and o.subscription_id=e.subscription_id and o.obligation_id=e.obligation_id and o.event_id=e.id
    and o.expected_installment_seq=e.installment_seq and o.expected_revision=e.revision-1 and o.expected_previous_event_id is not distinct from e.previous_event_id
    and ((e.kind='collection' and o.operation in ('approve','reconsider','collect')) or (e.kind='correction_reversal' and o.operation='correct' and o.original_event_id=e.reverses_event_id))) then
    raise exception 'invalid_payment_operation' using errcode='23514';
  end if;
end $$;
create function app_private.f12_check_payment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.f12_validate_payment(new.workspace_id,new.id);
  return new;
end $$;
create function app_private.f12_guard_payment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.subscriptions s where s.workspace_id=new.workspace_id and s.id=new.subscription_id for update;
  if new.recorded_by is distinct from auth.uid() or new.recorded_at<statement_timestamp() or new.recorded_at>clock_timestamp()
    or not app_private.f12_actor_allowed(new.workspace_id,case when new.kind='correction_reversal' then 'record_refund' else 'record_payment' end,new.kind='correction_reversal') then
    raise exception 'invalid_payment_actor' using errcode='23514';
  end if;
  -- Cross-row values are checked again at deferred time independently of this guard.
  return new;
end $$;

create function app_private.f12_guard_decision() returns trigger
language plpgsql security definer set search_path='' as $$
declare state text;
begin
  select c.approval_state into state from public.clients c where c.workspace_id=new.workspace_id and c.id=new.client_id for update;
  if not found or state is distinct from new.from_state or new.actor_user_id is distinct from auth.uid()
    or new.transaction_id is distinct from pg_current_xact_id() or new.recorded_at is distinct from now()
    or not app_private.f12_actor_allowed(new.workspace_id,'approve_registration',new.kind='reconsider') then
    raise exception 'invalid_registration_decision' using errcode='23514';
  end if;
  return new;
end $$;
create function app_private.f12_guard_client_transition() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (to_jsonb(new)-'approval_state') is distinct from (to_jsonb(old)-'approval_state') or old.approval_state=new.approval_state
    or not exists(select 1 from app_private.registration_decisions d where d.workspace_id=old.workspace_id and d.client_id=old.id
      and d.transaction_id=pg_current_xact_id() and d.actor_user_id=auth.uid() and d.from_state=old.approval_state and d.to_state=new.approval_state
      and app_private.f12_actor_allowed(d.workspace_id,'approve_registration',d.kind='reconsider')) then
    raise exception 'invalid_client_transition' using errcode='23514';
  end if;
  return new;
end $$;
create function app_private.f12_check_decision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.clients c where c.workspace_id=new.workspace_id and c.id=new.client_id and c.approval_state=new.to_state)
    or not exists(select 1 from app_private.registration_operations o where o.workspace_id=new.workspace_id and o.id=new.operation_id and o.client_id=new.client_id and o.actor_user_id=new.actor_user_id and o.operation=new.kind) then
    raise exception 'invalid_decision_correspondence' using errcode='23514';
  end if;
  if new.kind='reject' then
    if exists(select 1 from public.subscriptions s where s.workspace_id=new.workspace_id and s.client_id=new.client_id) then raise exception 'rejected_purchase' using errcode='23514'; end if;
  elsif not exists(select 1 from public.subscriptions s
    join public.subscription_installments i on i.workspace_id=s.workspace_id and i.subscription_id=s.id and i.seq=1
    join public.payment_events e on e.workspace_id=i.workspace_id and e.subscription_id=i.subscription_id and e.obligation_id=i.id and e.revision=1 and e.kind='collection' and e.operation_id=new.operation_id
    join app_private.registration_approval_events a on a.workspace_id=s.workspace_id and a.subscription_id=s.id and a.client_id=s.client_id
    where s.workspace_id=new.workspace_id and s.client_id=new.client_id) then
    raise exception 'incomplete_approval_graph' using errcode='23514';
  end if;
  return new;
end $$;

create trigger f12_subscription_insert before insert on public.subscriptions for each row execute function app_private.f12_guard_subscription();
create trigger f12_installment_insert before insert on public.subscription_installments for each row execute function app_private.f12_guard_installment();
create constraint trigger f12_subscription_integrity after insert on public.subscriptions deferrable initially deferred for each row execute function app_private.f12_check_subscription();
create constraint trigger f12_installment_integrity after insert on public.subscription_installments deferrable initially deferred for each row execute function app_private.f12_check_subscription();
create trigger f12_payment_insert before insert on public.payment_events for each row execute function app_private.f12_guard_payment();
create constraint trigger f12_payment_integrity after insert on public.payment_events deferrable initially deferred for each row execute function app_private.f12_check_payment();
create trigger f12_decision_insert before insert on app_private.registration_decisions for each row execute function app_private.f12_guard_decision();
create constraint trigger f12_decision_integrity after insert on app_private.registration_decisions deferrable initially deferred for each row execute function app_private.f12_check_decision();
drop trigger signup_no_update on public.clients;
create trigger f12_client_transition before update on public.clients for each row execute function app_private.f12_guard_client_transition();

alter table public.subscriptions owner to postgres;
revoke all on public.subscriptions from public,anon,authenticated,service_role;
alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;
create trigger f12_no_update before update on public.subscriptions for each row execute function app_private.audit_events_immutable();
create trigger f12_no_delete before delete on public.subscriptions for each row execute function app_private.forbid_delete();
create trigger f12_no_truncate before truncate on public.subscriptions for each statement execute function app_private.forbid_delete();

alter table public.subscription_installments owner to postgres;
revoke all on public.subscription_installments from public,anon,authenticated,service_role;
alter table public.subscription_installments enable row level security;
alter table public.subscription_installments force row level security;
create trigger f12_no_update before update on public.subscription_installments for each row execute function app_private.audit_events_immutable();
create trigger f12_no_delete before delete on public.subscription_installments for each row execute function app_private.forbid_delete();
create trigger f12_no_truncate before truncate on public.subscription_installments for each statement execute function app_private.forbid_delete();

alter table public.payment_events owner to postgres;
revoke all on public.payment_events from public,anon,authenticated,service_role;
alter table public.payment_events enable row level security;
alter table public.payment_events force row level security;
create trigger f12_no_update before update on public.payment_events for each row execute function app_private.audit_events_immutable();
create trigger f12_no_delete before delete on public.payment_events for each row execute function app_private.forbid_delete();
create trigger f12_no_truncate before truncate on public.payment_events for each statement execute function app_private.forbid_delete();

alter table app_private.registration_decisions owner to postgres;
revoke all on app_private.registration_decisions from public,anon,authenticated,service_role;
alter table app_private.registration_decisions enable row level security;
alter table app_private.registration_decisions force row level security;
create trigger f12_no_update before update on app_private.registration_decisions for each row execute function app_private.audit_events_immutable();
create trigger f12_no_delete before delete on app_private.registration_decisions for each row execute function app_private.forbid_delete();
create trigger f12_no_truncate before truncate on app_private.registration_decisions for each statement execute function app_private.forbid_delete();

alter table app_private.registration_operations owner to postgres;
revoke all on app_private.registration_operations from public,anon,authenticated,service_role;
alter table app_private.registration_operations enable row level security;
alter table app_private.registration_operations force row level security;
create trigger f12_no_update before update on app_private.registration_operations for each row execute function app_private.audit_events_immutable();
create trigger f12_no_delete before delete on app_private.registration_operations for each row execute function app_private.forbid_delete();
create trigger f12_no_truncate before truncate on app_private.registration_operations for each statement execute function app_private.forbid_delete();

alter table app_private.registration_approval_events owner to postgres;
revoke all on app_private.registration_approval_events from public,anon,authenticated,service_role;
alter table app_private.registration_approval_events enable row level security;
alter table app_private.registration_approval_events force row level security;
create trigger f12_no_update before update on app_private.registration_approval_events for each row execute function app_private.audit_events_immutable();
create trigger f12_no_delete before delete on app_private.registration_approval_events for each row execute function app_private.forbid_delete();
create trigger f12_no_truncate before truncate on app_private.registration_approval_events for each statement execute function app_private.forbid_delete();

alter table public.subscription_activations owner to postgres;
revoke all on public.subscription_activations from public,anon,authenticated,service_role;
alter table public.subscription_activations enable row level security;
alter table public.subscription_activations force row level security;
create trigger f12_no_update before update on public.subscription_activations for each row execute function app_private.audit_events_immutable();
create trigger f12_no_delete before delete on public.subscription_activations for each row execute function app_private.forbid_delete();
create trigger f12_no_truncate before truncate on public.subscription_activations for each statement execute function app_private.forbid_delete();

alter function app_private.f12_commission_minor(bigint,integer) owner to postgres;
revoke all on function app_private.f12_commission_minor(bigint,integer) from public,anon,authenticated,service_role;

alter function app_private.f12_actor_allowed(uuid,text,boolean) owner to postgres;
revoke all on function app_private.f12_actor_allowed(uuid,text,boolean) from public,anon,authenticated,service_role;

alter function app_private.f12_guard_subscription() owner to postgres;
revoke all on function app_private.f12_guard_subscription() from public,anon,authenticated,service_role;

alter function app_private.f12_guard_installment() owner to postgres;
revoke all on function app_private.f12_guard_installment() from public,anon,authenticated,service_role;

alter function app_private.f12_validate_subscription(uuid,uuid) owner to postgres;
revoke all on function app_private.f12_validate_subscription(uuid,uuid) from public,anon,authenticated,service_role;

alter function app_private.f12_check_subscription() owner to postgres;
revoke all on function app_private.f12_check_subscription() from public,anon,authenticated,service_role;

alter function app_private.f12_validate_payment(uuid,uuid) owner to postgres;
revoke all on function app_private.f12_validate_payment(uuid,uuid) from public,anon,authenticated,service_role;

alter function app_private.f12_check_payment() owner to postgres;
revoke all on function app_private.f12_check_payment() from public,anon,authenticated,service_role;

alter function app_private.f12_guard_payment() owner to postgres;
revoke all on function app_private.f12_guard_payment() from public,anon,authenticated,service_role;

alter function app_private.f12_guard_decision() owner to postgres;
revoke all on function app_private.f12_guard_decision() from public,anon,authenticated,service_role;

alter function app_private.f12_guard_client_transition() owner to postgres;
revoke all on function app_private.f12_guard_client_transition() from public,anon,authenticated,service_role;

alter function app_private.f12_check_decision() owner to postgres;
revoke all on function app_private.f12_check_decision() from public,anon,authenticated,service_role;

-- Complete F11 body below, with one marked additive block.
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
    -- U3 consumption addition begin
    elsif old.consumed_at is null and new.consumed_at is not null then
      event_action := 'registration_link.consumed';
      event_details := jsonb_build_object('outcome_class','consumption','timestamp',new.consumed_at,'link_id',new.id,'workspace_id',new.workspace_id);
    -- U3 consumption addition end
    else return new;
    end if;
  -- F12 extension begin
  elsif tg_table_schema = 'public' and tg_table_name = 'clients' and tg_op = 'UPDATE' then
    event_target := new.id;
    event_workspace := new.workspace_id;
    select case d.kind when 'approve' then 'client.approved' when 'reject' then 'client.rejected' when 'reconsider' then 'client.reconsidered' end,
      jsonb_strip_nulls(jsonb_build_object('decision_id',d.id,'client_id',new.id,'from_state',old.approval_state,'to_state',new.approval_state,'reason_code',d.rejection_reason_code))
      into event_action,event_details
      from app_private.registration_decisions d where d.workspace_id=new.workspace_id and d.client_id=new.id
        and d.transaction_id=pg_current_xact_id() and d.actor_user_id=auth.uid() and d.from_state=old.approval_state and d.to_state=new.approval_state;
    if not found then raise exception 'invalid_client_transition' using errcode='23514'; end if;
  elsif tg_table_schema = 'public' and tg_table_name = 'payment_events' then
    if tg_op <> 'INSERT' then return new; end if;
    event_action := case new.kind when 'collection' then 'payment.collected' when 'correction_reversal' then 'payment.collection_corrected' end;
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('client_id',(select s.client_id from public.subscriptions s where s.workspace_id=new.workspace_id and s.id=new.subscription_id),
      'subscription_id',new.subscription_id,'obligation_id',new.obligation_id,'event_id',new.id,
      'installment_seq',new.installment_seq,'revision',new.revision,'amount_minor',new.amount_minor::text,
      'currency',new.currency,'collected_on',new.collected_on,'effective_on',new.effective_on,'recorded_at',new.recorded_at);
  -- F12 extension end
  -- U3 client addition begin
  elsif tg_table_schema = 'public' and tg_table_name = 'clients' then
    if tg_op <> 'INSERT' then return new; end if;
    event_action := 'client.signup_succeeded';
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('outcome_class','success','timestamp',new.created_at,'link_id',new.registration_link_id,'workspace_id',new.workspace_id);
  -- U3 client addition end
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


create trigger audit_client_approval after update on public.clients for each row execute function app_private.audit_row_change();
create trigger audit_payment_events after insert on public.payment_events for each row execute function app_private.audit_row_change();
