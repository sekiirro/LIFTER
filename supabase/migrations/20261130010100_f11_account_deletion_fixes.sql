-- S65-R32: forward fixes for F11 account deletion continuation.

-- Prevent orphaned financial confirmation references. The original intents were
-- created only after validating this audit row; NOT VALID keeps the DDL safe for
-- existing data while VALIDATE checks the already-approved rows.
alter table app_private.account_deletion_intents
  add constraint account_deletion_intents_financial_confirmation_audit_fk
  foreign key (financial_confirmation_audit_id)
  references public.audit_events(id)
  on delete restrict
  not valid;

alter table app_private.account_deletion_intents
  validate constraint account_deletion_intents_financial_confirmation_audit_fk;

create or replace function app_private.deletion_execute_step_d(p_intent_id uuid) returns boolean
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

  -- Global client-writer order: workspace advisory lock, client row, then
  -- identity-key locks and identifier-claim mutation. Staff has no client row.
  if intent.target_kind = 'client' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('f11.responsible_trainer.workspace:' || intent.workspace_id::text, 0)
    );
    select * into v_client from public.clients c
    where c.workspace_id = intent.workspace_id and c.id = intent.client_id
    for update;
    if not found or v_client.deletion_state <> 'release_pending' then
      return false;
    end if;
  end if;

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

  if claims.auth_user_id is not null then
    perform app_private.signup_lock_identity_keys(
      intent.target_user_id,
      array['email:' || claims.email_key, 'phone:' || claims.phone_key]
    );
  end if;

  v_now := clock_timestamp();
  update app_private.account_deletion_intents
  set auth_released_at = coalesce(auth_released_at, v_now)
  where id = intent.id
  returning * into intent;

  if intent.target_kind = 'client' then
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

create or replace function public.retry_account_deletion_intent(
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
    and q.lease_expires_at > clock_timestamp()
    and q.state <> 'completed'
    and p_attempt = q.attempts + 1;

  return found;
end $$;
alter function public.retry_account_deletion_intent(uuid, uuid, integer, timestamptz, text) owner to postgres;
revoke all on function public.retry_account_deletion_intent(uuid, uuid, integer, timestamptz, text) from public, anon, authenticated, service_role;
grant execute on function public.retry_account_deletion_intent(uuid, uuid, integer, timestamptz, text) to service_role;
