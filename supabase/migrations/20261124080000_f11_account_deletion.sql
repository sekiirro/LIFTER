-- F11 T048: Account deletion guarded release & restricted continuation (S64-R46, S64-R21, S64-R44, S56-R12, S57-PO-1).
-- Forward-only migration: step-0 durable intent table, client deletion_state lifecycle,
-- both-wall denial from step (0) onward, f12_guard_client_transition() forward amendment,
-- sync_account_identifier_claims() step (C) preservation, F12/F13 stale_state guards,
-- assignment S56-R12/S57-PO-1/ended_by_system fixes, and lease-verified service_role wrappers.

-- 1. Extend public.clients for the F11 deletion lifecycle (S41-PO-1 MCQ-14 = B).
alter table public.clients
  add column deletion_state text not null default 'active'
    check (deletion_state in ('active', 'deletion_pending', 'release_pending', 'released')),
  alter column email_normalized drop not null,
  alter column phone_e164 drop not null,
  alter column name drop not null,
  add constraint clients_deletion_released_fields_check check (
    (deletion_state = 'released'
      and email_normalized is null
      and phone_e164 is null
      and name is null
      and date_of_birth is null
      and username_normalized is null
      and telegram_username is null)
    or (deletion_state in ('active', 'deletion_pending', 'release_pending')
      and email_normalized is not null
      and phone_e164 is not null
      and name is not null)
  );

-- 2. Durable step-0 deletion intent table (owned solely by T048; S64-R46(1)).
create table app_private.account_deletion_intents (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null unique references auth.users(id) on delete restrict,
  target_kind text not null check (target_kind in ('client', 'staff')),
  client_id uuid references public.clients(id) on delete restrict,
  workspace_id uuid references public.workspaces(id) on delete restrict,
  authorized_by_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  authorized_capability text not null check (authorized_capability in ('delete_client', 'manage_staff_access')),
  financial_confirmation_audit_id bigint,
  financial_confirmation_consumed_at timestamptz,
  state text not null default 'pending_ban'
    check (state in ('pending_ban', 'banned_pending_db', 'release_pending', 'auth_release_in_progress', 'completed')),
  lease_token uuid,
  lease_expires_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error_code text check (
    last_error_code is null or last_error_code in (
      'provider_unavailable', 'auth_admin_unavailable', 'metadata_not_empty', 'step_b_failed', 'step_d_failed'
    )
  ),
  created_at timestamptz not null default now(),
  banned_at timestamptz,
  db_released_at timestamptz,
  auth_released_at timestamptz,
  completed_at timestamptz,
  check (
    (target_kind = 'client' and client_id is not null and workspace_id is not null and authorized_capability = 'delete_client')
    or (target_kind = 'staff' and client_id is null and workspace_id is null and authorized_capability = 'manage_staff_access')
  ),
  check (financial_confirmation_consumed_at is null or (financial_confirmation_audit_id is not null and state = 'completed')),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id) on delete restrict
);

create unique index account_deletion_intents_financial_confirmation_unique
  on app_private.account_deletion_intents (financial_confirmation_audit_id)
  where financial_confirmation_audit_id is not null;

create index account_deletion_intents_due_idx
  on app_private.account_deletion_intents (next_attempt_at, created_at, id)
  where state <> 'completed';

alter table app_private.account_deletion_intents owner to postgres;
revoke all on app_private.account_deletion_intents from public, anon, authenticated, service_role;
alter table app_private.account_deletion_intents enable row level security;
alter table app_private.account_deletion_intents force row level security;

create trigger account_deletion_intents_no_delete
  before delete on app_private.account_deletion_intents
  for each row execute function app_private.forbid_delete();
create trigger account_deletion_intents_no_truncate
  before truncate on app_private.account_deletion_intents
  for each statement execute function app_private.forbid_delete();

create function app_private.deletion_guard_intent_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id
    or new.target_user_id is distinct from old.target_user_id
    or new.target_kind is distinct from old.target_kind
    or new.client_id is distinct from old.client_id
    or new.workspace_id is distinct from old.workspace_id
    or new.authorized_by_user_id is distinct from old.authorized_by_user_id
    or new.authorized_capability is distinct from old.authorized_capability
    or new.financial_confirmation_audit_id is distinct from old.financial_confirmation_audit_id
    or new.created_at is distinct from old.created_at then
    raise exception 'account_deletion_intent_immutable' using errcode = '23514';
  end if;

  if old.state = 'completed' then
    raise exception 'account_deletion_intent_completed' using errcode = '23514';
  end if;

  if new.state is distinct from old.state then
    if not (
      (old.state = 'pending_ban' and new.state = 'banned_pending_db')
      or (old.state = 'banned_pending_db' and new.state = 'release_pending')
      or (old.state = 'release_pending' and new.state = 'auth_release_in_progress')
      or (old.state = 'auth_release_in_progress' and new.state = 'completed')
    ) then
      raise exception 'invalid_deletion_intent_state_transition' using errcode = '23514';
    end if;
  end if;

  return new;
end $$;
alter function app_private.deletion_guard_intent_update() owner to postgres;
revoke all on function app_private.deletion_guard_intent_update() from public, anon, authenticated, service_role;
create trigger account_deletion_intents_guard_update
  before update on app_private.account_deletion_intents
  for each row execute function app_private.deletion_guard_intent_update();

-- 3. Drop legacy unnamed check (ended_at is null) = (ended_by is null) and ensure
--    ended_by_system / source_deletion_intent_id columns + constraints exist (S64-R44, S64-R46(3)).
do $$
declare c_name text;
begin
  for c_name in
    select conname
    from pg_constraint
    where conrelid = 'public.client_trainer_assignments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ~* '\(ended_at\s+is\s+null\)\s*=\s*\(ended_by\s+is\s+null\)'
  loop
    execute format('alter table public.client_trainer_assignments drop constraint %I', c_name);
  end loop;
end $$;

alter table public.client_trainer_assignments
  drop constraint if exists client_trainer_assignments_assignment_source_check,
  drop constraint if exists client_trainer_assignments_source_check,
  drop constraint if exists client_trainer_assignments_end_actor_check,
  alter column assigned_by drop not null,
  add column if not exists source_approval_id uuid,
  add column if not exists source_deletion_intent_id uuid,
  add column if not exists ended_by_system boolean not null default false,
  add constraint client_trainer_assignments_source_check check (
    (assignment_source = 'po_manual' and assigned_by is not null
      and source_approval_id is null and source_deletion_intent_id is null)
    or (assignment_source = 'system_distribution' and assigned_by is null
      and source_approval_id is not null and source_deletion_intent_id is null)
    or (assignment_source = 'trainer_deletion' and assigned_by is null
      and source_approval_id is null and source_deletion_intent_id is not null)
  ),
  add constraint client_trainer_assignments_end_actor_check check (
    (ended_at is null and ended_by is null and not ended_by_system)
    or (ended_at is not null and ((ended_by is not null) <> ended_by_system))
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.client_trainer_assignments'::regclass
      and confrelid = 'app_private.account_deletion_intents'::regclass
  ) then
    alter table public.client_trainer_assignments
      add constraint client_trainer_assignments_deletion_intent_fk
      foreign key (source_deletion_intent_id)
      references app_private.account_deletion_intents(id) on delete restrict;
  end if;
end $$;

create or replace function app_private.guard_client_trainer_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and (
      new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id
      or new.client_id is distinct from old.client_id or new.trainer_user_id is distinct from old.trainer_user_id
      or new.assignment_source is distinct from old.assignment_source or new.assigned_by is distinct from old.assigned_by
      or new.assigned_at is distinct from old.assigned_at
      or new.workspace_membership_id is distinct from old.workspace_membership_id
      or new.source_approval_id is distinct from old.source_approval_id
      or new.source_deletion_intent_id is distinct from old.source_deletion_intent_id
      or old.ended_at is not null or new.ended_at is null
      or ((new.ended_by is not null) = new.ended_by_system))) then
    raise exception 'client_trainer_assignment_immutable' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    new.ended_at := coalesce(new.ended_at, statement_timestamp());
  end if;
  return new;
end $$;
alter function app_private.guard_client_trainer_assignment() owner to postgres;
revoke all on function app_private.guard_client_trainer_assignment() from public, anon, authenticated, service_role;

-- 4. Proof helpers & FR-025 validators.
create function app_private.deletion_transition_proof(p_intent_id uuid, p_next_state text) returns text
language sql volatile security definer set search_path = '' as $$
  select encode(
    extensions.hmac(
      convert_to('f11.deletion.client:' || pg_current_xact_id()::text || ':' || p_intent_id::text || ':' || p_next_state, 'UTF8'),
      decode(s.decrypted_secret, 'hex'),
      'sha256'
    ),
    'hex'
  )
  from vault.decrypted_secrets s where s.name = 'SIGNUP_ATTEST_KEY'
$$;
alter function app_private.deletion_transition_proof(uuid, text) owner to postgres;
revoke all on function app_private.deletion_transition_proof(uuid, text) from public, anon, authenticated, service_role;

create function app_private.deletion_claim_release_proof(p_intent_id uuid) returns text
language sql volatile security definer set search_path = '' as $$
  select encode(
    extensions.hmac(
      convert_to('f11.deletion.claims:' || pg_current_xact_id()::text || ':' || p_intent_id::text, 'UTF8'),
      decode(s.decrypted_secret, 'hex'),
      'sha256'
    ),
    'hex'
  )
  from vault.decrypted_secrets s where s.name = 'SIGNUP_ATTEST_KEY'
$$;
alter function app_private.deletion_claim_release_proof(uuid) owner to postgres;
revoke all on function app_private.deletion_claim_release_proof(uuid) from public, anon, authenticated, service_role;

create function app_private.deletion_financial_confirmation_valid(p_category text, p_acknowledgement text) returns boolean
language sql immutable security definer set search_path = '' as $$
  select p_category in ('refunded_outside_lifter', 'forfeited_under_contract', 'other')
    and p_acknowledgement in (
      'I understand this only records the financial resolution. It does not process a refund, collect a payment, or cancel any subscription or debt.',
      'أنا فاهم إن ده مجرد تسجيل للتسوية المالية، ومش معناه إن ليفتر رجّع أي فلوس، أو حصّل أي مبالغ، أو ألغى أي اشتراكات أو مستحقات.'
    );
$$;
alter function app_private.deletion_financial_confirmation_valid(text, text) owner to postgres;
revoke all on function app_private.deletion_financial_confirmation_valid(text, text) from public, anon, authenticated, service_role;

-- 5. Both-wall access denial from step (0) onward (FR-018, plan P-S40-1).
create function app_private.deletion_actor_is_denied() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is null or exists (
    select 1 from app_private.account_deletion_intents i
    where i.target_user_id = auth.uid()
  );
$$;
alter function app_private.deletion_actor_is_denied() owner to postgres;
revoke all on function app_private.deletion_actor_is_denied() from public, anon, service_role;
grant execute on function app_private.deletion_actor_is_denied() to authenticated;

create or replace function app_private.current_staff_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select s.role
  from public.staff_profiles s
  where s.user_id = auth.uid()
    and not exists (
      select 1 from app_private.account_deletion_intents i
      where i.target_user_id = s.user_id
    );
$$;
alter function app_private.current_staff_role() owner to postgres;
revoke all on function app_private.current_staff_role() from public, anon, service_role;
grant execute on function app_private.current_staff_role() to authenticated;

drop policy staff_profiles_select_self on public.staff_profiles;
create policy staff_profiles_select_self on public.staff_profiles for select to authenticated
  using (
    (user_id = (select auth.uid()) and not app_private.deletion_actor_is_denied())
    or app_private.is_platform_owner()
  );

drop policy workspace_memberships_select_self on public.workspace_memberships;
create policy workspace_memberships_select_self on public.workspace_memberships for select to authenticated
  using (
    (user_id = (select auth.uid()) and not app_private.deletion_actor_is_denied())
    or app_private.is_platform_owner()
  );

