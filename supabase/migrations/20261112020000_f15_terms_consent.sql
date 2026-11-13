-- F15 T046: append-only, tenant-scoped Terms and independent marketing receipts.

create table app_private.terms_policy_versions (
  version text primary key check(version<>''),
  policy_kind text not null check(policy_kind in ('terms','marketing')),
  status text not null check(status in ('draft','published')),
  created_at timestamptz not null default clock_timestamp(),
  unique(version,policy_kind)
);
revoke all on app_private.terms_policy_versions from public,anon,authenticated,service_role;
alter table app_private.terms_policy_versions enable row level security;
alter table app_private.terms_policy_versions force row level security;

insert into app_private.terms_policy_versions(version,policy_kind,status) values
  ('f15-terms-s14-draft-2026-10-30','terms','draft'),
  ('f15-marketing-s14-draft-2026-10-30','marketing','draft');

create table app_private.terms_consent_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  policy_version text not null,
  policy_kind text not null default 'terms' check(policy_kind='terms'),
  accepted_at timestamptz not null default clock_timestamp(),
  unique(workspace_id,client_id,policy_version),
  foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete restrict,
  foreign key(policy_version,policy_kind) references app_private.terms_policy_versions(version,policy_kind) on delete restrict
);
revoke all on app_private.terms_consent_receipts from public,anon,authenticated,service_role;
alter table app_private.terms_consent_receipts enable row level security;
alter table app_private.terms_consent_receipts force row level security;

create table app_private.marketing_consent_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  policy_version text not null,
  policy_kind text not null default 'marketing' check(policy_kind='marketing'),
  accepted_at timestamptz not null default clock_timestamp(),
  unique(workspace_id,client_id,policy_version),
  foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete restrict,
  foreign key(policy_version,policy_kind) references app_private.terms_policy_versions(version,policy_kind) on delete restrict
);
revoke all on app_private.marketing_consent_receipts from public,anon,authenticated,service_role;
alter table app_private.marketing_consent_receipts enable row level security;
alter table app_private.marketing_consent_receipts force row level security;

create function app_private.prevent_consent_receipt_mutation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  raise exception 'immutable_consent_receipt' using errcode='23514';
end
$$;
revoke all on function app_private.prevent_consent_receipt_mutation() from public,anon,authenticated,service_role;
create trigger terms_policy_versions_immutable before update or delete on app_private.terms_policy_versions
  for each row execute function app_private.prevent_consent_receipt_mutation();
create trigger terms_consent_receipts_immutable before update or delete on app_private.terms_consent_receipts
  for each row execute function app_private.prevent_consent_receipt_mutation();
create trigger marketing_consent_receipts_immutable before update or delete on app_private.marketing_consent_receipts
  for each row execute function app_private.prevent_consent_receipt_mutation();

create function public.client_accept_terms(
  p_terms_policy_version text,
  p_marketing_policy_version text default null,
  p_marketing_opt_in boolean default false,
  p_client_timestamp timestamptz default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  client_row public.clients%rowtype;
  terms_receipt app_private.terms_consent_receipts%rowtype;
  marketing_receipt app_private.marketing_consent_receipts%rowtype;
  policy_status text;
  inserted boolean;
begin
  -- Establish the caller's approved-client scope before inspecting arguments.
  if auth.uid() is null then return '{"status":"invalid"}'::jsonb; end if;
  select c.* into client_row from public.clients c
    where c.auth_user_id=auth.uid() and c.approval_state='approved';
  if not found then return '{"status":"invalid"}'::jsonb; end if;

  if p_terms_policy_version is null or p_terms_policy_version='' or p_marketing_opt_in is null then
    return '{"status":"invalid"}'::jsonb;
  end if;
  select p.status into policy_status from app_private.terms_policy_versions p
    where p.version=p_terms_policy_version and p.policy_kind='terms';
  if policy_status is distinct from 'published' then
    -- DRAFT is rejected at the persistence wall in every environment; the app's
    -- production flag adds an earlier server-side gate, never a bypass here.
    return '{"status":"unavailable"}'::jsonb;
  end if;
  if p_marketing_opt_in then
    if p_marketing_policy_version is null or p_marketing_policy_version='' then
      return '{"status":"invalid"}'::jsonb;
    end if;
    select p.status into policy_status from app_private.terms_policy_versions p
      where p.version=p_marketing_policy_version and p.policy_kind='marketing';
    if policy_status is distinct from 'published' then
      return '{"status":"unavailable"}'::jsonb;
    end if;
  elsif p_marketing_policy_version is not null then
    return '{"status":"invalid"}'::jsonb;
  end if;

  -- p_client_timestamp is deliberately ignored. The receipt uses database time.
  insert into app_private.terms_consent_receipts(workspace_id,client_id,policy_version)
    values(client_row.workspace_id,client_row.id,p_terms_policy_version)
    on conflict(workspace_id,client_id,policy_version) do nothing
    returning * into terms_receipt;
  inserted:=found;
  if not inserted then
    select r.* into terms_receipt from app_private.terms_consent_receipts r
      where r.workspace_id=client_row.workspace_id and r.client_id=client_row.id
        and r.policy_version=p_terms_policy_version;
  else
    insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
      values(auth.uid(),'client.terms_accepted','terms_consent_receipts',terms_receipt.id,client_row.workspace_id,
        jsonb_build_object('policy_version',p_terms_policy_version));
  end if;

  if p_marketing_opt_in then
    insert into app_private.marketing_consent_receipts(workspace_id,client_id,policy_version)
      values(client_row.workspace_id,client_row.id,p_marketing_policy_version)
      on conflict(workspace_id,client_id,policy_version) do nothing
      returning * into marketing_receipt;
    if found then
      insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
        values(auth.uid(),'client.marketing_consent_recorded','marketing_consent_receipts',marketing_receipt.id,client_row.workspace_id,
          jsonb_build_object('policy_version',p_marketing_policy_version));
    end if;
  end if;

  return jsonb_build_object('status','accepted','policy_version',terms_receipt.policy_version,'accepted_at',terms_receipt.accepted_at);
exception when others then
  return '{"status":"unavailable"}'::jsonb;
end
$$;
alter function public.client_accept_terms(text,text,boolean,timestamptz) owner to postgres;
revoke all on function public.client_accept_terms(text,text,boolean,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.client_accept_terms(text,text,boolean,timestamptz) to authenticated;

create function public.client_has_accepted_terms(p_policy_version text) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.clients c join app_private.terms_consent_receipts r
      on r.workspace_id=c.workspace_id and r.client_id=c.id
    where c.auth_user_id=auth.uid() and c.approval_state='approved'
      and r.policy_version=p_policy_version)
$$;
alter function public.client_has_accepted_terms(text) owner to postgres;
revoke all on function public.client_has_accepted_terms(text) from public,anon,authenticated,service_role;
grant execute on function public.client_has_accepted_terms(text) to authenticated;
