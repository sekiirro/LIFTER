-- F12 U5: role-separated, workspace-scoped read projections and client self-status.
create function app_private.f12_u5_authorized(ws uuid, capability text, po_wo_only boolean default false)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare actor_role public.staff_role;
begin
  if auth.uid() is null or not exists(select 1 from public.workspaces w where w.id=ws) then return false; end if;
  select s.role into actor_role from public.staff_profiles s where s.user_id=auth.uid();
  if not found or (po_wo_only and actor_role not in ('platform_owner','workspace_owner'))
    or not app_private.role_has_capability(actor_role,capability)
    or not app_private.has_workspace_access(ws,capability) then return false; end if;
  if actor_role='platform_owner' then return true; end if;
  return exists(select 1 from public.workspace_memberships m where m.workspace_id=ws and m.user_id=auth.uid() and m.revoked_at is null);
end $$;

create function app_private.client_has_access(ws uuid, cid uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.clients c
    where c.workspace_id=ws and c.id=cid and c.auth_user_id=auth.uid() and c.approval_state='approved')
$$;

create function public.client_self_status()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((select jsonb_build_object('status','ok','approval_state',c.approval_state)
    from public.clients c where c.auth_user_id=auth.uid()),jsonb_build_object('status','not_permitted'))
$$;

