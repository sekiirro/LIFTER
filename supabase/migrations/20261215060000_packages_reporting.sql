-- 009 package reporting data (T068/T060/T072-T074). Reporting snapshots are
-- separate from payment/settlement events; a ready FX snapshot is immutable.

create table app_private.package_reporting_fx_snapshots (
  workspace_id uuid not null,
  payment_event_id uuid not null,
  status text not null check (status in ('pending','ready')),
  source_currency text not null check (source_currency ~ '^[A-Z]{3}$'),
  target_currency text not null default 'EGP' check (target_currency='EGP'),
  provider_key text,
  rate numeric,
  publication_date date,
  transaction_at timestamptz not null,
  exact_egp_minor numeric,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id,payment_event_id),
  foreign key (workspace_id,payment_event_id)
    references public.payment_events(workspace_id,id) on delete restrict,
  check (
    (status='pending' and source_currency <> 'EGP' and provider_key is not null
      and rate is null and publication_date is null and exact_egp_minor is null)
    or
    (status='ready' and rate is not null and rate > 0 and exact_egp_minor is not null
      and ((source_currency='EGP' and provider_key is null and rate=1 and publication_date is null)
        or (source_currency='USD' and provider_key='CBE' and publication_date is not null)
        or (source_currency='SAR' and provider_key='SAMA' and publication_date is not null)))
  )
);
alter table app_private.package_reporting_fx_snapshots enable row level security;
alter table app_private.package_reporting_fx_snapshots force row level security;
revoke all on app_private.package_reporting_fx_snapshots from public,anon,authenticated,service_role;
create policy package_reporting_fx_snapshot_owner
on app_private.package_reporting_fx_snapshots for all to postgres
using (true) with check (true);

create function app_private.guard_package_reporting_fx_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'immutable_reporting_snapshot' using errcode='23514'; end if;
  if old.status='ready' then raise exception 'immutable_reporting_snapshot' using errcode='23514'; end if;
  if (new.workspace_id,new.payment_event_id,new.source_currency,new.target_currency,new.transaction_at)
     is distinct from
     (old.workspace_id,old.payment_event_id,old.source_currency,old.target_currency,old.transaction_at) then
    raise exception 'immutable_reporting_snapshot' using errcode='23514';
  end if;
  if new.status='pending' and (new.provider_key,new.rate,new.publication_date,new.exact_egp_minor)
     is distinct from (old.provider_key,old.rate,old.publication_date,old.exact_egp_minor) then
    raise exception 'immutable_reporting_snapshot' using errcode='23514';
  end if;
  return new;
end $$;
alter function app_private.guard_package_reporting_fx_snapshot() owner to postgres;
revoke all on function app_private.guard_package_reporting_fx_snapshot() from public,anon,authenticated,service_role;
create trigger package_reporting_fx_snapshot_no_change
before update or delete on app_private.package_reporting_fx_snapshots
for each row execute function app_private.guard_package_reporting_fx_snapshot();
create trigger package_reporting_fx_snapshot_no_truncate
before truncate on app_private.package_reporting_fx_snapshots
for each statement execute function app_private.forbid_delete();

create function app_private.seed_package_reporting_fx_pending()
returns trigger language plpgsql security definer set search_path='' as $$
declare pinned_provider text;
begin
  if new.currency='EGP' then
    insert into app_private.package_reporting_fx_snapshots(
      workspace_id,payment_event_id,status,source_currency,provider_key,rate,
      publication_date,transaction_at,exact_egp_minor
    ) values (new.workspace_id,new.id,'ready','EGP',null,1,null,new.recorded_at,new.amount_minor);
  elsif new.currency in ('USD','SAR') then
    pinned_provider:=case new.currency when 'USD' then 'CBE' else 'SAMA' end;
    insert into app_private.package_reporting_fx_snapshots(
      workspace_id,payment_event_id,status,source_currency,provider_key,rate,
      publication_date,transaction_at,exact_egp_minor
    ) values (new.workspace_id,new.id,'pending',new.currency,pinned_provider,null,null,new.recorded_at,null);
  end if;
  return new;
end $$;
alter function app_private.seed_package_reporting_fx_pending() owner to postgres;
revoke all on function app_private.seed_package_reporting_fx_pending() from public,anon,authenticated,service_role;
create trigger payment_event_reporting_fx_snapshot
after insert on public.payment_events
for each row execute function app_private.seed_package_reporting_fx_pending();

