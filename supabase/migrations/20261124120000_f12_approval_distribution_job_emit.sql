-- F12 T056 (FR-022): emit one durable client.distribution job inside the
-- approval/reconsideration purchase transaction without changing the approval
-- fact schema or committed 20261101121000 migration.
create or replace function app_private.f12_u3_purchase(
  ws uuid,
  cid uuid,
  opid uuid,
  issued_link uuid,
  kind text,
  collected date,
  recorded timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l public.registration_links%rowtype;
  sid uuid := gen_random_uuid();
  eid uuid := gen_random_uuid();
  aid uuid;
  first public.subscription_installments%rowtype;
begin
  -- Read the immutable committed binding. Do not revalidate link lifetime,
  -- consumption, offer availability or the current package version.
  select r.* into strict l from public.clients c join public.registration_links r
    on r.workspace_id = c.workspace_id and r.id = c.registration_link_id and r.package_version_id = c.package_version_id
    where c.workspace_id = ws and c.id = cid and r.id = issued_link;
  insert into app_private.registration_decisions(workspace_id, client_id, operation_id, actor_user_id, kind, from_state, to_state)
    values (ws, cid, opid, auth.uid(), kind, case when kind = 'reconsider' then 'rejected' else 'pending-approval' end, 'approved');
  insert into public.subscriptions(id, workspace_id, client_id, registration_link_id, package_version_id, price_minor, currency, commission_rate_bp, duration_days, duration_months, created_by)
    values (sid, ws, cid, l.id, l.package_version_id, l.price_minor, l.currency, l.commission_rate_bp, l.duration_days, l.duration_months, auth.uid());
  if exists(select 1 from public.registration_link_installments i where i.workspace_id = ws and i.link_id = l.id) then
    insert into public.subscription_installments(workspace_id, subscription_id, seq, amount_minor, currency, issued_day_offset, source_kind)
      select ws, sid, i.seq, i.amount_minor, l.currency, i.due_offset_days, 'issued_schedule'
      from public.registration_link_installments i where i.workspace_id = ws and i.link_id = l.id order by i.seq;
  else
    insert into public.subscription_installments(workspace_id, subscription_id, seq, amount_minor, currency, issued_day_offset, source_kind)
      values (ws, sid, 1, l.price_minor, l.currency, 0, 'single_payment');
  end if;
  select * into strict first from public.subscription_installments i where i.workspace_id = ws and i.subscription_id = sid and i.seq = 1;
  insert into public.payment_events(id, workspace_id, subscription_id, obligation_id, installment_seq, revision, kind, amount_minor, currency, commission_minor, collected_on, effective_on, recorded_by, recorded_at, operation_id)
    values (eid, ws, sid, first.id, 1, 1, 'collection', first.amount_minor, l.currency, app_private.f12_commission_minor(first.amount_minor, l.commission_rate_bp), collected, collected, auth.uid(), recorded, opid);
  insert into app_private.registration_approval_events(workspace_id, client_id, subscription_id, approved_at)
    values (ws, cid, sid, recorded)
    returning id into aid;
  perform app_private.enqueue_client_trainer_distribution_job(ws, cid, aid);
  update public.clients set approval_state = 'approved' where workspace_id = ws and id = cid;
  return jsonb_build_object(
    'id', opid,
    'operation', kind,
    'workspace_id', ws,
    'client_id', cid,
    'subscription_id', sid,
    'obligation_id', first.id,
    'event_id', eid,
    'installment_seq', 1,
    'revision', 1,
    'outcome', 'approved',
    'amount_minor', first.amount_minor::text,
    'currency', l.currency,
    'collected_on', collected,
    'recorded_at', recorded
  );
end $$;
alter function app_private.f12_u3_purchase(uuid, uuid, uuid, uuid, text, date, timestamptz) owner to postgres;
revoke all on function app_private.f12_u3_purchase(uuid, uuid, uuid, uuid, text, date, timestamptz)
  from public, anon, authenticated, service_role;
