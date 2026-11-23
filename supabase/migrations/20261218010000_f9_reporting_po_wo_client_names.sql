create or replace function public.package_monthly_collections(workspace_id uuid,month_start date)
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
    select e.id,e.workspace_id,e.subscription_id,e.kind,e.amount_minor,e.currency,e.commission_minor,
      e.recorded_at,e.effective_on,e.obligation_id,s.client_id,c.name client_name,v.offer_id,o.package_id,
      fx.status fx_status,fx.provider_key,fx.rate,fx.publication_date,fx.exact_egp_minor,
      case when e.currency='EGP' then e.amount_minor::numeric
        when fx.status='ready' then fx.exact_egp_minor else null end converted_exact
    from public.payment_events e
    join public.subscriptions s on s.workspace_id=e.workspace_id and s.id=e.subscription_id
    left join public.clients c on c.workspace_id=s.workspace_id and c.id=s.client_id
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
      'event_id',id,'subscription_id',subscription_id,'client_id',client_id,'client_name',client_name,'package_id',package_id,
      'kind',kind,'amount_minor',amount_minor::text,'currency',currency,
      'recorded_at',recorded_at,
      'fx',case when currency='EGP' then jsonb_build_object('status','ready','provider',null,'rate','1','publication_date',null)
        when fx_status='ready' then jsonb_build_object('status','ready','provider',provider_key,'rate',rate::text,'publication_date',publication_date)
        else jsonb_build_object('status','pending') end,
      'converted_egp_exact',converted_exact::text
    ) order by recorded_at,id) from source where kind='collection'),'[]'::jsonb),
    'accounting_events',coalesce((select jsonb_agg(jsonb_build_object(
      'event_id',id,'subscription_id',subscription_id,'client_id',client_id,'client_name',client_name,'package_id',package_id,
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

create or replace function public.package_installment_report(workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or app_private.current_staff_role() is null then
    raise exception 'not_permitted' using errcode='42501';
  end if;
  if app_private.current_staff_role() not in ('platform_owner','workspace_owner')
    or not app_private.has_workspace_access(workspace_id,null) then return jsonb_build_object('status','not_permitted'); end if;
  with rows as (
    select s.id subscription_id,s.client_id,c.name client_name,o.package_id,s.currency,i.id installment_id,i.seq,
      i.amount_minor,i.issued_day_offset,i.source_kind,
      case when i.source_kind='renewal_schedule' then i.due_on
        when i.seq=1 or a.activated_at is null then null
        else ((a.activated_at at time zone 'Africa/Cairo')::date+i.issued_day_offset) end due_on,
      coalesce(t.kind='collection',false) paid,
      case when coalesce(t.kind='collection',false) then t.amount_minor else 0 end paid_minor,
      count(*) over(partition by s.workspace_id,s.id)>1 is_installment_client
    from public.subscriptions s
    left join public.clients c on c.workspace_id=s.workspace_id and c.id=s.client_id
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
    'subscription_id',subscription_id,'client_id',client_id,'client_name',client_name,'package_id',package_id,
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
