create or replace function public.save_package_reporting_fx_snapshot(
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
      p_workspace_id,p_payment_event_id,next_status,ev.currency,provider,rate_value,p_publication_date,
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