create function public.registration_approval_queue(workspace_id uuid, cursor_id uuid default null, page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; next_id uuid; more boolean;
begin
  if not app_private.f12_u5_authorized(workspace_id,'approve_registration') then return jsonb_build_object('status','not_permitted'); end if;
  if page_size is null or page_size<1 or page_size>100 then return jsonb_build_object('status','invalid_input'); end if;
  with candidates as (
    select c.id,c.name,c.created_at,c.approval_state,v.name_en as version_label,l.price_minor,l.currency
    from public.clients c join public.registration_links l on l.workspace_id=c.workspace_id and l.id=c.registration_link_id
    join public.package_versions v on v.workspace_id=l.workspace_id and v.id=l.package_version_id
    where c.workspace_id=registration_approval_queue.workspace_id and c.approval_state in ('pending-approval','approved','rejected')
      and (registration_approval_queue.cursor_id is null or (c.created_at,c.id)>(select x.created_at,x.id from public.clients x where x.id=registration_approval_queue.cursor_id and x.workspace_id=registration_approval_queue.workspace_id))
    order by c.created_at,c.id limit registration_approval_queue.page_size+1
  ), numbered as (
    select row_number() over(order by c.created_at,c.id) as rn,c.* from candidates c
  )
  select coalesce(jsonb_agg(jsonb_build_object('client_id',q.id,'name',q.name,'signup_time',q.created_at,
      'approval_state',q.approval_state,'offer_version_label',q.version_label,'price_minor',q.price_minor::text,'currency',q.currency) order by q.rn)
      filter(where q.rn<=registration_approval_queue.page_size),'[]'::jsonb),
    count(*)>registration_approval_queue.page_size,
    (array_agg(q.id order by q.rn) filter(where q.rn<=registration_approval_queue.page_size))[registration_approval_queue.page_size]
    into result,more,next_id from numbered q;
  return jsonb_build_object('status','ok','items',result,'next_cursor',case when more then next_id else null end);
end $$;

create function public.registration_approval_review(workspace_id uuid, client_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not app_private.f12_u5_authorized(workspace_id,'approve_registration') then return jsonb_build_object('status','not_permitted'); end if;
  select jsonb_build_object('client_id',c.id,'name',c.name,'signup_time',c.created_at,'approval_state',c.approval_state,
    'offer_version_label',v.name_en,'price_minor',l.price_minor::text,'currency',l.currency,
    'installments',coalesce((select jsonb_agg(jsonb_build_object('seq',i.seq,'amount_minor',i.amount_minor::text,'currency',l.currency,'issued_day_offset',i.due_offset_days) order by i.seq)
      from public.registration_link_installments i where i.workspace_id=registration_approval_review.workspace_id and i.link_id=l.id),jsonb_build_array(jsonb_build_object('seq',1,'amount_minor',l.price_minor::text,'currency',l.currency,'issued_day_offset',0))))
  into result from public.clients c join public.registration_links l on l.workspace_id=c.workspace_id and l.id=c.registration_link_id
    join public.package_versions v on v.workspace_id=l.workspace_id and v.id=l.package_version_id
    where c.workspace_id=registration_approval_review.workspace_id and c.id=registration_approval_review.client_id;
  if result is null then return jsonb_build_object('status','not_permitted'); end if;
  return jsonb_build_object('status','ok','item',result);
end $$;

create function public.workspace_payment_queue(workspace_id uuid, cursor_id uuid default null, page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; next_id uuid; more boolean;
begin
  if not app_private.f12_u5_authorized(workspace_id,'record_payment') then return jsonb_build_object('status','not_permitted'); end if;
  if page_size is null or page_size<1 or page_size>100 then return jsonb_build_object('status','invalid_input'); end if;
  with candidates as (
    select c.id as client_id,s.id as subscription_id,c.name,c.approval_state,s.price_minor,s.currency,
      coalesce(sum(i.amount_minor) filter(where tail.kind is distinct from 'collection'),0)::bigint as unpaid_minor
    from public.clients c join public.subscriptions s on s.workspace_id=c.workspace_id and s.client_id=c.id
    join public.subscription_installments i on i.workspace_id=s.workspace_id and i.subscription_id=s.id
    left join lateral (select e.kind from public.payment_events e where e.workspace_id=i.workspace_id and e.obligation_id=i.id order by e.revision desc limit 1) tail on true
    where c.workspace_id=workspace_payment_queue.workspace_id and c.approval_state='approved'
      and (workspace_payment_queue.cursor_id is null or s.id>workspace_payment_queue.cursor_id)
    group by c.id,s.id order by s.id limit workspace_payment_queue.page_size+1
  ), numbered as (
    select row_number() over(order by q.subscription_id) as rn,q.* from candidates q
  )
  select coalesce(jsonb_agg(jsonb_build_object('client_id',q.client_id,'subscription_id',q.subscription_id,'name',q.name,
      'approval_state',q.approval_state,'price_minor',q.price_minor::text,'currency',q.currency,'unpaid_minor',q.unpaid_minor::text) order by q.rn)
      filter(where q.rn<=workspace_payment_queue.page_size),'[]'::jsonb),
    count(*)>workspace_payment_queue.page_size,
    (array_agg(q.subscription_id order by q.rn) filter(where q.rn<=workspace_payment_queue.page_size))[workspace_payment_queue.page_size]
    into result,more,next_id from numbered q;
  return jsonb_build_object('status','ok','items',result,'next_cursor',case when more then next_id else null end);
end $$;

create function public.subscription_payment_status(workspace_id uuid, client_id uuid, subscription_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not app_private.f12_u5_authorized(workspace_id,'record_payment') then return jsonb_build_object('status','not_permitted'); end if;
  select jsonb_agg(jsonb_build_object('obligation_id',i.id,'seq',i.seq,'amount_minor',i.amount_minor::text,'currency',i.currency,
    'revision',coalesce(t.revision,0),'tail_event_id',t.id,'kind',t.kind,'paid',t.kind='collection',
    'due_on',case when i.seq=1 or a.activated_at is null then null else ((a.activated_at at time zone 'Africa/Cairo')::date+i.issued_day_offset) end,
    'collected_on',t.collected_on,'effective_on',t.effective_on,'recorded_by',t.recorded_by) order by i.seq)
  into result from public.clients c join public.subscriptions s on s.workspace_id=c.workspace_id and s.client_id=c.id
    join public.subscription_installments i on i.workspace_id=s.workspace_id and i.subscription_id=s.id
    left join public.subscription_activations a on a.workspace_id=s.workspace_id and a.subscription_id=s.id
    left join lateral (select e.* from public.payment_events e where e.workspace_id=i.workspace_id and e.obligation_id=i.id order by e.revision desc limit 1) t on true
    where c.workspace_id=subscription_payment_status.workspace_id and c.id=subscription_payment_status.client_id
      and s.id=subscription_payment_status.subscription_id;
  if result is null then return jsonb_build_object('status','not_permitted'); end if;
  return jsonb_build_object('status','ok','obligations',result);
end $$;

create function public.subscription_commission(workspace_id uuid, subscription_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not app_private.f12_u5_authorized(workspace_id,'record_payment',true) then return jsonb_build_object('status','not_permitted'); end if;
  select jsonb_agg(jsonb_build_object('event_id',e.id,'installment_seq',e.installment_seq,'revision',e.revision,
    'kind',e.kind,'rate_bp',s.commission_rate_bp,'commission_minor',e.commission_minor::text,'reverses_event_id',e.reverses_event_id) order by e.installment_seq,e.revision)
  into result from public.payment_events e join public.subscriptions s on s.workspace_id=e.workspace_id and s.id=e.subscription_id
    where e.workspace_id=subscription_commission.workspace_id and e.subscription_id=subscription_commission.subscription_id;
  if result is null then return jsonb_build_object('status','not_permitted'); end if;
  return jsonb_build_object('status','ok','events',result);
end $$;

alter function app_private.f12_u5_authorized(uuid,text,boolean) owner to postgres;
alter function app_private.client_has_access(uuid,uuid) owner to postgres;
alter function public.client_self_status() owner to postgres;
alter function public.registration_approval_queue(uuid,uuid,integer) owner to postgres;
alter function public.registration_approval_review(uuid,uuid) owner to postgres;
alter function public.workspace_payment_queue(uuid,uuid,integer) owner to postgres;
alter function public.subscription_payment_status(uuid,uuid,uuid) owner to postgres;
alter function public.subscription_commission(uuid,uuid) owner to postgres;

revoke all on function app_private.f12_u5_authorized(uuid,text,boolean),app_private.client_has_access(uuid,uuid),
  public.client_self_status(),public.registration_approval_queue(uuid,uuid,integer),public.registration_approval_review(uuid,uuid),
  public.workspace_payment_queue(uuid,uuid,integer),public.subscription_payment_status(uuid,uuid,uuid),public.subscription_commission(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.client_self_status(),public.registration_approval_queue(uuid,uuid,integer),
  public.registration_approval_review(uuid,uuid),public.workspace_payment_queue(uuid,uuid,integer),
  public.subscription_payment_status(uuid,uuid,uuid),public.subscription_commission(uuid,uuid) to authenticated;
