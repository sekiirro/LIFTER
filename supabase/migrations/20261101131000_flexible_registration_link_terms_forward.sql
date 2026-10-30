-- Forward-only F12 implementation of the flexible installment issuer.
-- The original T051 timestamp (20261101124000) is already pushed/immutable;
-- this additive migration follows the current 20261101130000 head.
create function public.issue_flexible_registration_link(
  workspace_id uuid,
  package_version_id uuid,
  token_hash text,
  upfront_amount_minor text,
  total_payment_count integer,
  installments jsonb
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  version_row public.package_versions%rowtype;
  item jsonb;
  row_count integer := 0;
  previous_offset integer := -1;
  offset_value integer;
  total_amount numeric := 0;
  result_id uuid;
begin
  -- Keep permission and workspace checks ahead of all shape and target details.
  if auth.uid() is null or workspace_id is null
    or not app_private.has_workspace_access(workspace_id,'generate_registration_link')
    or not exists(select 1 from public.workspaces w where w.id=issue_flexible_registration_link.workspace_id) then
    raise exception 'not_permitted' using errcode='42501';
  end if;
  if not app_private.has_workspace_access(workspace_id,'configure_installment_schedule') then
    raise exception 'not_permitted' using errcode='42501';
  end if;

  if token_hash is null or token_hash !~ '^[0-9a-f]{64}$'
    or upfront_amount_minor is null or upfront_amount_minor !~ '^[0-9]+$'
    or length(ltrim(upfront_amount_minor,'0')) > 19
    or upfront_amount_minor::numeric not between 1 and 9223372036854775807
    or total_payment_count is null or total_payment_count < 1
    or installments is null or jsonb_typeof(installments) is distinct from 'array'
    or jsonb_array_length(installments) = 0 then
    raise exception 'invalid_input' using errcode='22023';
  end if;

  select * into version_row
    from public.package_versions v
    where v.workspace_id=issue_flexible_registration_link.workspace_id
      and v.id=issue_flexible_registration_link.package_version_id;
  if not found then raise exception 'not_permitted' using errcode='42501'; end if;

  for item in select value from jsonb_array_elements(installments) loop
    row_count := row_count + 1;
    if jsonb_typeof(item) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(item)) <> 3
      or not (item ?& array['seq','amount_minor','due_offset_days'])
      or jsonb_typeof(item->'seq') is distinct from 'number'
      or item->>'seq' !~ '^[0-9]+$'
      or (item->>'seq')::numeric <> row_count
      or jsonb_typeof(item->'amount_minor') is distinct from 'string'
      or item->>'amount_minor' !~ '^[0-9]+$'
      or length(ltrim(item->>'amount_minor','0')) > 19
      or (item->>'amount_minor')::numeric not between 1 and 9223372036854775807
      or jsonb_typeof(item->'due_offset_days') is distinct from 'number'
      or item->>'due_offset_days' !~ '^[0-9]+$'
      or (item->>'due_offset_days')::numeric not between 0 and 2147483647 then
      raise exception 'invalid_input' using errcode='22023';
    end if;
    offset_value := (item->>'due_offset_days')::integer;
    if offset_value <= previous_offset then
      raise exception 'invalid_input' using errcode='22023';
    end if;
    previous_offset := offset_value;
    total_amount := total_amount + (item->>'amount_minor')::numeric;
  end loop;

  if total_payment_count <> row_count
    or upfront_amount_minor::numeric <> (installments->0->>'amount_minor')::numeric
    or total_amount <> version_row.price_minor then
    raise exception 'invalid_input' using errcode='22023';
  end if;

  -- The legacy issuer owns offer locking, rate limits, current-version checks,
  -- immutable snapshots, deferred schedule checks and transactional audit.
  result_id := public.issue_registration_link(
    workspace_id, package_version_id, token_hash, installments
  );

  -- The legacy call can wait on actor/offer locks. Recheck both capabilities
  -- afterward so a revoked actor cannot commit issuance after that wait.
  if not app_private.has_workspace_access(workspace_id,'generate_registration_link')
    or not app_private.has_workspace_access(workspace_id,'configure_installment_schedule')
    or not exists(select 1 from public.workspaces w where w.id=issue_flexible_registration_link.workspace_id) then
    raise exception 'not_permitted' using errcode='42501';
  end if;
  return result_id;
end $$;

alter function public.issue_flexible_registration_link(uuid,uuid,text,text,integer,jsonb) owner to postgres;
revoke all on function public.issue_flexible_registration_link(uuid,uuid,text,text,integer,jsonb) from public,anon,service_role;
grant execute on function public.issue_flexible_registration_link(uuid,uuid,text,text,integer,jsonb) to authenticated;
