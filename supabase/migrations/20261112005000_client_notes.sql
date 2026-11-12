begin;

create function app_private.client_note_trim_whitespace(value text)
returns text
language sql immutable strict parallel safe
set search_path = ''
as $$
  select pg_catalog.btrim(
    value,
    U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000'
  );
$$;
alter function app_private.client_note_trim_whitespace(text) owner to postgres;
revoke all on function app_private.client_note_trim_whitespace(text)
  from public, anon, authenticated, service_role;

create table public.client_notes (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  author_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  idempotency_key text not null,
  constraint client_notes_workspace_id_id_unique unique (workspace_id, id),
  constraint client_notes_client_same_workspace_fk
    foreign key (workspace_id, client_id)
    references public.clients(workspace_id, id) on delete restrict,
  constraint client_notes_key_scope_unique
    unique (workspace_id, client_id, idempotency_key),
  constraint client_notes_body_is_trimmed_and_bounded check (
    body = app_private.client_note_trim_whitespace(body)
    and char_length(body) between 1 and 5000
  )
);
alter table public.client_notes owner to postgres;

create table app_private.client_note_create_keys (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  idempotency_key text not null,
  body_fingerprint bytea not null,
  outcome text not null default 'created'
    check (outcome in ('created', 'deleted')),
  created_at timestamptz not null default now(),
  constraint client_note_create_keys_workspace_id_id_unique unique (workspace_id, id),
  constraint client_note_create_keys_client_same_workspace_fk
    foreign key (workspace_id, client_id)
    references public.clients(workspace_id, id) on delete restrict,
  constraint client_note_create_keys_scope_unique
    unique (workspace_id, client_id, idempotency_key),
  constraint client_note_create_keys_fingerprint_length
    check (octet_length(body_fingerprint) = 32)
);
alter table app_private.client_note_create_keys owner to postgres;

create function app_private.require_client_note_create_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from app_private.client_note_create_keys k
    where k.workspace_id = new.workspace_id
      and k.client_id = new.client_id
      and k.idempotency_key = new.idempotency_key
      and k.outcome = 'created'
      and k.body_fingerprint = extensions.digest(
        convert_to(new.body, 'UTF8'), 'sha256'
      )
  ) then
    raise exception 'client note create key mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;
alter function app_private.require_client_note_create_key() owner to postgres;
revoke all on function app_private.require_client_note_create_key()
  from public, anon, authenticated, service_role;
create trigger client_notes_require_create_key
  before insert on public.client_notes
  for each row execute function app_private.require_client_note_create_key();

create function app_private.guard_client_note_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.id, new.workspace_id, new.client_id, new.author_user_id,
      new.created_at, new.idempotency_key)
     is distinct from
     (old.id, old.workspace_id, old.client_id, old.author_user_id,
      old.created_at, old.idempotency_key) then
    raise exception 'immutable client note columns' using errcode = '23514';
  end if;
  if new.body is distinct from app_private.client_note_trim_whitespace(new.body)
     or char_length(new.body) not between 1 and 5000 then
    raise exception 'invalid client note body' using errcode = '23514';
  end if;
  return new;
end;
$$;
alter function app_private.guard_client_note_update() owner to postgres;
revoke all on function app_private.guard_client_note_update()
  from public, anon, authenticated, service_role;
create trigger client_notes_guard_update
  before update on public.client_notes
  for each row execute function app_private.guard_client_note_update();

alter table public.client_notes enable row level security;
alter table public.client_notes force row level security;
alter table app_private.client_note_create_keys enable row level security;
alter table app_private.client_note_create_keys force row level security;

revoke all on public.client_notes from public, anon, authenticated, service_role;
revoke all on app_private.client_note_create_keys from public, anon, authenticated, service_role;
grant select on public.client_notes to authenticated;

create policy client_notes_read_workspace on public.client_notes
  for select to authenticated
  using (app_private.has_workspace_access(workspace_id, 'coaching_work'));

create function public.create_client_note(
  p_workspace_id uuid,
  p_client_id uuid,
  p_body text,
  p_idempotency_key text
)
returns table (
  id uuid,
  workspace_id uuid,
  client_id uuid,
  author_user_id uuid,
  body text,
  created_at timestamptz,
  edited_at timestamptz,
  idempotency_key text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text;
  v_fingerprint bytea;
  v_key_id uuid;
  v_key app_private.client_note_create_keys%rowtype;
begin
  if auth.uid() is null
     or not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception 'client note create denied' using errcode = '42501';
  end if;

  if p_client_id is null or not exists (
    select 1 from public.clients c
    where c.workspace_id = p_workspace_id and c.id = p_client_id
  ) then
    raise exception 'client note create denied' using errcode = '42501';
  end if;
  if p_body is null or p_idempotency_key is null or p_idempotency_key = '' then
    raise exception 'client note create refused' using errcode = '22023';
  end if;

  v_body := app_private.client_note_trim_whitespace(p_body);
  if v_body is null or char_length(v_body) not between 1 and 5000 then
    raise exception 'client note create refused' using errcode = '22023';
  end if;
  v_fingerprint := extensions.digest(convert_to(v_body, 'UTF8'), 'sha256');

  insert into app_private.client_note_create_keys (
    workspace_id, client_id, idempotency_key, body_fingerprint
  ) values (
    p_workspace_id, p_client_id, p_idempotency_key, v_fingerprint
  )
  on conflict on constraint client_note_create_keys_scope_unique do nothing
  returning app_private.client_note_create_keys.id into v_key_id;

  if v_key_id is null then
    select k.* into v_key
    from app_private.client_note_create_keys k
    where k.workspace_id = p_workspace_id
      and k.client_id = p_client_id
      and k.idempotency_key = p_idempotency_key
    for update;
    if not found or v_key.outcome = 'deleted' then
      raise exception 'client note not found' using errcode = 'P0002';
    end if;
    if v_key.body_fingerprint is distinct from v_fingerprint then
      raise exception 'client note create refused' using errcode = '22023';
    end if;
    return query
      select n.id, n.workspace_id, n.client_id, n.author_user_id, n.body,
             n.created_at, n.edited_at, n.idempotency_key, 'existing'::text
      from public.client_notes n
      where n.workspace_id = p_workspace_id
        and n.client_id = p_client_id
        and n.idempotency_key = p_idempotency_key;
    if not found then
      raise exception 'client note not found' using errcode = 'P0002';
    end if;
    return;
  end if;

  return query
    with inserted as (
      insert into public.client_notes (
        workspace_id, client_id, author_user_id, body, idempotency_key
      ) values (
        p_workspace_id, p_client_id, auth.uid(), v_body, p_idempotency_key
      ) returning *
    ), audited as (
      insert into public.audit_events (
        actor_user_id, action, target_table, target_id, workspace_id, details
      )
      select auth.uid(), 'client_note.created', 'client_notes', i.id,
             i.workspace_id, jsonb_build_object('client_id', i.client_id)
      from inserted i
      returning target_id
    )
    select i.id, i.workspace_id, i.client_id, i.author_user_id, i.body,
           i.created_at, i.edited_at, i.idempotency_key, 'created'::text
    from inserted i
    join audited a on a.target_id = i.id;
end;
$$;
alter function public.create_client_note(uuid, uuid, text, text) owner to postgres;
revoke all on function public.create_client_note(uuid, uuid, text, text)
  from public, anon, service_role;
grant execute on function public.create_client_note(uuid, uuid, text, text)
  to authenticated;

commit;