-- Service-only writer called by the server-side reporting adapter after the
-- pinned FX adapter resolves a pending line. It cannot alter a ready snapshot.
create function public.save_package_reporting_fx_snapshot(
  p_workspace_id uuid,p_payment_event_id uuid,p_status text,p_provider_key text,
  p_rate text,p_publication_date date
) returns jsonb language plpgsql security definer set search_path='' as $$
declare ev public.payment_events%rowtype; prev app_private.package_reporting_fx_snapshots%rowtype;
declare rate_value numeric; provider text; next_status text; exact_value numeric;
begin
  if auth.role() <> 'service_role' then return jsonb_build_object('status','not_permitted'); end if;
  select * into ev from public.payment_events e
    where e.workspace_id=p_workspace_id and e.id=p_payment_event_id;
  if not found then return jsonb_build_object('status','not_permitted'); end if;
  select * into prev from app_private.package_reporting_fx_snapshots s
    where s.workspace_id=p_workspace_id and s.payment_event_id=p_payment_event_id;
  if found and prev.status='ready' then
    return jsonb_build_object('status','ready','provider',prev.provider_key,'rate',prev.rate::text,
      'publication_date',prev.publication_date,'exact_egp_minor',prev.exact_egp_minor::text);
  end if;
  if p_status not in ('pending','ready') then return jsonb_build_object('status','invalid_input'); end if;
  if ev.currency='EGP' then
    if p_status<>'ready' or p_provider_key is not null or p_rate is distinct from '1' or p_publication_date is not null then
      return jsonb_build_object('status','invalid_input');
    end if;
    next_status:='ready'; provider:=null; rate_value:=1; exact_value:=ev.amount_minor;
  else
    provider:=case ev.currency when 'USD' then 'CBE' when 'SAR' then 'SAMA' else null end;
    if provider is null or p_provider_key is distinct from provider then
      return jsonb_build_object('status','invalid_input');
    end if;
    if p_status='pending' then
      if p_rate is not null or p_publication_date is not null then return jsonb_build_object('status','invalid_input'); end if;
      next_status:='pending'; rate_value:=null; exact_value:=null;
    else
      begin rate_value:=p_rate::numeric; exception when others then return jsonb_build_object('status','invalid_input'); end;
      if p_publication_date is null or p_publication_date >= (ev.recorded_at at time zone 'Africa/Cairo')::date
        or rate_value <= 0 or rate_value::text in ('NaN','Infinity','-Infinity')
        or (ev.currency='USD' and (rate_value < 1 or rate_value > 1000))
        or (ev.currency='USD' and extract(dow from p_publication_date) in (5,6))
        or (ev.currency='SAR' and (rate_value < 0.5 or rate_value > 300)) then
        return jsonb_build_object('status','invalid_input');
      end if;
      next_status:='ready'; exact_value:=ev.amount_minor::numeric*rate_value;
    end if;
  end if;
  if prev.payment_event_id is null then
    insert into app_private.package_reporting_fx_snapshots(
      workspace_id,payment_event_id,status,source_currency,provider_key,rate,publication_date,
      transaction_at,exact_egp_minor
    ) values (
      p_workspace_id,payment_event_id,next_status,ev.currency,provider,rate_value,p_publication_date,
      ev.recorded_at,exact_value
    );
  elsif prev.status='pending' and next_status='ready' then
    update app_private.package_reporting_fx_snapshots set status='ready',rate=rate_value,
      publication_date=p_publication_date,exact_egp_minor=exact_value
      where workspace_id=p_workspace_id and payment_event_id=p_payment_event_id;
  end if;
  return jsonb_build_object('status',next_status,'provider',provider,'rate',rate_value::text,
    'publication_date',p_publication_date,'exact_egp_minor',exact_value::text);
end $$;
alter function public.save_package_reporting_fx_snapshot(uuid,uuid,text,text,text,date) owner to postgres;
revoke all on function public.save_package_reporting_fx_snapshot(uuid,uuid,text,text,text,date) from public,anon,authenticated;
grant execute on function public.save_package_reporting_fx_snapshot(uuid,uuid,text,text,text,date) to service_role;