create or replace function app_private.f12_actor_allowed(ws uuid, cap text, po_only boolean) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare actor_role public.staff_role;
begin
  if auth.uid() is null
    or exists (select 1 from app_private.account_deletion_intents i where i.target_user_id = auth.uid())
    or not exists (select 1 from public.workspaces w where w.id = ws) then
    return false;
  end if;
  select s.role into actor_role from public.staff_profiles s where s.user_id = auth.uid() for share;
  if not found or (po_only and actor_role <> 'platform_owner') or not app_private.role_has_capability(actor_role, cap) then
    return false;
  end if;
  if actor_role = 'platform_owner' then return true; end if;
  perform 1 from public.workspace_memberships m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.revoked_at is null for share;
  return found;
end $$;

create or replace function app_private.f13_actor_preflight(ws uuid, cap text, po_only boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and not exists (select 1 from app_private.account_deletion_intents i where i.target_user_id = auth.uid())
    and exists (
      select 1 from public.workspaces w
      join public.staff_profiles p on p.user_id = auth.uid()
      where w.id = ws and (not po_only or p.role = 'platform_owner')
        and app_private.role_has_capability(p.role, cap)
        and (p.role = 'platform_owner' or exists (
          select 1 from public.workspace_memberships m
          where m.workspace_id = ws and m.user_id = auth.uid() and m.revoked_at is null
        ))
    );
$$;

create or replace function public.f3_workspace_owner_roster(p_workspace_id uuid)
returns table (
  user_id uuid,
  role public.staff_role,
  workspace_id uuid,
  granted_at timestamptz,
  revoked_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select member.user_id, profile.role, member.workspace_id,
         member.granted_at, member.revoked_at
  from public.workspace_memberships as member
  join public.staff_profiles as profile on profile.user_id = member.user_id
  where member.workspace_id = p_workspace_id
    and member.revoked_at is null
    and not exists (
      select 1 from app_private.account_deletion_intents di
      where di.target_user_id = member.user_id
    )
    and exists (
      select 1
      from public.staff_profiles as actor_profile
      join public.workspace_memberships as actor_membership
        on actor_membership.user_id = actor_profile.user_id
      where actor_profile.user_id = auth.uid()
        and actor_profile.role = 'workspace_owner'::public.staff_role
        and actor_membership.workspace_id = p_workspace_id
        and actor_membership.revoked_at is null
        and not exists (
          select 1 from app_private.account_deletion_intents ai
          where ai.target_user_id = actor_profile.user_id
        )
    );
$$;

create or replace function app_private.client_has_access(ws uuid, cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.clients c
    where c.workspace_id = ws and c.id = cid and c.auth_user_id = auth.uid()
      and c.approval_state = 'approved' and c.deactivated_at is null and c.deletion_state = 'active'
  );
$$;

create or replace function public.client_self_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case when c.deactivated_at is null and c.deletion_state = 'active'
      then jsonb_build_object('status', 'ok', 'approval_state', c.approval_state)
      else jsonb_build_object('status', 'not_permitted') end
    from public.clients c where c.auth_user_id = auth.uid()
  ), jsonb_build_object('status', 'not_permitted'));
$$;

create or replace function public.client_plan_projection() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare client_row public.clients%rowtype; result jsonb; active_count integer;
begin
  if auth.uid() is null then return jsonb_build_object('status', 'invalid'); end if;
  select * into client_row from public.clients c
    where c.auth_user_id = auth.uid() and c.approval_state = 'approved'
      and c.deactivated_at is null and c.deletion_state = 'active';
  if not found or (select count(*) from public.clients c where c.auth_user_id = auth.uid() and c.approval_state = 'approved') <> 1
    then return jsonb_build_object('status', 'invalid'); end if;
  select count(distinct app_private.f19_resolve_subscription_id(s.workspace_id, s.id))::integer into active_count
    from public.subscriptions s cross join lateral app_private.f13_project_entitlement(s.workspace_id, s.id,
      (statement_timestamp() at time zone 'Africa/Cairo')::date) as e(value)
    where s.workspace_id = client_row.workspace_id and s.client_id = client_row.id and e.value->>'status' in ('active', 'frozen');
  if active_count <> 1 then return jsonb_build_object('status', 'invalid'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('plan_id', x.plan_id, 'plan_kind', x.plan_kind,
    'revision_number', x.revision_number, 'published_at', x.published_at, 'content', x.content)
    order by x.plan_kind, x.plan_id), '[]'::jsonb) into result from (
      select distinct on (d.plan_id) d.plan_id, d.plan_kind, r.revision_number, r.published_at, r.content
      from public.plan_deliveries d join public.plan_revisions r
        on r.workspace_id = d.workspace_id and r.plan_id = d.plan_id and r.id = d.revision_id
      where d.workspace_id = client_row.workspace_id and d.client_id = client_row.id
        and app_private.f19_resolve_subscription_id(d.workspace_id, d.subscription_id) in (
          select distinct app_private.f19_resolve_subscription_id(s.workspace_id, s.id)
          from public.subscriptions s cross join lateral app_private.f13_project_entitlement(s.workspace_id, s.id,
            (statement_timestamp() at time zone 'Africa/Cairo')::date) as e(value)
          where s.workspace_id = client_row.workspace_id and s.client_id = client_row.id and e.value->>'status' in ('active', 'frozen'))
      order by d.plan_id, r.revision_number desc, d.delivered_at desc
    ) x;
  return jsonb_build_object('status', 'ok', 'plans', result);
end $$;

create or replace function app_private.f18_is_self_approved_client(
  p_workspace_id uuid,
  p_client_id uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.clients c
    where c.workspace_id = p_workspace_id
      and c.id = p_client_id
      and c.auth_user_id = (select auth.uid())
      and c.approval_state = 'approved'
      and c.deactivated_at is null
      and c.deletion_state = 'active'
  );
$$;

create or replace function app_private.f18_is_self_approved_plan_client(
  p_workspace_id uuid,
  p_plan_id uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.plan_roots p
    join public.clients c
      on c.workspace_id = p.workspace_id
     and c.id = p.client_id
    where p.workspace_id = p_workspace_id
      and p.id = p_plan_id
      and c.auth_user_id = (select auth.uid())
      and c.approval_state = 'approved'
      and c.deactivated_at is null
      and c.deletion_state = 'active'
  );
$$;

create or replace function app_private.f15_is_assigned_client(p_workspace_id uuid, p_client_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.clients c
    where c.workspace_id = p_workspace_id and c.id = p_client_id
      and c.auth_user_id = auth.uid() and c.approval_state = 'approved'
      and c.deletion_state = 'active'
  );
$$;

create or replace function app_private.f15_is_assigned_answer(p_workspace_id uuid, p_assignment_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.form_assignments a
    join public.clients c on c.workspace_id = a.workspace_id and c.id = a.client_id
    where a.workspace_id = p_workspace_id and a.id = p_assignment_id
      and c.auth_user_id = auth.uid() and c.approval_state = 'approved'
      and c.deletion_state = 'active'
  );
$$;

create or replace function public.read_client_intake_destination() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target_workspace_id uuid;
  target_client_id uuid;
  assignment_id uuid;
  assignment_count integer;
begin
  if auth.uid() is null then return null; end if;

  select c.workspace_id, c.id into target_workspace_id, target_client_id
  from public.clients c
  where c.auth_user_id = auth.uid() and c.approval_state = 'approved'
    and c.deletion_state = 'active';
  if not found then return null; end if;

  select count(*)::integer, (array_agg(a.id order by a.id))[1]
    into assignment_count, assignment_id
  from public.form_assignments a
  where a.workspace_id = target_workspace_id and a.client_id = target_client_id
    and not exists (
      select 1 from app_private.form_submissions s
      where s.workspace_id = a.workspace_id and s.assignment_id = a.id
    );

  if assignment_count = 1 then
    return jsonb_build_object('status', 'ok', 'assignment_id', assignment_id);
  end if;
  return jsonb_build_object('status', 'ok', 'assignment_id', null);
end $$;

