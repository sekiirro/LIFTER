-- F11 T059: SQL NULL must not bypass the approved confirmation validation.
create or replace function public.record_deletion_financial_confirmation(
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
    or app_private.deletion_financial_confirmation_valid(p_category, p_acknowledgement) is not true then
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
revoke all on function public.record_deletion_financial_confirmation(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_deletion_financial_confirmation(uuid, uuid, text, text)
  to authenticated;
