-- F22 US3 (FR-009; PO 2026-11-14 PO-4 "F19 hook + F22 inbox"): client-recipient
-- extension of the F15 in-app inbox surface. F15's staff tables and RPCs
-- (`form_alert_inbox`, `read_form_alert_inbox`, `mark_form_alert_read`) are
-- unchanged: their recipient is a staff profile and their source a form
-- assignment, so client notices live in this sibling table under the same
-- rules (IDs-only rows, producer-keyed deduplication, read_at, audit).
-- No producer is wired here: delivery/activation notices wait for the F19
-- hook, and F23 check-in reminders call the enqueue function below.

create table app_private.client_inbox_notices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  notice_kind text not null constraint client_inbox_notices_kind_check check (notice_kind in (
    'workout_delivered', 'nutrition_delivered', 'subscription_activated',
    'workout_delivered_activated', 'nutrition_delivered_activated',
    'checkin_reminder_day_of', 'checkin_reminder_followup'
  )),
  -- Producer-supplied idempotency key (e.g. F19 delivery id, F23 reminder occurrence id).
  source_key uuid not null,
  created_at timestamptz not null default clock_timestamp() check (isfinite(created_at)),
  read_at timestamptz check (read_at is null or (isfinite(read_at) and read_at >= created_at)),
  unique (workspace_id, id),
  unique (workspace_id, client_id, notice_kind, source_key),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id) on delete restrict
);
create index client_inbox_notices_recipient_idx
  on app_private.client_inbox_notices (workspace_id, client_id, created_at desc, id desc);
alter table app_private.client_inbox_notices owner to postgres;
alter table app_private.client_inbox_notices enable row level security;
alter table app_private.client_inbox_notices force row level security;
revoke all on app_private.client_inbox_notices from public, anon, authenticated, service_role;

-- Only read_at may change, once; rows are never deleted through the API.
create function app_private.f22_guard_client_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'UPDATE' or old.read_at is not null or new.read_at is null
    or (new.id, new.workspace_id, new.client_id, new.notice_kind, new.source_key, new.created_at)
      is distinct from (old.id, old.workspace_id, old.client_id, old.notice_kind, old.source_key, old.created_at) then
    raise exception 'client_notice_immutable' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger client_inbox_notices_guard
  before update or delete on app_private.client_inbox_notices
  for each row execute function app_private.f22_guard_client_notice();
create trigger client_inbox_notices_no_truncate
  before truncate on app_private.client_inbox_notices
  for each statement execute function app_private.f22_guard_client_notice();

-- Server-side producer seam (F19 delivery/activation hook, F23 reminders).
-- Callable only from postgres-owned SECURITY DEFINER code. Idempotent on
-- (workspace, client, kind, source_key): returns the existing notice id.
-- Returns null, writing nothing, when the client is not an approved, active
-- client of that workspace. Raises 22023 for missing arguments or an unknown kind.
create function app_private.f22_enqueue_client_notice(
  p_workspace_id uuid, p_client_id uuid, p_notice_kind text, p_source_key uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare notice_id uuid;
begin
  if p_workspace_id is null or p_client_id is null or p_source_key is null
    or p_notice_kind is null or p_notice_kind not in (
      'workout_delivered', 'nutrition_delivered', 'subscription_activated',
      'workout_delivered_activated', 'nutrition_delivered_activated',
      'checkin_reminder_day_of', 'checkin_reminder_followup') then
    raise exception 'invalid_client_notice' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.clients c
    where c.workspace_id = p_workspace_id and c.id = p_client_id
      and c.approval_state = 'approved' and c.deactivated_at is null
  ) then
    return null;
  end if;
  insert into app_private.client_inbox_notices(workspace_id, client_id, notice_kind, source_key)
    values (p_workspace_id, p_client_id, p_notice_kind, p_source_key)
    on conflict (workspace_id, client_id, notice_kind, source_key) do nothing
    returning id into notice_id;
  if notice_id is null then
    select n.id into notice_id from app_private.client_inbox_notices n
      where n.workspace_id = p_workspace_id and n.client_id = p_client_id
        and n.notice_kind = p_notice_kind and n.source_key = p_source_key;
    return notice_id;
  end if;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
    values (auth.uid(), 'client_notice.enqueued', 'client_inbox_notices', notice_id, p_workspace_id,
      jsonb_build_object('client_id', p_client_id, 'notice_kind', p_notice_kind));
  return notice_id;
end $$;

-- Client self-read of own notices, newest first. Non-clients get `invalid`.
create function public.read_client_notices(p_limit integer default 50, p_before timestamptz default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare client_row record; notices jsonb;
begin
  select * into client_row from app_private.f22_portal_client();
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
    or (p_before is not null and not isfinite(p_before)) then
    return jsonb_build_object('status', 'invalid_input');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'notice_id', x.id, 'notice_kind', x.notice_kind,
      'created_at', x.created_at, 'read_at', x.read_at)
      order by x.created_at desc, x.id desc), '[]'::jsonb)
    into notices
  from (
    select n.id, n.notice_kind, n.created_at, n.read_at
    from app_private.client_inbox_notices n
    where n.workspace_id = client_row.workspace_id and n.client_id = client_row.client_id
      and (p_before is null or n.created_at < p_before)
    order by n.created_at desc, n.id desc
    limit p_limit
  ) x;
  return jsonb_build_object('status', 'ok', 'notices', notices);
end $$;

-- Client marks one own notice read. Foreign or unknown ids share `not_found`.
create function public.mark_client_notice_read(p_notice_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare client_row record; notice app_private.client_inbox_notices%rowtype;
begin
  select * into client_row from app_private.f22_portal_client();
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if p_notice_id is null then return jsonb_build_object('status', 'not_found'); end if;
  select * into notice from app_private.client_inbox_notices n
    where n.workspace_id = client_row.workspace_id and n.client_id = client_row.client_id
      and n.id = p_notice_id
    for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if notice.read_at is null then
    update app_private.client_inbox_notices set read_at = clock_timestamp()
      where workspace_id = notice.workspace_id and id = notice.id;
    insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
      values (auth.uid(), 'client_notice.marked_read', 'client_inbox_notices', notice.id,
        notice.workspace_id, jsonb_build_object('notice_kind', notice.notice_kind));
  end if;
  return jsonb_build_object('status', 'read');
end $$;

alter function app_private.f22_guard_client_notice() owner to postgres;
alter function app_private.f22_enqueue_client_notice(uuid, uuid, text, uuid) owner to postgres;
alter function public.read_client_notices(integer, timestamptz) owner to postgres;
alter function public.mark_client_notice_read(uuid) owner to postgres;
revoke all on function app_private.f22_guard_client_notice(),
  app_private.f22_enqueue_client_notice(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.read_client_notices(integer, timestamptz),
  public.mark_client_notice_read(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_client_notices(integer, timestamptz) to authenticated;
grant execute on function public.mark_client_notice_read(uuid) to authenticated;
comment on table app_private.client_inbox_notices is
  'F22 client-recipient extension of the F15 in-app inbox: IDs-only, producer-keyed dedup, read_at.';
comment on function app_private.f22_enqueue_client_notice(uuid, uuid, text, uuid) is
  'F22 producer seam for client notices (F19 hook, F23 reminders); idempotent; null for ineligible clients.';

notify pgrst, 'reload schema';
