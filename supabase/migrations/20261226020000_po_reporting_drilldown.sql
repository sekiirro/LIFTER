-- Spec 029: PO-only finance drill-down over the payment/reporting source facts.
-- Keep source event rows and FX snapshots authoritative; this adds no report store.
create function public.po_reporting_aggregate(
  p_workspace_id uuid default null,
  p_month_start date default null,
  p_package_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not coalesce(app_private.is_platform_owner(),false) then
    raise exception 'not_permitted' using errcode='42501';
  end if;
  if p_month_start is not null and (not isfinite(p_month_start) or extract(day from p_month_start)<>1) then
    return jsonb_build_object('status','not_permitted');
  end if;
  if p_workspace_id is not null and not exists (
    select 1 from public.workspaces w where w.id=p_workspace_id
  ) then return jsonb_build_object('status','not_permitted'); end if;
  if p_package_id is not null and not exists (
    select 1 from public.package_offers o
    where o.package_id=p_package_id and (p_workspace_id is null or o.workspace_id=p_workspace_id)
  ) then return jsonb_build_object('status','not_permitted'); end if;

  with source as (
    select e.id,e.workspace_id,e.subscription_id,e.kind,e.amount_minor,e.commission_minor,e.currency,
      e.recorded_at,s.client_id,o.package_id,
      to_char(e.recorded_at at time zone 'Africa/Cairo','YYYY-MM') month_key,
      fx.status fx_status,
      case when e.currency='EGP' then e.amount_minor::numeric
        when fx.status='ready' then fx.exact_egp_minor else null end converted_exact,
      case when e.currency='EGP' then e.commission_minor::numeric
        when fx.status='ready' then e.commission_minor::numeric*fx.rate else null end converted_commission_exact
    from public.payment_events e
    join public.subscriptions s on s.workspace_id=e.workspace_id and s.id=e.subscription_id
    join public.package_versions v on v.workspace_id=s.workspace_id and v.id=s.package_version_id
    join public.package_offers o on o.workspace_id=v.workspace_id and o.id=v.offer_id
    left join app_private.package_reporting_fx_snapshots fx
      on fx.workspace_id=e.workspace_id and fx.payment_event_id=e.id
    where (p_workspace_id is null or e.workspace_id=p_workspace_id)
      and (p_month_start is null or (
        e.recorded_at >= p_month_start::timestamp at time zone 'Africa/Cairo'
        and e.recorded_at < (p_month_start+interval '1 month')::timestamp at time zone 'Africa/Cairo'
      ))
      and (p_package_id is null or o.package_id=p_package_id)
      and e.kind in ('collection','correction_reversal')
  ), currency_totals as (
    select currency,
      sum(amount_minor) filter (where kind='collection') collection_minor,
      sum(amount_minor) filter (where kind='correction_reversal') reversal_minor,
      sum(commission_minor) commission_minor,
      sum(converted_exact) converted_exact,
      sum(converted_commission_exact) converted_commission_exact,
      count(*) filter (where currency<>'EGP' and fx_status is distinct from 'ready')::integer pending_fx_count
    from source group by currency
  ), workspace_totals as (
    select workspace_id,currency,
      sum(amount_minor) filter (where kind='collection') collection_minor,
      sum(amount_minor) filter (where kind='correction_reversal') reversal_minor,
      sum(commission_minor) commission_minor,
      sum(converted_exact) converted_exact,
      sum(converted_commission_exact) converted_commission_exact,
      count(*) filter (where currency<>'EGP' and fx_status is distinct from 'ready')::integer pending_fx_count
    from source group by workspace_id,currency
  ), month_totals as (
    select month_key,currency,
      sum(amount_minor) filter (where kind='collection') collection_minor,
      sum(amount_minor) filter (where kind='correction_reversal') reversal_minor,
      sum(commission_minor) commission_minor,
      sum(converted_exact) converted_exact,
      sum(converted_commission_exact) converted_commission_exact,
      count(*) filter (where currency<>'EGP' and fx_status is distinct from 'ready')::integer pending_fx_count
    from source group by month_key,currency
  ), package_totals as (
    select package_id,currency,
      sum(amount_minor) filter (where kind='collection') collection_minor,
      sum(amount_minor) filter (where kind='correction_reversal') reversal_minor,
      sum(commission_minor) commission_minor,
      sum(converted_exact) converted_exact,
      sum(converted_commission_exact) converted_commission_exact,
      count(*) filter (where currency<>'EGP' and fx_status is distinct from 'ready')::integer pending_fx_count
    from source group by package_id,currency
  )
  select jsonb_build_object(
    'status','ok',
    'workspace_id',p_workspace_id,
    'month',case when p_month_start is null then null else to_char(p_month_start,'YYYY-MM') end,
    'currency_totals',coalesce((select jsonb_agg(jsonb_build_object(
      'currency',currency,'collection_minor',coalesce(collection_minor,0)::text,
      'reversal_minor',coalesce(reversal_minor,0)::text,'commission_minor',coalesce(commission_minor,0)::text,
      'converted_egp_exact',converted_exact::text,'converted_commission_egp_exact',converted_commission_exact::text,
      'converted_egp_minor',case when converted_exact is null then null else floor(converted_exact+0.5)::bigint::text end,
      'converted_commission_egp_minor',case when converted_commission_exact is null then null
        when converted_commission_exact<0 then ceil(converted_commission_exact-0.5)::bigint::text
        else floor(converted_commission_exact+0.5)::bigint::text end,
      'pending_fx_count',pending_fx_count
    ) order by currency) from currency_totals),'[]'::jsonb),
    'workspaces',coalesce((select jsonb_agg(jsonb_build_object(
      'workspace_id',workspace_id,'currency',currency,'collection_minor',coalesce(collection_minor,0)::text,
      'reversal_minor',coalesce(reversal_minor,0)::text,'commission_minor',coalesce(commission_minor,0)::text,
      'converted_egp_exact',converted_exact::text,'converted_commission_egp_exact',converted_commission_exact::text,
      'converted_egp_minor',case when converted_exact is null then null else floor(converted_exact+0.5)::bigint::text end,
      'converted_commission_egp_minor',case when converted_commission_exact is null then null
        when converted_commission_exact<0 then ceil(converted_commission_exact-0.5)::bigint::text
        else floor(converted_commission_exact+0.5)::bigint::text end,
      'pending_fx_count',pending_fx_count
    ) order by workspace_id,currency) from workspace_totals),'[]'::jsonb),
    'months',coalesce((select jsonb_agg(jsonb_build_object(
      'month',month_key,'currency',currency,'collection_minor',coalesce(collection_minor,0)::text,
      'reversal_minor',coalesce(reversal_minor,0)::text,'commission_minor',coalesce(commission_minor,0)::text,
      'converted_egp_exact',converted_exact::text,'converted_commission_egp_exact',converted_commission_exact::text,
      'converted_egp_minor',case when converted_exact is null then null else floor(converted_exact+0.5)::bigint::text end,
      'converted_commission_egp_minor',case when converted_commission_exact is null then null
        when converted_commission_exact<0 then ceil(converted_commission_exact-0.5)::bigint::text
        else floor(converted_commission_exact+0.5)::bigint::text end,
      'pending_fx_count',pending_fx_count
    ) order by month_key,currency) from month_totals),'[]'::jsonb),
    'packages',coalesce((select jsonb_agg(jsonb_build_object(
      'package_id',package_id,'currency',currency,'collection_minor',coalesce(collection_minor,0)::text,
      'reversal_minor',coalesce(reversal_minor,0)::text,'commission_minor',coalesce(commission_minor,0)::text,
      'converted_egp_exact',converted_exact::text,'converted_commission_egp_exact',converted_commission_exact::text,
      'converted_egp_minor',case when converted_exact is null then null else floor(converted_exact+0.5)::bigint::text end,
      'converted_commission_egp_minor',case when converted_commission_exact is null then null
        when converted_commission_exact<0 then ceil(converted_commission_exact-0.5)::bigint::text
        else floor(converted_commission_exact+0.5)::bigint::text end,
      'pending_fx_count',pending_fx_count
    ) order by package_id,currency) from package_totals),'[]'::jsonb)
  ) into result;
  return result;
end $$;
alter function public.po_reporting_aggregate(uuid,date,uuid) owner to postgres;
revoke all on function public.po_reporting_aggregate(uuid,date,uuid) from public,anon,authenticated,service_role;
grant execute on function public.po_reporting_aggregate(uuid,date,uuid) to authenticated;

create function public.po_reporting_source_rows(
  p_workspace_id uuid,
  p_month_start date default null,
  p_package_id uuid default null,
  p_page_size integer default 50,
  p_cursor_recorded_at timestamptz default null,
  p_cursor_event_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; actor uuid:=auth.uid(); row_count integer;
begin
  if actor is null or not coalesce(app_private.is_platform_owner(),false) then
    raise exception 'not_permitted' using errcode='42501';
  end if;
  if p_workspace_id is null or p_page_size not between 1 and 100
    or (p_month_start is not null and (not isfinite(p_month_start) or extract(day from p_month_start)<>1))
    or ((p_cursor_recorded_at is null)<>(p_cursor_event_id is null)) then
    return jsonb_build_object('status','not_permitted');
  end if;
  if not exists(select 1 from public.workspaces w where w.id=p_workspace_id)
    or (p_package_id is not null and not exists(
      select 1 from public.package_offers o where o.workspace_id=p_workspace_id and o.package_id=p_package_id
    )) then return jsonb_build_object('status','not_permitted'); end if;
  with rows as (
    select e.id,e.workspace_id,e.subscription_id,s.client_id,c.name client_name,o.package_id,
      e.kind,e.amount_minor::text amount_minor,e.commission_minor::text commission_minor,e.currency,e.recorded_at,
      fx.status fx_status,fx.provider_key,fx.rate,fx.publication_date,
      case when e.currency='EGP' then e.amount_minor::numeric
        when fx.status='ready' then fx.exact_egp_minor else null end converted_egp_exact,
      case when e.currency='EGP' then e.commission_minor::numeric
        when fx.status='ready' then e.commission_minor::numeric*fx.rate else null end converted_commission_egp_exact
    from public.payment_events e
    join public.subscriptions s on s.workspace_id=e.workspace_id and s.id=e.subscription_id
    join public.clients c on c.workspace_id=s.workspace_id and c.id=s.client_id
    join public.package_versions v on v.workspace_id=s.workspace_id and v.id=s.package_version_id
    join public.package_offers o on o.workspace_id=v.workspace_id and o.id=v.offer_id
    left join app_private.package_reporting_fx_snapshots fx
      on fx.workspace_id=e.workspace_id and fx.payment_event_id=e.id
    where e.workspace_id=p_workspace_id and e.kind in ('collection','correction_reversal')
      and (p_month_start is null or (
        e.recorded_at >= p_month_start::timestamp at time zone 'Africa/Cairo'
        and e.recorded_at < (p_month_start+interval '1 month')::timestamp at time zone 'Africa/Cairo'
      ))
      and (p_package_id is null or o.package_id=p_package_id)
      and (p_cursor_recorded_at is null or (e.recorded_at,e.id)<(p_cursor_recorded_at,p_cursor_event_id))
    order by e.recorded_at desc,e.id desc limit p_page_size+1
  ), page as (
    select * from rows order by recorded_at desc,id desc limit p_page_size
  )
  select jsonb_build_object('status','ok','workspace_id',p_workspace_id,
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'event_id',id,'workspace_id',workspace_id,'subscription_id',subscription_id,'client_id',client_id,
      'client_name',client_name,'package_id',package_id,'kind',kind,'amount_minor',amount_minor,
      'commission_minor',commission_minor,'currency',currency,'recorded_at',recorded_at,
      'fx',case when currency='EGP' then jsonb_build_object('status','ready','provider',null,'rate','1','publication_date',null)
        when fx_status='ready' then jsonb_build_object('status','ready','provider',provider_key,'rate',rate::text,'publication_date',publication_date)
        else jsonb_build_object('status','pending') end,
      'converted_egp_exact',converted_egp_exact::text,
      'converted_commission_egp_exact',converted_commission_egp_exact::text
    ) order by recorded_at desc,id desc) from page),'[]'::jsonb),
    'has_more',(select count(*)>p_page_size from rows),
    'next_cursor',(select case when count(*)>p_page_size then jsonb_build_object(
      'recorded_at',(array_agg(recorded_at order by recorded_at desc,id desc))[p_page_size],
      'event_id',(array_agg(id order by recorded_at desc,id desc))[p_page_size]
    ) else null end from rows)) into result;
  return result;
end $$;
alter function public.po_reporting_source_rows(uuid,date,uuid,integer,timestamptz,uuid) owner to postgres;
revoke all on function public.po_reporting_source_rows(uuid,date,uuid,integer,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.po_reporting_source_rows(uuid,date,uuid,integer,timestamptz,uuid) to authenticated;
