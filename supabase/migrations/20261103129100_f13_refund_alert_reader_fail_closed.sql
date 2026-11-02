-- F13 FIX A: fail closed when an authenticated caller has no staff profile.
create or replace function public.read_refund_auth_lockout_alerts(p_limit integer default 50)
returns table(
  alert_id uuid,lockout_id uuid,workspace_id uuid,reason text,safe_error_code text,
  attempts integer,created_at timestamptz,resolved_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); actor_role public.staff_role;
begin
  if actor is null then return; end if;
  select p.role into actor_role from public.staff_profiles p where p.user_id=actor;
  if actor_role is null or actor_role not in (
    'platform_owner'::public.staff_role,'workspace_owner'::public.staff_role
  ) then return; end if;
  return query
    select a.id,a.lockout_id,a.workspace_id,a.reason,a.safe_error_code,a.attempts,a.created_at,a.resolved_at
    from app_private.refund_auth_lockout_alerts a
    where actor=any(a.recipient_user_ids)
      and (actor_role='platform_owner'::public.staff_role or exists(
        select 1 from public.workspace_memberships m
        where m.workspace_id=a.workspace_id and m.user_id=actor and m.revoked_at is null
      ))
      and a.resolved_at is null
    order by a.created_at desc,a.id
    limit greatest(1,least(coalesce(p_limit,50),100));
end $$;

alter function public.read_refund_auth_lockout_alerts(integer) owner to postgres;
revoke all on function public.read_refund_auth_lockout_alerts(integer)
  from public,anon,authenticated,service_role;
grant execute on function public.read_refund_auth_lockout_alerts(integer) to authenticated;