create function public.package_monthly_collections(workspace_id uuid,month_start date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; local_start timestamptz; local_end timestamptz;
begin
  if auth.uid() is null or app_private.current_staff_role() is null then
    raise exception 'not_permitted' using errcode='42501';
  end if;
  if not app_private.has_workspace_access(workspace_id,null) or month_start is null
    or extract(day from month_start)<>1 then return jsonb_build_object('status','not_permitted'); end if;
  local_start:=month_start::timestamp at time zone 'Africa/Cairo';
  local_end:=(month_start+interval '1 month')::timestamp at time zone 'Africa/Cairo';
  with source as (
    select e.id,e.workspace_id,e.subscription_id,e.kind,e.amount_minor,e.currency,e.commission_minor,
      e.recorded_at,e.effective_on,e.obligation_id,s.client_id,v.offer_id,o.package_id,
      fx.status fx_status,fx.provider_key,fx.rate,fx.publication_date,fx.exact_egp_minor,
      case when e.currency='EGP' then e.amount_minor::numeric
        when fx.status='ready' then fx.exact_egp_minor else null end converted_exact
    from public.payment_events e
    join public.subscriptions s on s.workspace_id=e.workspace_id and s.id=e.subscription_id
    join public.package_versions v on v.workspace_id=s.workspace_id and v.id=s.package_version_id
    join public.package_offers o on o.workspace_id=v.workspace_id and o.id=v.offer_id
    left join app_private.package_reporting_fx_snapshots fx
      on fx.workspace_id=e.workspace_id and fx.payment_event_id=e.id
    where e.workspace_id=package_monthly_collections.workspace_id
      and e.recorded_at>=local_start and e.recorded_at<local_end
      and e.kind in ('collection','correction_reversal')
  )
  select jsonb_build_object('status','ok','month',to_char(month_start,'YYYY-MM'),
    'collections',coalesce((select jsonb_agg(jsonb_build_object(
      'event_id',id,'subscription_id',subscription_id,'client_id',client_id,'package_id',package_id,
      'kind',kind,'amount_minor',amount_minor::text,'currency',currency,
      'recorded_at',recorded_at,
      'fx',case when currency='EGP' then jsonb_build_object('status','ready','provider',null,'rate','1','publication_date',null)
        when fx_status='ready' then jsonb_build_object('status','ready','provider',provider_key,'rate',rate::text,'publication_date',publication_date)
        else jsonb_build_object('status','pending') end,
      'converted_egp_exact',converted_exact::text
    ) order by recorded_at,id) from source where kind='collection'),'[]'::jsonb),
    'accounting_events',coalesce((select jsonb_agg(jsonb_build_object(
      'event_id',id,'subscription_id',subscription_id,'client_id',client_id,'package_id',package_id,
      'kind',kind,'amount_minor',amount_minor::text,'currency',currency,
      'recorded_at',recorded_at
    ) order by recorded_at,id) from source where kind='correction_reversal'),'[]'::jsonb),
    'pending_event_ids',coalesce((select jsonb_agg(id order by id) from source
      where currency<>'EGP' and fx_status is distinct from 'ready'),'[]'::jsonb),
    'converted_egp_minor',coalesce((select floor(sum(converted_exact)+0.5)::bigint::text from source
      where kind='collection' and converted_exact is not null),'0')) into result;
  return result;
end $$;
alter function public.package_monthly_collections(uuid,date) owner to postgres;
revoke all on function public.package_monthly_collections(uuid,date) from public,anon,service_role;
grant execute on function public.package_monthly_collections(uuid,date) to authenticated;

create function public.package_commission_report(workspace_id uuid,month_start date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; local_start timestamptz; local_end timestamptz;
begin
  if auth.uid() is null or app_private.current_staff_role() is null then
    raise exception 'not_permitted' using errcode='42501';
  end if;
  if app_private.current_staff_role() not in ('platform_owner','workspace_owner')
    or not app_private.has_workspace_access(workspace_id,null) or month_start is null
    or extract(day from month_start)<>1 then return jsonb_build_object('status','not_permitted'); end if;
  local_start:=month_start::timestamp at time zone 'Africa/Cairo';
  local_end:=(month_start+interval '1 month')::timestamp at time zone 'Africa/Cairo';
  with source as (
    select o.package_id,e.currency,e.commission_minor,
      case when e.currency='EGP' then e.commission_minor::numeric
        when fx.status='ready' then e.commission_minor::numeric*fx.rate else null end converted_exact
    from public.payment_events e
    join public.subscriptions s on s.workspace_id=e.workspace_id and s.id=e.subscription_id
    join public.package_versions v on v.workspace_id=s.workspace_id and v.id=s.package_version_id
    join public.package_offers o on o.workspace_id=v.workspace_id and o.id=v.offer_id
    left join app_private.package_reporting_fx_snapshots fx
      on fx.workspace_id=e.workspace_id and fx.payment_event_id=e.id and fx.status='ready'
    where e.workspace_id=package_commission_report.workspace_id
      and e.recorded_at>=local_start and e.recorded_at<local_end
      and e.kind in ('collection','correction_reversal')
  ), grouped as (
    select package_id,
      jsonb_object_agg(currency,commission_minor::text) original_commission_by_currency,
      sum(converted_exact) converted_exact,
      sum(pending_event_count)::integer pending_event_count
    from (
      select package_id,currency,sum(commission_minor)::numeric commission_minor,
        sum(converted_exact) converted_exact,
        count(*) filter (where converted_exact is null and currency<>'EGP') pending_event_count
      from source group by package_id,currency
    ) by_currency group by package_id
  )
  select jsonb_build_object('status','ok','month',to_char(month_start,'YYYY-MM'),
    'commissions',coalesce((select jsonb_agg(jsonb_build_object(
      'package_id',package_id,'original_commission_by_currency',original_commission_by_currency,
      'converted_egp_exact',converted_exact::text,
      'converted_egp_minor',case when converted_exact is null then null
        when converted_exact < 0 then ceil(converted_exact-0.5)::bigint::text
        else floor(converted_exact+0.5)::bigint::text end,
      'pending_event_count',pending_event_count
    ) order by package_id) from grouped),'[]'::jsonb)) into result;
  return result;
end $$;
alter function public.package_commission_report(uuid,date) owner to postgres;
revoke all on function public.package_commission_report(uuid,date) from public,anon,service_role;
grant execute on function public.package_commission_report(uuid,date) to authenticated;

create function public.package_installment_report(workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or app_private.current_staff_role() is null then
    raise exception 'not_permitted' using errcode='42501';
  end if;
  if not app_private.has_workspace_access(workspace_id,null) then return jsonb_build_object('status','not_permitted'); end if;
  with rows as (
    select s.id subscription_id,s.client_id,o.package_id,s.currency,i.id installment_id,i.seq,
      i.amount_minor,i.issued_day_offset,i.source_kind,
      case when i.source_kind='renewal_schedule' then i.due_on
        when i.seq=1 or a.activated_at is null then null
        else ((a.activated_at at time zone 'Africa/Cairo')::date+i.issued_day_offset) end due_on,
      coalesce(t.kind='collection',false) paid,
      case when coalesce(t.kind='collection',false) then t.amount_minor else 0 end paid_minor,
      count(*) over(partition by s.workspace_id,s.id)>1 is_installment_client
    from public.subscriptions s
    join public.subscription_installments i on i.workspace_id=s.workspace_id and i.subscription_id=s.id
    join public.package_versions v on v.workspace_id=s.workspace_id and v.id=s.package_version_id
    join public.package_offers o on o.workspace_id=v.workspace_id and o.id=v.offer_id
    left join public.subscription_activations a on a.workspace_id=s.workspace_id and a.subscription_id=s.id
    left join lateral (
      select e.kind,e.amount_minor from public.payment_events e
      where e.workspace_id=i.workspace_id and e.subscription_id=i.subscription_id and e.obligation_id=i.id
      order by e.revision desc limit 1
    ) t on true
    where s.workspace_id=package_installment_report.workspace_id
  )
  select jsonb_build_object('status','ok','installments',coalesce(jsonb_agg(jsonb_build_object(
    'subscription_id',subscription_id,'client_id',client_id,'package_id',package_id,
    'installment_id',installment_id,'seq',seq,'due_on',due_on,
    'amount_minor',amount_minor::text,'currency',currency,'paid_minor',paid_minor::text,
    'remaining_minor',greatest(amount_minor-paid_minor,0)::text,
    'is_installment_client',is_installment_client
  ) order by client_id,subscription_id,seq),'[]'::jsonb)) into result from rows;
  return result;
end $$;
alter function public.package_installment_report(uuid) owner to postgres;
revoke all on function public.package_installment_report(uuid) from public,anon,service_role;
grant execute on function public.package_installment_report(uuid) to authenticated;
