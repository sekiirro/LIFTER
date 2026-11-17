-- T031 (FR-010): align recovery-link limits with S31-PO-3 SK-004-04.
-- Approved: 10 links per issuing staff account per rolling hour and
-- 3 per client per rolling 24 hours across all issuers. Replaces the
-- 20 / 3 / 1-hour placeholders installed by 20261028120000.
-- Committed migrations are never edited; this is a forward migration.
-- app_private.recovery_link_limits() changes return type (3 -> 4 columns),
-- so PostgreSQL requires drop-and-recreate rather than create or replace.
-- The dependent guard and the two public wrappers are dropped and recreated
-- explicitly, without CASCADE, so an unnoticed dependency fails the migration.

begin;

drop function public.recovery_link_authorize(uuid);
drop function public.recovery_link_record(uuid);
drop function app_private.recovery_link_guard(uuid);
drop function app_private.recovery_link_limits();

-- FR-010: separate counters with separate rolling windows.
create function app_private.recovery_link_limits()
returns table(per_actor int, per_actor_win interval, per_target int, per_target_win interval)
language sql immutable set search_path = '' as $$
  select 10, interval '1 hour', 3, interval '24 hours';
$$;

-- FR-006, FR-007, FR-010: every denial is identical so target existence is
-- not disclosed; the two capacity checks use their own approved windows.
create function app_private.recovery_link_guard(target uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  ws uuid;
  limits record;
begin
  if auth.uid() is null then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  ws := app_private.recovery_target_workspace(target);
  if ws is null
    or not app_private.has_workspace_access(ws, 'generate_recovery_link')
    or target = auth.uid()
    or exists (select 1 from public.staff_profiles where user_id = target) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select * into limits from app_private.recovery_link_limits();
  if (select count(*) from public.recovery_link_issuances where issued_by = auth.uid() and issued_at >= now() - limits.per_actor_win) >= limits.per_actor
    or (select count(*) from public.recovery_link_issuances where target_user_id = target and issued_at >= now() - limits.per_target_win) >= limits.per_target then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return ws;
end;
$$;

-- FR-007: user-JWT preflight before any privileged provider call.
create function public.recovery_link_authorize(target uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  return app_private.recovery_link_guard(target);
end;
$$;

-- FR-009, FR-010: serialize by target and actor before repeating all checks.
create function public.recovery_link_record(target uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  ws uuid;
  issuance uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(target::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  ws := app_private.recovery_link_guard(target);
  insert into public.recovery_link_issuances (workspace_id, target_user_id, issued_by)
    values (ws, target, auth.uid()) returning id into issuance;
  return issuance;
end;
$$;

-- Restore each definition's attributes and privileges exactly as installed.
alter function app_private.recovery_link_limits() owner to postgres;
revoke execute on function app_private.recovery_link_limits() from public, anon, authenticated, service_role;
alter function app_private.recovery_link_guard(uuid) owner to postgres;
revoke execute on function app_private.recovery_link_guard(uuid) from public, anon, authenticated, service_role;
alter function public.recovery_link_authorize(uuid) owner to postgres;
revoke execute on function public.recovery_link_authorize(uuid) from public, anon, authenticated, service_role;
alter function public.recovery_link_record(uuid) owner to postgres;
revoke execute on function public.recovery_link_record(uuid) from public, anon, authenticated, service_role;
grant execute on function public.recovery_link_authorize(uuid), public.recovery_link_record(uuid) to authenticated;

commit;