create or replace function public.read_form_assignment_context(p_assignment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  context jsonb;
begin
  if auth.uid() is null or p_assignment_id is null then return null; end if;
  select jsonb_build_object(
    'workspace_id', a.workspace_id,
    'version_snapshot', a.version_snapshot,
    'signup_profile', jsonb_build_object(
      'full_name', c.name,
      'date_of_birth', c.date_of_birth
    ),
    'relationship_active',c.deactivated_at is null
  ) into context
  from public.form_assignments a
  join public.clients c on c.workspace_id=a.workspace_id and c.id=a.client_id
  where a.id=p_assignment_id and c.auth_user_id=auth.uid()
    and c.approval_state='approved' and c.deletion_state='active';
  return context;
end $$;

create or replace function app_private.recovery_target_workspace(target uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.workspace_id
  from public.clients as c
  where c.auth_user_id = target and c.deletion_state = 'active';
$$;

-- 6. Forward-amend f12_guard_client_transition(), sync_account_identifier_claims(),
--    and signup_guard_claim_write().
drop trigger f12_client_transition on public.clients;
create or replace function app_private.f12_guard_client_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  refund_match boolean;
  closure_match boolean;
  intent app_private.account_deletion_intents%rowtype;
  expected_proof text;
begin
  if old.deactivated_at is not null then
    if new.deactivated_at is distinct from old.deactivated_at
      or new.deactivation_reason is distinct from old.deactivation_reason then
      raise exception 'client_deactivation_is_immutable' using errcode = '23514';
    end if;
  elsif new.deactivated_at is not null then
    select exists(select 1 from public.refund_operations r
      where r.workspace_id = new.workspace_id and r.client_id = new.id and r.actor_user_id = auth.uid()
        and r.recorded_at = new.deactivated_at),
      exists(select 1 from app_private.client_closure_operations o
      where o.workspace_id = new.workspace_id and o.client_id = new.id and o.actor_user_id = auth.uid()
        and o.recorded_at = new.deactivated_at)
      into refund_match, closure_match;
    if (to_jsonb(new) - 'deactivated_at' - 'deactivation_reason')
          is distinct from (to_jsonb(old) - 'deactivated_at' - 'deactivation_reason')
      or refund_match = closure_match then
      raise exception 'invalid_client_deactivation' using errcode = '23514';
    end if;
    new.deactivation_reason := case when refund_match then 'refund' else 'closure' end;
    if not exists(select 1 from app_private.client_deactivation_state d
      where d.client_id = new.id and d.auth_user_id = new.auth_user_id and d.deactivated_at = new.deactivated_at) then
      raise exception 'client_deactivation_lockout_missing' using errcode = '23514';
    end if;
    return new;
  elsif new.deactivation_reason is not null then
    raise exception 'invalid_client_deactivation_reason' using errcode = '23514';
  end if;

  if new.deletion_state is distinct from old.deletion_state then
    if new.approval_state is distinct from old.approval_state then
      raise exception 'invalid_client_transition' using errcode = '23514';
    end if;
    select * into intent
    from app_private.account_deletion_intents i
    where i.target_kind = 'client'
      and i.workspace_id = new.workspace_id
      and i.client_id = new.id
      and i.target_user_id = new.auth_user_id;
    if not found then
      raise exception 'invalid_client_transition' using errcode = '23514';
    end if;
    expected_proof := app_private.deletion_transition_proof(intent.id, new.deletion_state);
    if expected_proof is null
      or current_setting('app_private.deletion_transition_proof', true) is distinct from expected_proof then
      raise exception 'invalid_client_transition' using errcode = '23514';
    end if;

    if old.deletion_state = 'active' and new.deletion_state = 'deletion_pending' then
      if (to_jsonb(new) - 'deletion_state') is distinct from (to_jsonb(old) - 'deletion_state')
        or intent.state <> 'pending_ban'
        or intent.authorized_by_user_id is distinct from auth.uid()
        or intent.authorized_capability <> 'delete_client' then
        raise exception 'invalid_client_transition' using errcode = '23514';
      end if;
      return new;
    elsif old.deletion_state = 'deletion_pending' and new.deletion_state = 'release_pending' then
      if (to_jsonb(new) - 'deletion_state') is distinct from (to_jsonb(old) - 'deletion_state')
        or intent.state <> 'banned_pending_db'
        or intent.banned_at is null then
        raise exception 'invalid_client_transition' using errcode = '23514';
      end if;
      return new;
    elsif old.deletion_state = 'release_pending' and new.deletion_state = 'released' then
      if (to_jsonb(new) - 'deletion_state' - 'email_normalized' - 'phone_e164' - 'name' - 'date_of_birth' - 'username_normalized' - 'telegram_username')
          is distinct from (to_jsonb(old) - 'deletion_state' - 'email_normalized' - 'phone_e164' - 'name' - 'date_of_birth' - 'username_normalized' - 'telegram_username')
        or new.email_normalized is not null
        or new.phone_e164 is not null
        or new.name is not null
        or new.date_of_birth is not null
        or new.username_normalized is not null
        or new.telegram_username is not null
        or intent.state <> 'auth_release_in_progress'
        or intent.auth_released_at is null then
        raise exception 'invalid_client_transition' using errcode = '23514';
      end if;
      return new;
    else
      raise exception 'invalid_client_transition' using errcode = '23514';
    end if;
  end if;

  if (to_jsonb(new) - 'approval_state') is distinct from (to_jsonb(old) - 'approval_state')
    or old.approval_state = new.approval_state
    or old.deletion_state <> 'active'
    or not exists(select 1 from app_private.registration_decisions d where d.workspace_id = old.workspace_id and d.client_id = old.id
      and d.transaction_id = pg_current_xact_id() and d.actor_user_id = auth.uid()
      and d.from_state = old.approval_state and d.to_state = new.approval_state
      and app_private.f12_actor_allowed(d.workspace_id, 'approve_registration', d.kind = 'reconsider')) then
    raise exception 'invalid_client_transition' using errcode = '23514';
  end if;
  return new;
end $$;
alter function app_private.f12_guard_client_transition() owner to postgres;
revoke all on function app_private.f12_guard_client_transition() from public, anon, authenticated, service_role;
create trigger f12_client_transition
  before update on public.clients
  for each row execute function app_private.f12_guard_client_transition();

create or replace function app_private.signup_guard_claim_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  intent app_private.account_deletion_intents%rowtype;
  expected_proof text;
begin
  if pg_trigger_depth() >= 2 then
    if tg_op = 'UPDATE' and (new.auth_user_id <> old.auth_user_id or new.created_at <> old.created_at) then
      raise exception 'immutable' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.auth_user_id = old.auth_user_id
    and new.created_at = old.created_at
    and new.email_key is null
    and new.phone_key is null then
    select * into intent
    from app_private.account_deletion_intents i
    where i.target_user_id = new.auth_user_id
      and i.state = 'auth_release_in_progress'
      and i.auth_released_at is not null;
    if found then
      expected_proof := app_private.deletion_claim_release_proof(intent.id);
      if expected_proof is not null
        and current_setting('app_private.deletion_claim_release_proof', true) = expected_proof then
        return new;
      end if;
    end if;
  end if;

  raise exception 'immutable' using errcode = '23514';
end $$;
alter function app_private.signup_guard_claim_write() owner to postgres;
revoke all on function app_private.signup_guard_claim_write() from public, anon, authenticated, service_role;

create or replace function app_private.sync_account_identifier_claims() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n record;
  c public.clients%rowtype;
  previous app_private.account_identifier_claims%rowtype;
  intent app_private.account_deletion_intents%rowtype;
begin
  select * into n from app_private.signup_identity_normalization(new.email, new.phone, true);
  select * into c from public.clients where auth_user_id = new.id;
  select * into previous from app_private.account_identifier_claims where auth_user_id = new.id;
  select * into intent from app_private.account_deletion_intents where target_user_id = new.id;

  -- Step (C) guarded exception: keep old email/phone claim keys reserved while
  -- the Auth Admin API placeholder update runs, until step (D) releases them.
  if tg_op = 'UPDATE'
    and intent.id is not null
    and intent.state = 'auth_release_in_progress'
    and (c.id is null or c.deletion_state = 'release_pending') then
    return new;
  end if;

  if c.id is not null then
    if n.email_key is distinct from c.email_normalized or (n.phone_key is not null and n.phone_key is distinct from c.phone_e164) then
      raise exception 'identifier_disagreement' using errcode = '23514';
    end if;
    n.phone_key := c.phone_e164;
  end if;
  if previous.email_key is not null and n.email_key is null or previous.phone_key is not null and n.phone_key is null then
    raise exception 'identifier_release_unresolved' using errcode = '23514';
  end if;
  perform app_private.signup_lock_identity_keys(new.id, array['email:' || n.email_key, 'phone:' || n.phone_key, 'email:' || previous.email_key, 'phone:' || previous.phone_key]);
  insert into app_private.account_identifier_claims(auth_user_id, email_key, phone_key)
    values (new.id, n.email_key, n.phone_key)
    on conflict(auth_user_id) do update set email_key = excluded.email_key, phone_key = excluded.phone_key;
  return new;
end $$;
alter function app_private.sync_account_identifier_claims() owner to postgres;
revoke all on function app_private.sync_account_identifier_claims() from public, anon, authenticated, service_role;

-- 7. F3 Platform Owner & membership-grant serialization with deletion intents.
create or replace function app_private.f3_guard_platform_owner_profile_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  owner_delta integer := 0;
  current_count bigint;
begin
  if tg_op in ('UPDATE', 'DELETE') and exists (
    select 1 from app_private.account_deletion_intents i
    where i.target_user_id = old.user_id
  ) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'platform_owner'::public.staff_role then owner_delta := 1; end if;
  elsif tg_op = 'DELETE' then
    if old.role = 'platform_owner'::public.staff_role then owner_delta := -1; end if;
  elsif old.role is distinct from new.role then
    if old.role = 'platform_owner'::public.staff_role then owner_delta := owner_delta - 1; end if;
    if new.role = 'platform_owner'::public.staff_role then owner_delta := owner_delta + 1; end if;
  end if;

  if owner_delta <> 0 then
    select owner_count into current_count
    from app_private.f3_platform_owner_state
    where singleton
    for update;
    if not found or current_count + owner_delta < 1 then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
    update app_private.f3_platform_owner_state
    set owner_count = current_count + owner_delta
    where singleton;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
alter function app_private.f3_guard_platform_owner_profile_change() owner to postgres;
revoke all on function app_private.f3_guard_platform_owner_profile_change() from public, anon, authenticated, service_role;

create function app_private.deletion_guard_membership_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('f11.staff_deletion_target:' || new.user_id::text, 0)
  );
  if exists (
    select 1 from app_private.account_deletion_intents i
    where i.target_user_id = new.user_id
  ) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('f11.responsible_trainer.workspace:' || new.workspace_id::text, 0)
  );
  return new;
end $$;
alter function app_private.deletion_guard_membership_insert() owner to postgres;
revoke all on function app_private.deletion_guard_membership_insert() from public, anon, authenticated, service_role;
create trigger workspace_memberships_00_deletion_guard
  before insert on public.workspace_memberships
  for each row execute function app_private.deletion_guard_membership_insert();

-- 8. Assignments S56-R12 (deletion_state refusal), S57-PO-1 (system-actor role departure),
--    and deletion-intent eligibility checks.
create or replace function app_private.current_assigned_trainer(p_workspace_id uuid, p_client_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select a.trainer_user_id
  from public.client_trainer_assignments a
  join public.workspace_memberships m on m.workspace_id = a.workspace_id
    and m.id = a.workspace_membership_id and m.user_id = a.trainer_user_id and m.revoked_at is null
  join public.staff_profiles p on p.user_id = a.trainer_user_id and p.role = 'trainer'::public.staff_role
  where a.workspace_id = p_workspace_id and a.client_id = p_client_id and a.ended_at is null
    and not exists (
      select 1 from app_private.account_deletion_intents i
      where i.target_user_id = a.trainer_user_id
    )
  order by a.assigned_at desc, a.id desc limit 1
$$;

create or replace function app_private.end_client_trainer_assignments(p_workspace_id uuid, p_user_id uuid, p_ended_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.client_trainer_assignments a
  set ended_at = statement_timestamp(),
      ended_by = p_ended_by,
      ended_by_system = (p_ended_by is null)
  where a.workspace_id = p_workspace_id and a.trainer_user_id = p_user_id and a.ended_at is null;
end $$;

create or replace function app_private.end_assignments_on_trainer_role_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lock_workspace uuid;
  actor_id uuid := auth.uid();
begin
  for lock_workspace in
    select affected.workspace_id from (
      select m.workspace_id from public.workspace_memberships m where m.user_id = new.user_id
      union
      select a.workspace_id from public.client_trainer_assignments a
        where a.trainer_user_id = new.user_id and a.ended_at is null
    ) affected
    order by affected.workspace_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('f11.responsible_trainer.workspace:' || lock_workspace::text, 0)
    );
  end loop;

  if old.role = 'trainer'::public.staff_role and new.role <> 'trainer'::public.staff_role then
    perform 1 from public.clients c join public.client_trainer_assignments a
      on a.workspace_id = c.workspace_id and a.client_id = c.id
      where a.trainer_user_id = new.user_id and a.ended_at is null
      order by c.workspace_id, c.id for update of c;
    update public.client_trainer_assignments a
    set ended_at = statement_timestamp(),
        ended_by = actor_id,
        ended_by_system = (actor_id is null)
    where a.trainer_user_id = new.user_id and a.ended_at is null;
  end if;
  return new;
end $$;

create or replace function public.assign_client_responsible_trainer(
  p_workspace_id uuid, p_client_id uuid, p_trainer_user_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); client_row public.clients%rowtype; membership_id uuid; current_row public.client_trainer_assignments%rowtype;
begin
  if actor is null or not app_private.has_workspace_access(p_workspace_id, 'manage_staff_access') then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  if p_workspace_id is null or p_client_id is null or p_trainer_user_id is null then
    return jsonb_build_object('status', 'invalid_input');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('f11.responsible_trainer.workspace:' || p_workspace_id::text, 0)
  );
  select * into client_row from public.clients c
    where c.workspace_id = p_workspace_id and c.id = p_client_id for update;
  if not found or not app_private.has_workspace_access(p_workspace_id, 'manage_staff_access') then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  if client_row.approval_state <> 'approved' or client_row.deletion_state <> 'active' then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  select m.id into membership_id from public.workspace_memberships m
    join public.staff_profiles p on p.user_id = m.user_id and p.role = 'trainer'::public.staff_role
    where m.workspace_id = p_workspace_id and m.user_id = p_trainer_user_id and m.revoked_at is null
      and not exists (
        select 1 from app_private.account_deletion_intents i
        where i.target_user_id = p_trainer_user_id
      );
  if membership_id is null then return jsonb_build_object('status', 'not_permitted'); end if;
  select * into current_row from public.client_trainer_assignments a
    where a.workspace_id = p_workspace_id and a.client_id = p_client_id and a.ended_at is null for update;
  if found and current_row.trainer_user_id = p_trainer_user_id then
    return jsonb_build_object('status', 'ok', 'assignment_id', current_row.id);
  end if;
  if found then
    update public.client_trainer_assignments set ended_at = statement_timestamp(), ended_by = actor, ended_by_system = false
      where id = current_row.id;
  end if;
  insert into public.client_trainer_assignments(workspace_id, client_id, trainer_user_id, assigned_by, workspace_membership_id)
    values(p_workspace_id, p_client_id, p_trainer_user_id, actor, membership_id) returning * into current_row;
  return jsonb_build_object('status', 'ok', 'assignment_id', current_row.id);
end $$;

create or replace function public.client_responsible_trainer(p_workspace_id uuid, p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); trainer_id uuid;
begin
  if actor is null
    or exists (select 1 from app_private.account_deletion_intents i where i.target_user_id = actor)
    or not (app_private.is_platform_owner() or exists (
      select 1 from public.workspace_memberships m join public.staff_profiles p on p.user_id = m.user_id
      where m.workspace_id = p_workspace_id and m.user_id = actor and m.revoked_at is null and p.role = 'workspace_owner'
    )) then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  if p_workspace_id is null or p_client_id is null then return jsonb_build_object('status', 'invalid_input'); end if;
  if not exists(select 1 from public.clients c where c.workspace_id = p_workspace_id and c.id = p_client_id) then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  trainer_id := app_private.current_assigned_trainer(p_workspace_id, p_client_id);
  return jsonb_build_object('status', 'ok', 'trainer_user_id', trainer_id);
