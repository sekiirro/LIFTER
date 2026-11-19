-- Compose the F24 username-change guard with the F11 deletion-state guard.
-- F11 is timestamped after F24 so its function replacement must retain F24's
-- transaction marker check while keeping deletion and deactivation checks.
create or replace function app_private.f12_guard_client_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  refund_match boolean;
  closure_match boolean;
  intent app_private.account_deletion_intents%rowtype;
  expected_proof text;
begin
  if old.deletion_state = 'active'
    and new.deletion_state = 'active'
    and old.deactivated_at is null
    and new.deactivated_at is null
    and new.username_normalized is distinct from old.username_normalized
    and (to_jsonb(new) - 'username_normalized') = (to_jsonb(old) - 'username_normalized') then
    if new.username_normalized is null
      or new.username_normalized !~ '^[a-z0-9_.]{3,20}$'
      or old.auth_user_id is distinct from auth.uid()
      or not exists(select 1 from app_private.client_username_changes u
        where u.workspace_id = old.workspace_id and u.client_id = old.id
          and u.actor_user_id = auth.uid() and u.transaction_id = pg_current_xact_id()) then
      raise exception 'invalid_client_transition' using errcode = '23514';
    end if;
    return new;
  end if;

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
