-- F12 T035 ambiguity policy: if a client has more than one valid approval
-- event/subscription pair, return the fixed generic {status:"unavailable"}
-- result. Do not select one arbitrarily or reveal identifiers/counts.
create or replace function public.registration_approval_correction(
  workspace_id uuid,
  client_id uuid
)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  approval_count bigint;
  target_subscription uuid;
  correction_rows jsonb;
begin
  if not app_private.f12_u5_authorized(workspace_id,'approve_registration')
    or not exists (
      select 1 from public.staff_profiles p
      where p.user_id=auth.uid() and p.role='platform_owner'
    ) then
    return jsonb_build_object('status','not_permitted');
  end if;

  select count(*) into approval_count
  from app_private.registration_approval_events a
  join public.subscriptions s
    on s.workspace_id=a.workspace_id and s.id=a.subscription_id and s.client_id=a.client_id
  where a.workspace_id=registration_approval_correction.workspace_id
    and a.client_id=registration_approval_correction.client_id;

  if approval_count > 1 then
    return jsonb_build_object('status','unavailable');
  end if;

  if approval_count = 1 then
    select s.id into target_subscription
    from app_private.registration_approval_events a
    join public.subscriptions s
      on s.workspace_id=a.workspace_id and s.id=a.subscription_id and s.client_id=a.client_id
    where a.workspace_id=registration_approval_correction.workspace_id
      and a.client_id=registration_approval_correction.client_id;
  end if;

  if target_subscription is null then
    if not exists (
      select 1 from public.clients c
      where c.workspace_id=registration_approval_correction.workspace_id
        and c.id=registration_approval_correction.client_id
    ) then
      return jsonb_build_object('status','not_permitted');
    end if;
    return jsonb_build_object(
      'status','ok',
      'subscription_id',null,
      'corrections','{}'::jsonb
    );
  end if;

  select coalesce(
    jsonb_object_agg(
      i.seq::text,
      jsonb_build_object(
        'obligation_id',i.id,
        'revision',tail.revision,
        'tail_event_id',tail.id
      ) order by i.seq
    ),
    '{}'::jsonb
  ) into correction_rows
  from public.subscription_installments i
  join lateral (
    select e.id,e.revision,e.kind
    from public.payment_events e
    where e.workspace_id=i.workspace_id and e.obligation_id=i.id
    order by e.revision desc
    limit 1
  ) tail on tail.kind='collection'
  where i.workspace_id=registration_approval_correction.workspace_id
    and i.subscription_id=target_subscription;

  return jsonb_build_object(
    'status','ok',
    'subscription_id',target_subscription,
    'corrections',correction_rows
  );
end $$;

alter function public.registration_approval_correction(uuid,uuid) owner to postgres;
revoke all on function public.registration_approval_correction(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.registration_approval_correction(uuid,uuid)
  to authenticated;
