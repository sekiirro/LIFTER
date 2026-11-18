-- F11 S66-PO-1 (option A): random per-workspace client code. 8 characters from the
-- 32-character unambiguous alphabet (digits 2-9 and letters A-Z without I and O),
-- stored unformatted in public.clients.client_code and displayed as XXXX-XXXX.
-- Unique on (workspace_id, client_code), assigned by trigger at every client creation
-- path, immutable afterwards, staff-visible through the existing F11 reader predicate only.
alter table public.clients add column client_code text;

create function app_private.normalize_client_code(p_code text) returns text
language sql immutable security definer set search_path = '' as $$
  select case when s.v ~ '^[2-9A-HJ-NP-Z]{8}$' then s.v end
  from (select upper(replace(btrim(coalesce(p_code, '')), '-', '')) as v) s
$$;
alter function app_private.normalize_client_code(text) owner to postgres;
revoke all on function app_private.normalize_client_code(text) from public, anon, authenticated, service_role;

create function app_private.format_client_code(p_code text) returns text
language sql immutable security definer set search_path = '' as $$
  select case when app_private.normalize_client_code(p_code) is null then null
    else substr(app_private.normalize_client_code(p_code), 1, 4) || '-' || substr(app_private.normalize_client_code(p_code), 5, 4) end
$$;
alter function app_private.format_client_code(text) owner to postgres;
revoke all on function app_private.format_client_code(text) from public, anon, authenticated, service_role;

-- p_candidates exists so the collision-retry path is deterministically testable;
-- production callers pass NULL and get 8 CSPRNG-derived candidates.
create function app_private.allocate_client_code(p_workspace_id uuid, p_candidates text[] default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate text; raw bytea; i int; j int;
begin
  if p_workspace_id is null then raise exception 'client_code_workspace_required' using errcode = '23514'; end if;
  if p_candidates is null then
    p_candidates := array[]::text[];
    for i in 1..8 loop
      raw := extensions.gen_random_bytes(8);
      candidate := '';
      for j in 0..7 loop
        candidate := candidate || substr(alphabet, (get_byte(raw, j) & 31) + 1, 1);
      end loop;
      p_candidates := p_candidates || candidate;
    end loop;
  end if;
  foreach candidate in array p_candidates loop
    if candidate is not null and app_private.normalize_client_code(candidate) = candidate
      and not exists (select 1 from public.clients c where c.workspace_id = p_workspace_id and c.client_code = candidate) then
      return candidate;
    end if;
  end loop;
  raise exception 'client_code_allocation_exhausted' using errcode = '55000';
end $$;
alter function app_private.allocate_client_code(uuid, text[]) owner to postgres;
revoke all on function app_private.allocate_client_code(uuid, text[]) from public, anon, authenticated, service_role;

create function app_private.assign_client_code() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.client_code := app_private.allocate_client_code(new.workspace_id);
  return new;
end $$;
alter function app_private.assign_client_code() owner to postgres;
revoke all on function app_private.assign_client_code() from public, anon, authenticated, service_role;

create function app_private.guard_client_code_immutable() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.client_code is distinct from old.client_code then
    raise exception 'client_code_immutable' using errcode = '23514';
  end if;
  return new;
end $$;
alter function app_private.guard_client_code_immutable() owner to postgres;
revoke all on function app_private.guard_client_code_immutable() from public, anon, authenticated, service_role;

-- Backfill existing clients (oldest first). User triggers are disabled only for this
-- statement block so the F12 transition guard and audit emitters do not see a bulk
-- non-lifecycle update; they are re-enabled before the migration ends.
alter table public.clients disable trigger user;
do $$
declare r record;
begin
  for r in select id, workspace_id from public.clients where client_code is null order by created_at, id loop
    update public.clients set client_code = app_private.allocate_client_code(r.workspace_id) where id = r.id;
  end loop;
end $$;
alter table public.clients enable trigger user;

alter table public.clients alter column client_code set not null;
alter table public.clients add constraint clients_client_code_format check (client_code ~ '^[2-9A-HJ-NP-Z]{8}$');
create unique index clients_workspace_id_client_code_key on public.clients(workspace_id, client_code);

create trigger f11_client_code_assign before insert on public.clients
  for each row execute function app_private.assign_client_code();
create trigger f11_client_code_immutable before update on public.clients
  for each row execute function app_private.guard_client_code_immutable();

-- Staff exact-match lookup. Authorization is exactly the existing F11 reader predicate
-- (Platform Owner or own-workspace Workspace Owner); no permission is added. A wrong,
-- malformed or foreign-workspace code returns the same shape as no match.
create function public.find_client_by_code(p_workspace_id uuid, p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); normalized text; found_id uuid; found_code text;
begin
  if actor is null or not (app_private.is_platform_owner() or exists (
    select 1 from public.workspace_memberships m join public.staff_profiles p on p.user_id = m.user_id
    where m.workspace_id = p_workspace_id and m.user_id = actor and m.revoked_at is null and p.role = 'workspace_owner'
  )) then return jsonb_build_object('status', 'not_permitted'); end if;
  if p_workspace_id is null then return jsonb_build_object('status', 'invalid_input'); end if;
  normalized := app_private.normalize_client_code(p_code);
  if normalized is not null then
    select c.id, c.client_code into found_id, found_code
      from public.clients c where c.workspace_id = p_workspace_id and c.client_code = normalized;
  end if;
  return jsonb_build_object('status', 'ok', 'client_id', found_id,
    'client_code', app_private.format_client_code(found_code));
end $$;
alter function public.find_client_by_code(uuid, text) owner to postgres;
revoke all on function public.find_client_by_code(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.find_client_by_code(uuid, text) to authenticated;

comment on column public.clients.client_code is 'F11 S66-PO-1: immutable random per-workspace code (8 chars, alphabet 2-9 A-Z minus I,O), staff-visible only; display as XXXX-XXXX via app_private.format_client_code.';
