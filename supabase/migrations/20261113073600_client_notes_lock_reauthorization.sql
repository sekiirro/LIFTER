begin;

create or replace function public.create_client_note(
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
  if p_body is null or p_idempotency_key is null
     or char_length(p_idempotency_key) > 36
     or p_idempotency_key !~ '^(?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|cn-[0-9]+-[a-z0-9]*)$' then
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
  if auth.uid() is null
     or not app_private.has_workspace_access(p_workspace_id, 'coaching_work')
     or p_client_id is null or not exists (
       select 1 from public.clients c
       where c.workspace_id = p_workspace_id and c.id = p_client_id
     ) then
    raise exception 'client note create denied' using errcode = '42501';
  end if;

  if v_key_id is null then
    select k.* into v_key
    from app_private.client_note_create_keys k
    where k.workspace_id = p_workspace_id
      and k.client_id = p_client_id
      and k.idempotency_key = p_idempotency_key
    for update;
    if auth.uid() is null
       or not app_private.has_workspace_access(p_workspace_id, 'coaching_work')
       or p_client_id is null or not exists (
         select 1 from public.clients c
         where c.workspace_id = p_workspace_id and c.id = p_client_id
       ) then
      raise exception 'client note create denied' using errcode = '42501';
    end if;
    if v_key.id is null or v_key.outcome = 'deleted' then
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

create or replace function public.delete_client_note(p_note_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note public.client_notes%rowtype;
  v_key app_private.client_note_create_keys%rowtype;
  v_key_rows integer;
  v_note_rows integer;
begin
  if auth.uid() is null then
    raise exception 'client note delete denied' using errcode = '42501';
  end if;
  if not app_private.is_platform_owner() then
    raise exception 'client note delete denied' using errcode = '42501';
  end if;

  select n.* into v_note
  from public.client_notes n
  where n.id = p_note_id
    and app_private.is_platform_owner()
    and app_private.has_workspace_access(n.workspace_id, null)
  for update;
  if not found then
    raise exception 'client note delete denied' using errcode = '42501';
  end if;
  if not app_private.is_platform_owner()
     or not app_private.has_workspace_access(v_note.workspace_id, null) then
    raise exception 'client note delete denied' using errcode = '42501';
  end if;

  select k.* into v_key
  from app_private.client_note_create_keys k
  where k.workspace_id = v_note.workspace_id
    and k.client_id = v_note.client_id
    and k.idempotency_key = v_note.idempotency_key
  for update;

  if auth.uid() is null
     or not app_private.is_platform_owner()
     or not app_private.has_workspace_access(v_note.workspace_id, null)
     or not exists (
       select 1 from public.clients c
       where c.workspace_id = v_note.workspace_id and c.id = v_note.client_id
     ) then
    raise exception 'client note delete denied' using errcode = '42501';
  end if;
  if v_key.id is null or v_key.outcome <> 'created' then
    raise exception 'client note delete refused' using errcode = '23514';
  end if;

  update app_private.client_note_create_keys k
  set outcome = 'deleted'
  where k.id = v_key.id and k.outcome = 'created';
  get diagnostics v_key_rows = row_count;
  if v_key_rows <> 1 then
    raise exception 'client note delete refused' using errcode = '23514';
  end if;

  delete from public.client_notes n where n.id = v_note.id;
  get diagnostics v_note_rows = row_count;
  if v_note_rows <> 1 then
    raise exception 'client note not found' using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    actor_user_id, action, target_table, target_id, workspace_id, details
  ) values (
    auth.uid(), 'client_note.deleted', 'client_notes', v_note.id,
    v_note.workspace_id, pg_catalog.jsonb_build_object('client_id', v_note.client_id)
  );

  return v_note.id;
end;
$$;
alter function public.delete_client_note(uuid) owner to postgres;
revoke all on function public.delete_client_note(uuid)
  from public, anon, service_role;
grant execute on function public.delete_client_note(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