end $$;

create or replace function public.unassigned_clients(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  clients jsonb;
begin
  if actor is null
    or exists (select 1 from app_private.account_deletion_intents i where i.target_user_id = actor)
    or not (
      app_private.is_platform_owner()
      or exists (
        select 1
        from public.workspace_memberships m
        join public.staff_profiles p on p.user_id = m.user_id
        where m.workspace_id = p_workspace_id
          and m.user_id = actor
          and m.revoked_at is null
          and p.role = 'workspace_owner'
      )
    ) then
    return jsonb_build_object('status', 'not_permitted');
  end if;

  if p_workspace_id is null then
    return jsonb_build_object('status', 'invalid_input');
  end if;

  select coalesce(jsonb_agg(c.id order by c.id), '[]'::jsonb)
    into clients
  from public.clients c
  where c.workspace_id = p_workspace_id
    and c.approval_state = 'approved'
    and c.deletion_state = 'active'
    and app_private.current_assigned_trainer(c.workspace_id, c.id) is null;

  return jsonb_build_object('status', 'ok', 'client_ids', clients);
end $$;

create or replace function app_private.write_client_trainer_distribution(
  p_job_id uuid, p_lease_token uuid, p_client_id uuid
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  work public.jobs%rowtype;
  target_workspace uuid;
  approval_id uuid;
  client_row public.clients%rowtype;
  current_row public.client_trainer_assignments%rowtype;
  trainer_id uuid;
  membership_id uuid;
  result_outcome text;
begin
  select j.* into work from public.jobs j
  where j.id = p_job_id and j.kind = 'client.distribution'
    and j.status = 'running' and j.lease_token = p_lease_token
    and j.lease_expires_at > pg_catalog.statement_timestamp()
  for update;
  if not found then return null; end if;
  if work.outcome is not null then return work.outcome; end if;
  if jsonb_typeof(work.payload) <> 'object'
    or work.payload->>'client_id' is distinct from p_client_id::text
    or work.payload->>'approval_id' is null
    or work.workspace_id is null then
    raise exception 'invalid_distribution_job' using errcode = '22023';
  end if;
  target_workspace := work.workspace_id;
  approval_id := (work.payload->>'approval_id')::uuid;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'f11.responsible_trainer.workspace:' || target_workspace::text, 0
    )
  );
  select c.* into client_row from public.clients c
  where c.workspace_id = target_workspace and c.id = p_client_id
  for update;
  if not found or client_row.approval_state <> 'approved'
    or client_row.deletion_state <> 'active'
    or client_row.deactivated_at is not null
    or not exists (
      select 1 from app_private.registration_approval_events e
      where e.id = approval_id and e.workspace_id = target_workspace
        and e.client_id = p_client_id
    ) then
    result_outcome := 'no_op_client_not_approved';
  else
    select a.* into current_row from public.client_trainer_assignments a
    where a.workspace_id = target_workspace and a.client_id = p_client_id
      and a.ended_at is null
    for update;
    if found then
      result_outcome := case when current_row.assignment_source = 'po_manual'
        then 'no_op_po_override_exists'
        else 'no_op_active_assignment_exists' end;
    else
      select a.* into current_row from public.client_trainer_assignments a
      where a.workspace_id = target_workspace and a.client_id = p_client_id
        and a.assignment_source = 'po_manual' and a.ended_at is not null
        and not a.ended_by_system
      order by a.ended_at desc, a.id desc limit 1;
      if found then
        result_outcome := 'no_op_po_override_exists';
      else
        with eligible as (
          select m.user_id, m.id as membership_id,
            (
              select count(*)::bigint
              from public.client_trainer_assignments active
              join public.clients active_client
                on active_client.workspace_id = active.workspace_id
                and active_client.id = active.client_id
              where active.workspace_id = m.workspace_id
                and active.trainer_user_id = m.user_id
                and active.ended_at is null
                and active_client.approval_state = 'approved'
                and active_client.deletion_state = 'active'
                and active_client.deactivated_at is null
            ) as assigned_count,
            (
              select max(history.assigned_at)
              from public.client_trainer_assignments history
              where history.workspace_id = m.workspace_id
                and history.trainer_user_id = m.user_id
            ) as last_assigned_at
          from public.workspace_memberships m
          join public.staff_profiles p on p.user_id = m.user_id
            and p.role = 'trainer'::public.staff_role
          where m.workspace_id = target_workspace
            and m.revoked_at is null
            and not exists (
              select 1 from app_private.account_deletion_intents di
              where di.target_user_id = m.user_id
            )
        )
        select e.user_id, e.membership_id into trainer_id, membership_id
        from eligible e
        order by e.assigned_count, e.last_assigned_at nulls first, e.last_assigned_at, e.user_id
        limit 1;
        if trainer_id is null then
          result_outcome := 'no_eligible';
        else
          insert into public.client_trainer_assignments(
            workspace_id, client_id, trainer_user_id, assignment_source,
            assigned_by, workspace_membership_id, source_approval_id
          ) values (
            target_workspace, p_client_id, trainer_id, 'system_distribution',
            null, membership_id, approval_id
          );
          result_outcome := 'assigned';
        end if;
      end if;
    end if;
  end if;

  update public.jobs j set outcome = result_outcome,
    completed_at = pg_catalog.statement_timestamp()
  where j.id = p_job_id and j.lease_token = p_lease_token and j.status = 'running';
  if not found then raise exception 'distribution_lease_lost' using errcode = '40001'; end if;
  return result_outcome;
end $$;
alter function app_private.write_client_trainer_distribution(uuid, uuid, uuid) owner to postgres;
revoke all on function app_private.write_client_trainer_distribution(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- 9. F12 & F13 deletion-state guards (after authorized receipt replay, under client lock).
create or replace function app_private.f12_u3_operation(kind text, request jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare ws uuid; cid uuid; key uuid; canonical jsonb; binding bytea; previous app_private.registration_operations%rowtype;
  c public.clients%rowtype; l public.registration_links%rowtype; first_amount bigint; sampled timestamptz; opid uuid; receipt jsonb; result jsonb; expected text;
begin
  if auth.uid() is null then return jsonb_build_object('status', 'not_permitted'); end if;
  if jsonb_typeof(request) is distinct from 'object' then return jsonb_build_object('status', 'invalid_input', 'fields', '[]'::jsonb); end if;
  if jsonb_typeof(request->'workspace_id') is distinct from 'string' or jsonb_typeof(request->'client_id') is distinct from 'string'
    or (request->>'workspace_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (request->>'client_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('status', 'invalid_input', 'fields', '[]'::jsonb);
  end if;
  ws := (request->>'workspace_id')::uuid; cid := (request->>'client_id')::uuid;
  if not app_private.f12_u3_can_decide(ws, kind = 'reconsider') then return jsonb_build_object('status', 'not_permitted'); end if;
  canonical := app_private.f12_u3_canonical(kind, request);
  if canonical is null then return jsonb_build_object('status', 'invalid_input', 'fields', '[]'::jsonb); end if;
  key := (canonical->>'request_key')::uuid;
  binding := extensions.digest(convert_to(jsonb_build_array(1, kind, ws::text, cid::text, canonical->>'expected_state',
    null::text, null::text, null::text, canonical->'expected_installment_seq', case when kind = 'reject' then null::integer else 0 end, null::text,
    canonical->>'expected_amount_minor', canonical->>'currency', canonical->>'collected_on', canonical->'payment_confirmed', canonical->>'reason_code')::text, 'UTF8'), 'sha256');
  select * into c from public.clients where workspace_id=ws and id=cid for update;
  if not found then return jsonb_build_object('status', 'not_permitted'); end if;
  perform s.id from public.subscriptions s where s.workspace_id=ws and s.client_id=cid order by s.id for update;
  perform i.id from public.subscription_installments i join public.subscriptions s on s.workspace_id = i.workspace_id and s.id = i.subscription_id
    where s.workspace_id = ws and s.client_id = cid order by i.subscription_id, i.seq, i.id for update of i;
  perform e.id from public.payment_events e join public.subscriptions s on s.workspace_id = e.workspace_id and s.id = e.subscription_id
    where s.workspace_id = ws and s.client_id = cid order by e.subscription_id, e.obligation_id, e.revision for update of e;
  if not app_private.f12_u3_lock_authorization(ws, kind = 'reconsider') then return jsonb_build_object('status', 'not_permitted'); end if;
  perform pg_advisory_xact_lock(hashtextextended('lifter.f12.operation:' || auth.uid()::text || ':' || key::text, 0));
  if not app_private.f12_u3_lock_authorization(ws, kind = 'reconsider') then return jsonb_build_object('status', 'not_permitted'); end if;
  select * into previous from app_private.registration_operations o where o.actor_user_id = auth.uid() and o.request_key = key;
  if found then
    if previous.canonical_version <> 1 or previous.workspace_id <> ws or previous.client_id <> cid or previous.operation <> kind or previous.canonical_args_hash is distinct from binding then
      return jsonb_build_object('status', 'key_conflict');
    end if;
    set constraints all immediate;
    return previous.result_receipt;
  end if;
  expected := case when kind = 'reconsider' then 'rejected' else 'pending-approval' end;
  if canonical->>'expected_state' <> expected or (kind <> 'reject' and (canonical->'payment_confirmed' <> 'true'::jsonb or (canonical->>'expected_installment_seq')::integer <> 1)) then
    return jsonb_build_object('status', 'invalid_input', 'fields', '[]'::jsonb);
  end if;
  if c.deletion_state <> 'active' or c.approval_state <> expected then return jsonb_build_object('status', 'stale_state'); end if;
  sampled := clock_timestamp(); opid := gen_random_uuid();
  if kind <> 'reject' then
    if (canonical->>'collected_on')::date > (sampled at time zone 'Africa/Cairo')::date then return jsonb_build_object('status', 'invalid_input', 'fields', '[]'::jsonb); end if;
    select r.* into strict l from public.registration_links r where r.workspace_id = ws and r.id = c.registration_link_id and r.package_version_id = c.package_version_id;
    select i.amount_minor into first_amount from public.registration_link_installments i where i.workspace_id = ws and i.link_id = l.id and i.seq = 1;
    first_amount := coalesce(first_amount, l.price_minor);
    if (canonical->>'expected_amount_minor')::bigint <> first_amount or canonical->>'currency' <> l.currency then return jsonb_build_object('status', 'invalid_input', 'fields', '[]'::jsonb); end if;
  end if;
  set constraints all deferred;
  if kind = 'reject' then
    insert into app_private.registration_decisions(workspace_id, client_id, operation_id, actor_user_id, kind, from_state, to_state, rejection_reason_code)
      values(ws, cid, opid, auth.uid(), 'reject', 'pending-approval', 'rejected', 'registration_rejected');
    update public.clients set approval_state = 'rejected' where workspace_id = ws and id = cid;
    receipt := jsonb_build_object('id', opid, 'operation', kind, 'workspace_id', ws, 'client_id', cid, 'subscription_id', null, 'obligation_id', null, 'event_id', null,
      'installment_seq', null, 'revision', null, 'outcome', 'rejected', 'amount_minor', null, 'currency', null, 'collected_on', null, 'recorded_at', sampled);
  else
    receipt := app_private.f12_u3_purchase(ws, cid, opid, l.id, kind, (canonical->>'collected_on')::date, sampled);
  end if;
  result := jsonb_build_object('status', 'ok', 'receipt', receipt);
  insert into app_private.registration_operations(id, workspace_id, actor_user_id, request_key, operation, client_id, subscription_id, obligation_id, event_id,
    expected_installment_seq, expected_revision, canonical_args_hash, result_receipt, recorded_at)
    values(opid, ws, auth.uid(), key, kind, cid, (receipt->>'subscription_id')::uuid, (receipt->>'obligation_id')::uuid, (receipt->>'event_id')::uuid,
      case when kind = 'reject' then null else 1 end, case when kind = 'reject' then null else 0 end, binding, result, sampled);
  set constraints all immediate;
  return result;
exception when others then
  return jsonb_build_object('status', 'unavailable');
end $$;

create or replace function app_private.f12_u4_operation(kind text, request jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare ws uuid; cid uuid; sid uuid; oid uuid; key uuid; canonical jsonb; binding bytea;
  c public.clients%rowtype; s public.subscriptions%rowtype; i public.subscription_installments%rowtype;
  tail public.payment_events%rowtype; previous app_private.registration_operations%rowtype;
  opid uuid; eid uuid; sampled timestamptz; amount bigint; commission bigint; collected date; effective date; receipt jsonb; result jsonb; rate integer;
begin
  if auth.uid() is null then return jsonb_build_object('status', 'not_permitted'); end if;
  if jsonb_typeof(request) is distinct from 'object'
    or jsonb_typeof(request->'workspace_id') is distinct from 'string' or jsonb_typeof(request->'client_id') is distinct from 'string'
    or (request->>'workspace_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (request->>'client_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('status', 'invalid_input', 'fields', '[]'::jsonb); end if;
  ws := (request->>'workspace_id')::uuid; cid := (request->>'client_id')::uuid;
  if not app_private.f12_u4_can_pay(ws, kind = 'correct') then return jsonb_build_object('status', 'not_permitted'); end if;
  canonical := app_private.f12_u4_canonical(kind, request);
  if canonical is null then return jsonb_build_object('status', 'invalid_input', 'fields', '[]'::jsonb); end if;
  sid := (canonical->>'subscription_id')::uuid; oid := (canonical->>'obligation_id')::uuid; key := (canonical->>'request_key')::uuid;
  binding := extensions.digest(convert_to(jsonb_build_array(1, kind, ws::text, cid::text, null::text,
    sid::text, oid::text, canonical->>'original_event_id', canonical->'expected_installment_seq', canonical->'expected_revision', canonical->>'expected_previous_event_id',
    canonical->>'expected_amount_minor', canonical->>'currency', canonical->>'collected_on',
    case when kind = 'correct' then canonical->'correction_confirmed' else canonical->'payment_confirmed' end, null::text)::text, 'UTF8'), 'sha256');
  select * into c from public.clients where workspace_id = ws and id = cid for update;
  if not found then return jsonb_build_object('status', 'not_permitted'); end if;
  select * into s from public.subscriptions where workspace_id = ws and client_id = cid and id = sid for update;
  if not found then return jsonb_build_object('status', 'not_permitted'); end if;
  perform x.id from public.subscription_installments x where x.workspace_id = ws and x.subscription_id = sid order by x.seq, x.id for update;
  select * into i from public.subscription_installments where workspace_id = ws and subscription_id = sid and id = oid;
  if not found then return jsonb_build_object('status', 'not_permitted'); end if;
  perform e.id from public.payment_events e where e.workspace_id = ws and e.subscription_id = sid order by e.obligation_id, e.revision for update;
  if not app_private.f12_actor_allowed(ws, case when kind = 'correct' then 'record_refund' else 'record_payment' end, kind = 'correct') then return jsonb_build_object('status', 'not_permitted'); end if;
  perform pg_advisory_xact_lock(hashtextextended('lifter.f12.operation:' || auth.uid()::text || ':' || key::text, 0));
  if not app_private.f12_actor_allowed(ws, case when kind = 'correct' then 'record_refund' else 'record_payment' end, kind = 'correct') then return jsonb_build_object('status', 'not_permitted'); end if;
  select * into previous from app_private.registration_operations o where o.actor_user_id = auth.uid() and o.request_key = key;
  if found then
    if previous.canonical_version <> 1 or previous.workspace_id <> ws or previous.client_id <> cid or previous.operation <> kind or previous.canonical_args_hash is distinct from binding then
      return jsonb_build_object('status', 'key_conflict'); end if;
    set constraints all immediate; return previous.result_receipt;
  end if;
  if (kind = 'correct' and canonical->'correction_confirmed' <> 'true'::jsonb) or (kind = 'collect' and canonical->'payment_confirmed' <> 'true'::jsonb) then
    return jsonb_build_object('status', 'invalid_input', 'fields', '[]'::jsonb); end if;
  select * into tail from public.payment_events e where e.workspace_id = ws and e.subscription_id = sid and e.obligation_id = oid order by revision desc limit 1;
  if (kind = 'collect' and c.deletion_state <> 'active')
    or c.approval_state <> 'approved' or i.seq <> (canonical->>'expected_installment_seq')::integer
    or coalesce(tail.revision, 0) <> (canonical->>'expected_revision')::integer
    or tail.id is distinct from (canonical->>'expected_previous_event_id')::uuid then return jsonb_build_object('status', 'stale_state'); end if;
  sampled := clock_timestamp(); opid := gen_random_uuid(); eid := gen_random_uuid();
  if kind = 'collect' then
    if tail.kind = 'collection' then return jsonb_build_object('status', 'stale_state'); end if;
    if (canonical->>'expected_amount_minor')::bigint <> i.amount_minor or canonical->>'currency' <> i.currency
      or (canonical->>'collected_on')::date > (sampled at time zone 'Africa/Cairo')::date then
      return jsonb_build_object('status', 'invalid_input', 'fields', '[]'::jsonb); end if;
    if i.seq >= 2 and (not exists(select 1 from public.subscription_activations a where a.workspace_id = ws and a.subscription_id = sid)
      or exists(select 1 from public.subscription_installments earlier where earlier.workspace_id = ws and earlier.subscription_id = sid and earlier.seq < i.seq
        and earlier.renewal_id is not distinct from i.renewal_id
        and (select e.kind from public.payment_events e where e.workspace_id = ws and e.subscription_id = sid and e.obligation_id = earlier.id order by e.revision desc limit 1) is distinct from 'collection')) then
      return jsonb_build_object('status', 'stale_state'); end if;
    amount := i.amount_minor;
    if i.renewal_id is null then rate := s.commission_rate_bp; else rate := i.renewal_commission_rate_bp; end if;
    commission := app_private.f12_commission_minor(i.amount_minor, rate);
    collected := (canonical->>'collected_on')::date; effective := collected;
  else
    if tail.kind is distinct from 'collection' or tail.id is distinct from (canonical->>'original_event_id')::uuid then return jsonb_build_object('status', 'stale_state'); end if;
    amount := -tail.amount_minor; commission := -tail.commission_minor; collected := null; effective := (sampled at time zone 'Africa/Cairo')::date;
  end if;
  set constraints all deferred;
  insert into public.payment_events(id, workspace_id, subscription_id, obligation_id, installment_seq, revision, previous_event_id, kind, reverses_event_id,
    amount_minor, currency, commission_minor, collected_on, effective_on, recorded_by, recorded_at, operation_id)
    values(eid, ws, sid, oid, i.seq, coalesce(tail.revision, 0) + 1, tail.id, case when kind = 'correct' then 'correction_reversal' else 'collection' end,
      case when kind = 'correct' then tail.id else null end, amount, i.currency, commission, collected, effective, auth.uid(), sampled, opid);
  receipt := jsonb_build_object('id', opid, 'operation', kind, 'workspace_id', ws, 'client_id', cid, 'subscription_id', sid, 'obligation_id', oid, 'event_id', eid,
    'installment_seq', i.seq, 'revision', coalesce(tail.revision, 0) + 1, 'outcome', case when kind = 'correct' then 'reversed' else 'collected' end,
    'amount_minor', amount::text, 'currency', i.currency, 'collected_on', collected, 'recorded_at', sampled);
  result := jsonb_build_object('status', 'ok', 'receipt', receipt);
  insert into app_private.registration_operations(id, workspace_id, actor_user_id, request_key, operation, client_id, subscription_id, obligation_id, event_id, original_event_id,
    expected_installment_seq, expected_revision, expected_previous_event_id, canonical_args_hash, result_receipt, recorded_at)
    values(opid, ws, auth.uid(), key, kind, cid, sid, oid, eid, (canonical->>'original_event_id')::uuid, i.seq, coalesce(tail.revision, 0), tail.id, binding, result, sampled);
  set constraints all immediate; return result;
exception when others then return jsonb_build_object('status', 'unavailable');
end $$;

create or replace function public.record_renewal(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  ws uuid; cid uuid; predecessor_id uuid; requested_offer_id uuid; request_id uuid;
  expected integer; c public.clients%rowtype; predecessor public.subscriptions%rowtype;
  offer public.package_offers%rowtype; version public.package_versions%rowtype;
  previous app_private.subscription_renewal_operations%rowtype;
  canonical jsonb; binding bytea; legacy_canonical jsonb; legacy_binding bytea; sampled timestamptz; recording date; start_on date; end_on date;
  renewal_id uuid; operation_id uuid; revision integer; seq integer;
  row jsonb; total numeric := 0; amount bigint; offset_days integer;
  receipt jsonb; result jsonb; projected jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('status', 'not_permitted'); end if;
  if jsonb_typeof(request) is distinct from 'object'
    or coalesce(request->>'workspace_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true) then
    return jsonb_build_object('status', 'not_permitted'); end if;
  ws := (request->>'workspace_id')::uuid;
  if not app_private.f13_actor_preflight(ws, 'record_payment', false) then return jsonb_build_object('status', 'not_permitted'); end if;
  if jsonb_typeof(request) is distinct from 'object'
    or request->>'workspace_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(request->>'client_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true)
    or coalesce(request->>'predecessor_subscription_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true)
    or coalesce(request->>'package_offer_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true)
    or coalesce(request->>'request_key' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true)
    or coalesce(request->>'expected_revision' !~ '^(0|[1-9][0-9]{0,8})$', true)
    or request->'renewal_confirmed' is distinct from 'true'::jsonb
    or (request->'installments' is not null and request->'installments' <> 'null'::jsonb
      and (jsonb_typeof(request->'installments') <> 'array' or jsonb_array_length(request->'installments') = 0)) then
    return jsonb_build_object('status', 'invalid_input'); end if;
  cid := (request->>'client_id')::uuid; predecessor_id := (request->>'predecessor_subscription_id')::uuid;
  requested_offer_id := (request->>'package_offer_id')::uuid; request_id := (request->>'request_key')::uuid;
  predecessor_id := app_private.f19_resolve_subscription_id(ws, predecessor_id);
  if predecessor_id is null then return jsonb_build_object('status', 'not_permitted'); end if;
  expected := (request->>'expected_revision')::integer;
  if not app_private.f12_actor_allowed(ws, 'record_payment', false) then return jsonb_build_object('status', 'not_permitted'); end if;
  canonical := jsonb_build_array(2, ws::text, cid::text, predecessor_id::text, requested_offer_id::text, expected,
    true, coalesce((select jsonb_agg(jsonb_build_array(x->>'amount_minor', x->>'due_offset_days') order by n)
      from jsonb_array_elements(case when jsonb_typeof(request->'installments') = 'array' then request->'installments' else '[]'::jsonb end)
        with ordinality as a(x, n)), '[]'::jsonb));
  binding := extensions.digest(convert_to(canonical::text, 'UTF8'), 'sha256');
  legacy_canonical := jsonb_build_array(1, ws::text, cid::text, predecessor_id::text, requested_offer_id::text, expected,
    true, coalesce((select jsonb_agg(jsonb_build_array(x->>'amount_minor', x->>'due_offset_days') order by n)
      from jsonb_array_elements(case when jsonb_typeof(request->'installments') = 'array' then request->'installments' else '[]'::jsonb end)
        with ordinality as a(x, n)), '[]'::jsonb));
  legacy_binding := extensions.digest(convert_to(legacy_canonical::text, 'UTF8'), 'sha256');
  select * into c from public.clients where workspace_id = ws and id = cid for update;
  if not found then return jsonb_build_object('status', 'not_permitted'); end if;
  select * into predecessor from public.subscriptions where workspace_id = ws and client_id = cid and id = predecessor_id for update;
  if not found then return jsonb_build_object('status', 'not_permitted'); end if;
  perform i.id from public.subscription_installments i where i.workspace_id = ws
    and app_private.f19_resolve_subscription_id(i.workspace_id, i.subscription_id) = predecessor_id
    order by i.seq, i.id for update;
  if not app_private.f12_actor_allowed(ws, 'record_payment', false) then return jsonb_build_object('status', 'not_permitted'); end if;
  perform pg_advisory_xact_lock(hashtextextended('lifter.f13.renewal:' || auth.uid()::text || ':' || request_id::text, 0));
  if not app_private.f12_actor_allowed(ws, 'record_payment', false) then return jsonb_build_object('status', 'not_permitted'); end if;
  select * into previous from app_private.subscription_renewal_operations o where o.actor_user_id = auth.uid() and o.request_key = request_id;
  if found then
    if previous.workspace_id <> ws or previous.client_id <> cid
      or (previous.canonical_args_hash is distinct from binding and previous.canonical_args_hash is distinct from legacy_binding) then
      return jsonb_build_object('status', 'conflict'); end if;
    return previous.result_receipt;
  end if;
  if exists(select 1 from public.subscription_renewals r
    where r.workspace_id=ws and r.predecessor_subscription_id=predecessor_id
      and r.subscription_id<>predecessor_id
      and app_private.f19_resolve_subscription_id(r.workspace_id,r.subscription_id) is distinct from predecessor_id) then
    return jsonb_build_object('status','stale_state');
  end if;
  select count(*)::integer into revision from public.subscription_renewals r
    where r.workspace_id = ws and r.client_id = cid
      and app_private.f19_resolve_subscription_id(r.workspace_id, r.subscription_id) = predecessor_id
      and app_private.f19_resolve_subscription_id(r.workspace_id, r.predecessor_subscription_id) = predecessor_id;
  revision := revision + (select count(*)::integer from public.subscription_upgrades u
    where u.workspace_id = ws and u.client_id = cid
      and app_private.f19_resolve_subscription_id(u.workspace_id, u.subscription_id) = predecessor_id);
  if c.deletion_state <> 'active' or c.deactivated_at is not null or c.approval_state <> 'approved' or predecessor.kind <> 'initial'
    or not exists(select 1 from public.subscription_activations a where a.workspace_id = ws
      and app_private.f19_resolve_subscription_id(a.workspace_id, a.subscription_id) = predecessor_id)
    or exists(select 1 from public.refund_operations r where r.workspace_id = ws
      and app_private.f19_resolve_subscription_id(r.workspace_id, r.subscription_id) = predecessor_id)
    or expected <> revision then return jsonb_build_object('status', 'stale_state'); end if;
  select * into offer from public.package_offers o where o.workspace_id = ws and o.id = requested_offer_id;
  if not found or offer.available is not true then return jsonb_build_object('status', 'stale_state'); end if;
  select * into version from public.package_versions v where v.workspace_id = ws and v.id = offer.current_version_id and v.offer_id = requested_offer_id;
  if not found then return jsonb_build_object('status', 'stale_state'); end if;
  if request->'installments' is not null and request->'installments' <> 'null'::jsonb
    and jsonb_array_length(request->'installments') > 1 and not app_private.f12_actor_allowed(ws, 'configure_installment_schedule', false) then
    return jsonb_build_object('status', 'not_permitted'); end if;
  if request->'installments' is not null and request->'installments' <> 'null'::jsonb then
    for row in select value from jsonb_array_elements(request->'installments') loop
      if jsonb_typeof(row) <> 'object' or row->>'amount_minor' !~ '^[1-9][0-9]{0,17}$' or row->>'due_offset_days' !~ '^(0|[1-9][0-9]{0,8})$' then return jsonb_build_object('status', 'invalid_input'); end if;
      amount := (row->>'amount_minor')::bigint; offset_days := (row->>'due_offset_days')::integer;
      if amount <= 0 or offset_days < 0 then return jsonb_build_object('status', 'invalid_input'); end if; total := total + amount;
    end loop;
  else total := version.price_minor; end if;
  if total <> version.price_minor then return jsonb_build_object('status', 'invalid_input'); end if;
  sampled := clock_timestamp(); recording := (sampled at time zone 'Africa/Cairo')::date;
  projected := app_private.f13_project_entitlement(ws, predecessor_id, recording);
  if projected->>'status' = 'frozen' then return jsonb_build_object('status', 'stale_state'); end if;
  start_on := case when projected->>'status' = 'expired' then recording
    else greatest(recording, coalesce((projected->>'effective_end_exclusive')::date, recording)) end;
  end_on := start_on + version.duration_days;
  renewal_id := gen_random_uuid(); operation_id := gen_random_uuid();
  receipt := jsonb_build_object('operation_id', operation_id, 'renewal_id', renewal_id, 'workspace_id', ws, 'client_id', cid,
    'predecessor_subscription_id', predecessor_id, 'subscription_id', predecessor_id, 'package_version_id', version.id,
    'price_minor', version.price_minor::text, 'currency', version.currency, 'duration_days', version.duration_days,
    'recording_date', recording, 'service_start_date', start_on, 'service_end_exclusive', end_on);
  result := jsonb_build_object('status', 'ok', 'receipt', receipt); set constraints all deferred;
  insert into public.subscription_renewals(id, workspace_id, client_id, predecessor_subscription_id, subscription_id,
    package_offer_id, package_version_id, expected_revision, recording_date, service_start_date, service_end_exclusive, recorded_by, recorded_at)
    values(renewal_id, ws, cid, predecessor_id, predecessor_id, requested_offer_id, version.id, revision, recording, start_on, end_on, auth.uid(), sampled);
  insert into app_private.subscription_renewal_operations(id, workspace_id, client_id, actor_user_id, request_key,
    predecessor_subscription_id, subscription_id, expected_revision, canonical_args_hash, result_receipt, recorded_at, renewal_id, transaction_id)
    values(operation_id, ws, cid, auth.uid(), request_id, predecessor_id, predecessor_id, revision, binding, result, sampled, renewal_id, pg_current_xact_id());
  select coalesce(max(i.seq), 0) into seq from public.subscription_installments i
    where i.workspace_id = ws and app_private.f19_resolve_subscription_id(i.workspace_id, i.subscription_id) = predecessor_id;
  if request->'installments' is not null and request->'installments' <> 'null'::jsonb then
    for row in select value from jsonb_array_elements(request->'installments') loop
      seq := seq + 1; amount := (row->>'amount_minor')::bigint; offset_days := (row->>'due_offset_days')::integer;
      insert into public.subscription_installments(workspace_id, subscription_id, seq, amount_minor, currency, issued_day_offset, source_kind, due_on, renewal_id, renewal_commission_rate_bp)
        values(ws, predecessor_id, seq, amount, version.currency, offset_days, 'renewal_schedule', recording + offset_days, renewal_id, version.commission_rate_bp);
    end loop;
  else
    insert into public.subscription_installments(workspace_id, subscription_id, seq, amount_minor, currency, issued_day_offset, source_kind, due_on, renewal_id, renewal_commission_rate_bp)
      values(ws, predecessor_id, seq + 1, version.price_minor, version.currency, 0, 'renewal_schedule', recording, renewal_id, version.commission_rate_bp);
  end if;
  set constraints all immediate; return result;
exception when others then return jsonb_build_object('status', 'unavailable');
end $function$;

-- 10. Step (0) PO-authenticated RPCs (FR-018, FR-025, FR-026).
create function public.record_deletion_financial_confirmation(
  p_workspace_id uuid,
  p_client_id uuid,
  p_category text,
  p_acknowledgement text
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  audit_id bigint;
begin
  if actor is null or not app_private.is_platform_owner()
    or not app_private.has_workspace_access(p_workspace_id, 'delete_client') then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if p_workspace_id is null or p_client_id is null
    or not app_private.deletion_financial_confirmation_valid(p_category, p_acknowledgement) then
    raise exception using errcode = '23514', message = 'invalid_financial_confirmation';
  end if;
  if not exists (
    select 1 from public.clients c
    where c.workspace_id = p_workspace_id and c.id = p_client_id
  ) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (
    actor,
    'account_deletion.financial_confirmed',
    'clients',
    p_client_id,
    p_workspace_id,
    jsonb_build_object('category', p_category, 'acknowledgement_verified', true)
  )
  returning id into audit_id;

  return jsonb_build_object('status', 'ok', 'confirmation_audit_id', audit_id);
end $$;
alter function public.record_deletion_financial_confirmation(uuid, uuid, text, text) owner to postgres;
revoke all on function public.record_deletion_financial_confirmation(uuid, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.record_deletion_financial_confirmation(uuid, uuid, text, text) to authenticated;

create function public.request_account_deletion(
  p_target_user_id uuid,
  p_financial_confirmation jsonb default null,
  p_financial_confirmation_audit_id bigint default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  v_target_kind text;
  v_capability text;
  v_staff public.staff_profiles%rowtype;
  v_client public.clients%rowtype;
  v_ws uuid;
  v_cid uuid;
  v_owner_count bigint;
  v_lock_ws uuid;
  v_has_financial_obligation boolean := false;
  v_conf_audit_id bigint := p_financial_confirmation_audit_id;
  v_conf_event public.audit_events%rowtype;
  v_category text;
  v_acknowledgement text;
  v_intent_id uuid;
  v_proof text;
begin
  if actor is null or not app_private.is_platform_owner() then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if p_target_user_id is null then
    raise exception using errcode = '23514', message = 'invalid_input';
  end if;
  if p_financial_confirmation is not null and p_financial_confirmation_audit_id is not null then
    raise exception using errcode = '23514', message = 'invalid_input';
  end if;

  select * into v_staff from public.staff_profiles s where s.user_id = p_target_user_id;
  if found then
    v_target_kind := 'staff';
    v_capability := 'manage_staff_access';
  else
    select * into v_client from public.clients c where c.auth_user_id = p_target_user_id;
    if not found then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
    v_target_kind := 'client';
    v_capability := 'delete_client';
    v_ws := v_client.workspace_id;
    v_cid := v_client.id;
  end if;

  if not app_private.role_has_capability(app_private.current_staff_role(), v_capability) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if v_target_kind = 'client' and not app_private.has_workspace_access(v_ws, 'delete_client') then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  -- Global lock order (S64-R46(2)):
  -- 1) f3_platform_owner_state FOR UPDATE
  select owner_count into v_owner_count
  from app_private.f3_platform_owner_state
  where singleton
  for update;

  -- 2) per-target-user advisory lock (shared with workspace_memberships insert guard)
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('f11.staff_deletion_target:' || p_target_user_id::text, 0)
  );

  -- Re-check actor authorization after lock waits (e.g. concurrent PO self-deletion).
  if not app_private.is_platform_owner() then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  if exists (
    select 1 from app_private.account_deletion_intents i
    where i.target_user_id = p_target_user_id
  ) then
    raise exception using errcode = '23514', message = 'deletion_already_requested';
  end if;

  if v_target_kind = 'staff' then
    if p_financial_confirmation is not null or p_financial_confirmation_audit_id is not null then
      raise exception using errcode = '23514', message = 'invalid_input';
    end if;

    select * into v_staff from public.staff_profiles s where s.user_id = p_target_user_id for update;
    if v_staff.role = 'platform_owner'::public.staff_role then
      if v_owner_count is null or v_owner_count < 2 then
        raise exception using errcode = '42501', message = 'not_permitted';
      end if;
      update app_private.f3_platform_owner_state
      set owner_count = v_owner_count - 1
      where singleton;
    end if;

    -- 3) per-workspace advisory locks in ascending workspace_id order
    for v_lock_ws in
      select affected.ws_id from (
        select m.workspace_id as ws_id from public.workspace_memberships m
        where m.user_id = p_target_user_id and m.revoked_at is null
        union
        select a.workspace_id as ws_id from public.client_trainer_assignments a
        where a.trainer_user_id = p_target_user_id and a.ended_at is null
      ) affected
      order by affected.ws_id
    loop
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('f11.responsible_trainer.workspace:' || v_lock_ws::text, 0)
      );
    end loop;
  else
    -- 3) per-workspace advisory lock
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('f11.responsible_trainer.workspace:' || v_ws::text, 0)
    );

    -- 4) client row FOR UPDATE
    select * into v_client from public.clients c
      where c.workspace_id = v_ws and c.id = v_cid
      for update;
    if not found or v_client.deletion_state <> 'active' then
      raise exception using errcode = '23514', message = 'deletion_already_requested';
    end if;

    select exists (
      select 1
      from public.subscriptions s
      where s.workspace_id = v_ws
        and s.client_id = v_cid
        and not exists (
          select 1 from public.refund_operations r
          where r.workspace_id = s.workspace_id and r.subscription_id = s.id
        )
        and (
          (app_private.f13_project_entitlement(
            s.workspace_id, s.id, (clock_timestamp() at time zone 'Africa/Cairo')::date
          )->>'status') in ('active', 'frozen', 'awaiting_activation', 'future')
          or exists (
            select 1
            from public.subscription_installments i
            where i.workspace_id = s.workspace_id
              and i.subscription_id = s.id
              and not exists (
                select 1 from public.subscription_obligation_cancellations c_cancel
                where c_cancel.workspace_id = i.workspace_id and c_cancel.obligation_id = i.id
              )
              and (
                select e.kind from public.payment_events e
                where e.workspace_id = i.workspace_id and e.obligation_id = i.id
                order by e.revision desc limit 1
              ) is distinct from 'collection'
          )
        )
    ) into v_has_financial_obligation;

    if p_financial_confirmation_audit_id is not null then
      select * into v_conf_event from public.audit_events e
        where e.id = p_financial_confirmation_audit_id;
      if not found
        or v_conf_event.action <> 'account_deletion.financial_confirmed'
        or v_conf_event.target_table <> 'clients'
        or v_conf_event.target_id <> v_cid
        or v_conf_event.workspace_id <> v_ws
        or not app_private.deletion_financial_confirmation_valid(
          v_conf_event.details->>'category',
          case when (v_conf_event.details->'acknowledgement_verified') = 'true'::jsonb
            then 'I understand this only records the financial resolution. It does not process a refund, collect a payment, or cancel any subscription or debt.'
            else '' end
        ) then
        raise exception using errcode = '23514', message = 'invalid_financial_confirmation';
      end if;
      if exists (
        select 1 from app_private.account_deletion_intents i
        where i.financial_confirmation_audit_id = p_financial_confirmation_audit_id
      ) then
        raise exception using errcode = '23514', message = 'financial_confirmation_already_used';
      end if;
      v_conf_audit_id := v_conf_event.id;
    elsif p_financial_confirmation is not null then
      if jsonb_typeof(p_financial_confirmation) is distinct from 'object'
        or exists (
          select 1 from jsonb_object_keys(p_financial_confirmation) k
          where k not in ('category', 'acknowledgement')
        )
        or jsonb_typeof(p_financial_confirmation->'category') is distinct from 'string'
        or jsonb_typeof(p_financial_confirmation->'acknowledgement') is distinct from 'string' then
        raise exception using errcode = '23514', message = 'invalid_financial_confirmation';
      end if;
      v_category := p_financial_confirmation->>'category';
      v_acknowledgement := p_financial_confirmation->>'acknowledgement';
      if not app_private.deletion_financial_confirmation_valid(v_category, v_acknowledgement) then
        raise exception using errcode = '23514', message = 'invalid_financial_confirmation';
      end if;
      insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
      values (
        actor,
        'account_deletion.financial_confirmed',
        'clients',
        v_cid,
        v_ws,
        jsonb_build_object('category', v_category, 'acknowledgement_verified', true)
      )
      returning id into v_conf_audit_id;
    elsif v_has_financial_obligation then
      raise exception using errcode = '23514', message = 'financial_confirmation_required';
    end if;
  end if;

  insert into app_private.account_deletion_intents (
    target_user_id, target_kind, client_id, workspace_id,
    authorized_by_user_id, authorized_capability, financial_confirmation_audit_id, state
  ) values (
    p_target_user_id, v_target_kind, v_cid, v_ws,
    actor, v_capability, v_conf_audit_id, 'pending_ban'
  )
  returning id into v_intent_id;

  if v_target_kind = 'client' then
    v_proof := app_private.deletion_transition_proof(v_intent_id, 'deletion_pending');
    if v_proof is null then
      raise exception using errcode = '55000', message = 'deletion_proof_unavailable';
    end if;
    perform set_config('app_private.deletion_transition_proof', v_proof, true);
    update public.clients
    set deletion_state = 'deletion_pending'
    where workspace_id = v_ws and id = v_cid;
    perform set_config('app_private.deletion_transition_proof', '', true);
  end if;

  insert into public.audit_events (actor_user_id, action, target_table, target_id, workspace_id, details)
  values (
    actor,
    'account_deletion.requested',
    'account_deletion_intents',
    v_intent_id,
    v_ws,
    jsonb_build_object('target_kind', v_target_kind, 'state', 'pending_ban')
  );

  return jsonb_build_object('status', 'deletion_pending', 'intent_id', v_intent_id);
end $$;
alter function public.request_account_deletion(uuid, jsonb, bigint) owner to postgres;
revoke all on function public.request_account_deletion(uuid, jsonb, bigint) from public, anon, authenticated, service_role;
grant execute on function public.request_account_deletion(uuid, jsonb, bigint) to authenticated;

-- 11. Restricted continuation app_private step functions (S64-R21, S64-R46).
create function app_private.deletion_mark_banned(p_intent_id uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  intent app_private.account_deletion_intents%rowtype;
  u auth.users%rowtype;
begin
  select * into intent from app_private.account_deletion_intents i
  where i.id = p_intent_id for update;
  if not found then return false; end if;
  if intent.state in ('banned_pending_db', 'release_pending', 'auth_release_in_progress', 'completed') then
    return true;
  end if;
  if intent.state <> 'pending_ban' then return false; end if;

  select * into u from auth.users where id = intent.target_user_id for share;
  if not found or u.banned_until is null or u.banned_until <= clock_timestamp() then
    return false;
  end if;

  update app_private.account_deletion_intents
  set state = 'banned_pending_db',
      banned_at = clock_timestamp(),
      last_error_code = null
  where id = intent.id;

  insert into public.audit_events (actor_user_id, action, target_table, target_id, workspace_id, details)
  values (
    null,
    'account_deletion.banned',
    'account_deletion_intents',
    intent.id,
    intent.workspace_id,
    jsonb_build_object('target_kind', intent.target_kind)
  );

  return true;
end $$;
alter function app_private.deletion_mark_banned(uuid) owner to postgres;
revoke all on function app_private.deletion_mark_banned(uuid) from public, anon, authenticated, service_role;

create function app_private.deletion_execute_step_b(p_intent_id uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  intent app_private.account_deletion_intents%rowtype;
  u auth.users%rowtype;
  v_owner_count bigint;
  v_staff public.staff_profiles%rowtype;
  v_lock_ws uuid;
  v_client public.clients%rowtype;
  v_proof text;
  v_assignment record;
  v_trainer_id uuid;
  v_membership_id uuid;
  v_assignments_snapshot jsonb;
begin
  select * into intent from app_private.account_deletion_intents i
  where i.id = p_intent_id for update;
  if not found then return false; end if;
  if intent.state in ('release_pending', 'auth_release_in_progress', 'completed') then
    return true;
  end if;
  if intent.state <> 'banned_pending_db' or intent.banned_at is null then
    return false;
  end if;

  select * into u from auth.users where id = intent.target_user_id for share;
  if not found or u.banned_until is null or u.banned_until <= clock_timestamp() then
    return false;
  end if;

  -- Global lock order (S64-R46(2)):
  -- 1) f3_platform_owner_state FOR UPDATE
  select owner_count into v_owner_count
  from app_private.f3_platform_owner_state
  where singleton
  for update;

  -- 2) per-target-user advisory lock
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('f11.staff_deletion_target:' || intent.target_user_id::text, 0)
  );

  if intent.target_kind = 'staff' then
    select * into v_staff from public.staff_profiles where user_id = intent.target_user_id for update;
    if v_staff.role = 'platform_owner'::public.staff_role then
      if v_owner_count is null or v_owner_count < 1 or not exists (
        select 1 from public.staff_profiles p
        where p.user_id <> intent.target_user_id
          and p.role = 'platform_owner'::public.staff_role
          and not exists (
            select 1 from app_private.account_deletion_intents di
            where di.target_user_id = p.user_id
          )
      ) then
        raise exception using errcode = '42501', message = 'not_permitted';
      end if;
    end if;

    -- 3) per-workspace advisory locks ascending
    for v_lock_ws in
      select affected.ws_id from (
        select m.workspace_id as ws_id from public.workspace_memberships m
        where m.user_id = intent.target_user_id and m.revoked_at is null
        union
        select a.workspace_id as ws_id from public.client_trainer_assignments a
        where a.trainer_user_id = intent.target_user_id and a.ended_at is null
      ) affected
      order by affected.ws_id
    loop
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('f11.responsible_trainer.workspace:' || v_lock_ws::text, 0)
      );
    end loop;

    -- 4) clients rows FOR UPDATE ascending + 5) active assignments FOR UPDATE
    perform c.id
    from public.clients c
    join public.client_trainer_assignments a
      on a.workspace_id = c.workspace_id and a.client_id = c.id
    where a.trainer_user_id = intent.target_user_id and a.ended_at is null
    order by c.workspace_id, c.id
    for update of c;

    select coalesce(jsonb_agg(jsonb_build_object(
      'assignment_id', a.id,
      'workspace_id', a.workspace_id,
      'client_id', a.client_id,
      'approval_state', c.approval_state,
      'deletion_state', c.deletion_state,
      'deactivated_at', c.deactivated_at
    ) order by a.workspace_id, a.client_id), '[]'::jsonb)
    into v_assignments_snapshot
    from public.client_trainer_assignments a
    join public.clients c
      on c.workspace_id = a.workspace_id and c.id = a.client_id
    where a.trainer_user_id = intent.target_user_id and a.ended_at is null;

    update public.client_trainer_assignments a
    set ended_at = statement_timestamp(),
        ended_by = null,
        ended_by_system = true
    where a.trainer_user_id = intent.target_user_id and a.ended_at is null;

    -- Revoke all active workspace memberships with authorized_by_user_id (S64-R46(4)).
    update public.workspace_memberships
    set revoked_at = now(),
        revoked_by = intent.authorized_by_user_id
    where user_id = intent.target_user_id and revoked_at is null;

    -- Reassign each captured client by FR-028 (b)-(e), (h) or record deletion-lifecycle no-op.
    for v_assignment in
      select
        (item->>'workspace_id')::uuid as workspace_id,
        (item->>'client_id')::uuid as client_id,
        item->>'approval_state' as approval_state,
        item->>'deletion_state' as deletion_state,
        (item->>'deactivated_at') is not null as is_deactivated
      from jsonb_array_elements(v_assignments_snapshot) as item
    loop
      if v_assignment.deletion_state <> 'active'
        or v_assignment.is_deactivated
        or v_assignment.approval_state <> 'approved' then
        insert into public.audit_events (actor_user_id, action, target_table, target_id, workspace_id, details)
        values (
          null,
          'account_deletion.reassignment_skipped',
          'clients',
          v_assignment.client_id,
          v_assignment.workspace_id,
          jsonb_build_object(
            'intent_id', intent.id,
            'reason', case when v_assignment.deletion_state <> 'active' then 'deletion_lifecycle' else 'ineligible' end
          )
        );
        continue;
      end if;

      v_trainer_id := null;
      v_membership_id := null;
      with eligible as (
        select m.user_id, m.id as membership_id,
          (
            select count(*)::bigint
            from public.client_trainer_assignments active
            join public.clients active_client
              on active_client.workspace_id = active.workspace_id
              and active_client.id = active.client_id
            where active.workspace_id = m.workspace_id
              and active.trainer_user_id = m.user_id
              and active.ended_at is null
              and active_client.approval_state = 'approved'
              and active_client.deletion_state = 'active'
              and active_client.deactivated_at is null
          ) as assigned_count,
          (
            select max(history.assigned_at)
            from public.client_trainer_assignments history
            where history.workspace_id = m.workspace_id
              and history.trainer_user_id = m.user_id
          ) as last_assigned_at
        from public.workspace_memberships m
        join public.staff_profiles p on p.user_id = m.user_id
          and p.role = 'trainer'::public.staff_role
        where m.workspace_id = v_assignment.workspace_id
          and m.revoked_at is null
          and not exists (
            select 1 from app_private.account_deletion_intents di
            where di.target_user_id = m.user_id
          )
      )
      select e.user_id, e.membership_id into v_trainer_id, v_membership_id
      from eligible e
      order by e.assigned_count, e.last_assigned_at nulls first, e.last_assigned_at, e.user_id
      limit 1;

      if v_trainer_id is not null then
        insert into public.client_trainer_assignments (
          workspace_id, client_id, trainer_user_id, assignment_source,
          assigned_by, workspace_membership_id, source_deletion_intent_id
        ) values (
          v_assignment.workspace_id, v_assignment.client_id, v_trainer_id, 'trainer_deletion',
          null, v_membership_id, intent.id
        );
      end if;
    end loop;
  else
    -- Client account step (B)
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('f11.responsible_trainer.workspace:' || intent.workspace_id::text, 0)
    );
    select * into v_client from public.clients c
    where c.workspace_id = intent.workspace_id and c.id = intent.client_id
    for update;
    if not found or v_client.deletion_state <> 'deletion_pending' then
      return false;
    end if;

    update public.client_trainer_assignments a
    set ended_at = statement_timestamp(),
        ended_by = null,
        ended_by_system = true
    where a.workspace_id = intent.workspace_id
      and a.client_id = intent.client_id
      and a.ended_at is null;

    v_proof := app_private.deletion_transition_proof(intent.id, 'release_pending');
    if v_proof is null then
      raise exception using errcode = '55000', message = 'deletion_proof_unavailable';
    end if;
    perform set_config('app_private.deletion_transition_proof', v_proof, true);
    update public.clients
    set deletion_state = 'release_pending'
    where workspace_id = intent.workspace_id and id = intent.client_id;
    perform set_config('app_private.deletion_transition_proof', '', true);
  end if;

  update app_private.account_deletion_intents
  set state = 'release_pending',
      db_released_at = clock_timestamp(),
      last_error_code = null
  where id = intent.id;

  insert into public.audit_events (actor_user_id, action, target_table, target_id, workspace_id, details)
  values (
    null,
    'account_deletion.release_pending',
    'account_deletion_intents',
    intent.id,
    intent.workspace_id,
    jsonb_build_object('target_kind', intent.target_kind)
  );

  return true;
end $$;
alter function app_private.deletion_execute_step_b(uuid) owner to postgres;
revoke all on function app_private.deletion_execute_step_b(uuid) from public, anon, authenticated, service_role;

create function app_private.deletion_begin_step_c(p_intent_id uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  intent app_private.account_deletion_intents%rowtype;
begin
  select * into intent from app_private.account_deletion_intents i
  where i.id = p_intent_id for update;
  if not found then return false; end if;
  if intent.state in ('auth_release_in_progress', 'completed') then
    return true;
  end if;
  if intent.state <> 'release_pending' or intent.db_released_at is null then
    return false;
  end if;

  update app_private.account_deletion_intents
  set state = 'auth_release_in_progress'
  where id = intent.id;

  return true;
end $$;
alter function app_private.deletion_begin_step_c(uuid) owner to postgres;
revoke all on function app_private.deletion_begin_step_c(uuid) from public, anon, authenticated, service_role;

create function app_private.deletion_execute_step_d(p_intent_id uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  intent app_private.account_deletion_intents%rowtype;
  u auth.users%rowtype;
  claims app_private.account_identifier_claims%rowtype;
  v_client public.clients%rowtype;
  v_transition_proof text;
  v_claim_proof text;
  v_placeholder_email text;
  v_now timestamptz;
begin
  select * into intent from app_private.account_deletion_intents i
  where i.id = p_intent_id for update;
  if not found then return false; end if;
  if intent.state = 'completed' then return true; end if;
  if intent.state <> 'auth_release_in_progress' then return false; end if;

  v_placeholder_email := 'deleted+' || intent.id::text || '@deleted.invalid';

  select * into u from auth.users where id = intent.target_user_id for share;
  if not found
    or u.banned_until is null
    or u.banned_until <= clock_timestamp()
    or lower(coalesce(u.email, '')) <> v_placeholder_email
    or coalesce(u.phone, '') <> ''
    or coalesce(u.raw_user_meta_data, '{}'::jsonb) <> '{}'::jsonb then
    return false;
  end if;

  select * into claims from app_private.account_identifier_claims c_claims
  where c_claims.auth_user_id = intent.target_user_id;

  perform app_private.signup_lock_identity_keys(
    intent.target_user_id,
    array['email:' || claims.email_key, 'phone:' || claims.phone_key]
  );

  v_now := clock_timestamp();
  update app_private.account_deletion_intents
  set auth_released_at = coalesce(auth_released_at, v_now)
  where id = intent.id
  returning * into intent;

  if intent.target_kind = 'client' then
    select * into v_client from public.clients c
    where c.workspace_id = intent.workspace_id and c.id = intent.client_id
    for update;
    if not found or v_client.deletion_state <> 'release_pending' then
      return false;
    end if;

    v_transition_proof := app_private.deletion_transition_proof(intent.id, 'released');
    if v_transition_proof is null then
      raise exception using errcode = '55000', message = 'deletion_proof_unavailable';
    end if;
    perform set_config('app_private.deletion_transition_proof', v_transition_proof, true);
    update public.clients
    set deletion_state = 'released',
        email_normalized = null,
        phone_e164 = null,
        name = null,
        date_of_birth = null,
        username_normalized = null,
        telegram_username = null
    where workspace_id = intent.workspace_id and id = intent.client_id;
    perform set_config('app_private.deletion_transition_proof', '', true);
  end if;

  if claims.auth_user_id is not null then
    v_claim_proof := app_private.deletion_claim_release_proof(intent.id);
    if v_claim_proof is null then
      raise exception using errcode = '55000', message = 'deletion_proof_unavailable';
    end if;
    perform set_config('app_private.deletion_claim_release_proof', v_claim_proof, true);
    update app_private.account_identifier_claims
    set email_key = null,
        phone_key = null
    where auth_user_id = intent.target_user_id;
    perform set_config('app_private.deletion_claim_release_proof', '', true);
  end if;

  update app_private.account_deletion_intents
  set state = 'completed',
      completed_at = v_now,
      financial_confirmation_consumed_at = case
        when financial_confirmation_audit_id is not null then v_now
        else null
      end,
      lease_token = null,
      lease_expires_at = null,
      last_error_code = null
  where id = intent.id;

  insert into public.audit_events (actor_user_id, action, target_table, target_id, workspace_id, details)
  values
    (
      null,
      'account_deletion.auth_released',
      'account_deletion_intents',
      intent.id,
      intent.workspace_id,
      jsonb_build_object('target_kind', intent.target_kind)
    ),
    (
      null,
      'account_deletion.completed',
      'account_deletion_intents',
      intent.id,
      intent.workspace_id,
      jsonb_build_object(
        'target_kind', intent.target_kind,
        'financial_confirmation_consumed', intent.financial_confirmation_audit_id is not null
      )
    );

  return true;
end $$;
alter function app_private.deletion_execute_step_d(uuid) owner to postgres;
revoke all on function app_private.deletion_execute_step_d(uuid) from public, anon, authenticated, service_role;

-- 12. Service-role-only lease-checked wrapper RPCs (S64-R21, S64-R46).
create function public.claim_account_deletion_intents(p_limit integer default 25)
returns table (
  id uuid,
  target_user_id uuid,
  target_kind text,
  state text,
  attempts integer,
  lease_token uuid
)
language sql volatile security definer set search_path = '' as $$
  with due as (
    select q.id
    from app_private.account_deletion_intents q
    where q.state <> 'completed'
      and q.next_attempt_at <= clock_timestamp()
      and (q.lease_expires_at is null or q.lease_expires_at <= clock_timestamp())
    order by q.next_attempt_at, q.created_at, q.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  ), leased as (
    update app_private.account_deletion_intents q
    set lease_token = gen_random_uuid(),
        lease_expires_at = clock_timestamp() + interval '5 minutes'
    from due
    where q.id = due.id
    returning q.id, q.target_user_id, q.target_kind, q.state, q.attempts, q.lease_token
  )
  select leased.id, leased.target_user_id, leased.target_kind, leased.state, leased.attempts, leased.lease_token
  from leased;
$$;

create function public.advance_deletion_step_a(p_intent_id uuid, p_lease_token uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare valid_lease boolean;
begin
  if p_intent_id is null or p_lease_token is null then return false; end if;
  select exists (
    select 1 from app_private.account_deletion_intents q
    where q.id = p_intent_id
      and q.lease_token = p_lease_token
      and q.lease_expires_at > clock_timestamp()
    for update
  ) into valid_lease;
  if not valid_lease then return false; end if;
  return app_private.deletion_mark_banned(p_intent_id);
end $$;

create function public.execute_deletion_step_b(p_intent_id uuid, p_lease_token uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare valid_lease boolean;
begin
  if p_intent_id is null or p_lease_token is null then return false; end if;
  select exists (
    select 1 from app_private.account_deletion_intents q
    where q.id = p_intent_id
      and q.lease_token = p_lease_token
      and q.lease_expires_at > clock_timestamp()
    for update
  ) into valid_lease;
  if not valid_lease then return false; end if;
  return app_private.deletion_execute_step_b(p_intent_id);
end $$;

create function public.begin_deletion_step_c(p_intent_id uuid, p_lease_token uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare valid_lease boolean;
begin
  if p_intent_id is null or p_lease_token is null then return false; end if;
  select exists (
    select 1 from app_private.account_deletion_intents q
    where q.id = p_intent_id
      and q.lease_token = p_lease_token
      and q.lease_expires_at > clock_timestamp()
    for update
  ) into valid_lease;
  if not valid_lease then return false; end if;
  return app_private.deletion_begin_step_c(p_intent_id);
end $$;

create function public.execute_deletion_step_d(p_intent_id uuid, p_lease_token uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare valid_lease boolean;
begin
  if p_intent_id is null or p_lease_token is null then return false; end if;
  select exists (
    select 1 from app_private.account_deletion_intents q
    where q.id = p_intent_id
      and q.lease_token = p_lease_token
      and q.lease_expires_at > clock_timestamp()
    for update
  ) into valid_lease;
  if not valid_lease then return false; end if;
  return app_private.deletion_execute_step_d(p_intent_id);
end $$;

create function public.retry_account_deletion_intent(
  p_intent_id uuid,
  p_lease_token uuid,
  p_attempt integer,
  p_retry_at timestamptz,
  p_safe_error_code text
) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_intent_id is null
    or p_lease_token is null
    or p_attempt is null
    or p_attempt < 1
    or p_retry_at is null
    or p_safe_error_code is null
    or p_safe_error_code not in (
      'provider_unavailable', 'auth_admin_unavailable', 'metadata_not_empty', 'step_b_failed', 'step_d_failed'
    ) then
    return false;
  end if;

  update app_private.account_deletion_intents q
  set attempts = p_attempt,
      next_attempt_at = p_retry_at,
      last_error_code = p_safe_error_code,
      lease_token = null,
      lease_expires_at = null
  where q.id = p_intent_id
    and q.lease_token = p_lease_token
    and q.state <> 'completed'
    and p_attempt = q.attempts + 1;

  return found;
end $$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.claim_account_deletion_intents(integer)',
    'public.advance_deletion_step_a(uuid,uuid)',
    'public.execute_deletion_step_b(uuid,uuid)',
    'public.begin_deletion_step_c(uuid,uuid)',
    'public.execute_deletion_step_d(uuid,uuid)',
    'public.retry_account_deletion_intent(uuid,uuid,integer,timestamp with time zone,text)'
  ] loop
    execute format('alter function %s owner to postgres', signature);
    execute format('revoke all on function %s from public, anon, authenticated, service_role', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end $$;
