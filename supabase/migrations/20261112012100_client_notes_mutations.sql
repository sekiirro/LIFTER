begin;

create function public.update_client_note(
  p_note_id uuid,
  p_body text
)
returns table (
  id uuid,
  workspace_id uuid,
  client_id uuid,
  author_user_id uuid,
  body text,
  created_at timestamptz,
  edited_at timestamptz,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note public.client_notes%rowtype;
  v_body text;
begin
  if auth.uid() is null then
    raise exception 'client note update denied' using errcode = '42501';
  end if;

  select n.* into v_note
  from public.client_notes n
  where n.id = p_note_id
  for update;
  if not found then
    raise exception 'client note not found' using errcode = 'P0002';
  end if;
  if not app_private.has_workspace_access(v_note.workspace_id, 'coaching_work')
     or (not app_private.is_platform_owner()
         and v_note.author_user_id is distinct from auth.uid()) then
    raise exception 'client note update denied' using errcode = '42501';
  end if;
  if p_body is null then
    raise exception 'client note update refused' using errcode = '22023';
  end if;
  v_body := app_private.client_note_trim_whitespace(p_body);
  if v_body is null or char_length(v_body) not between 1 and 5000 then
    raise exception 'client note update refused' using errcode = '22023';
  end if;

  update public.client_notes n
  set body = v_body, edited_at = pg_catalog.clock_timestamp()
  where n.id = v_note.id
  returning n.* into v_note;

  insert into public.audit_events (
    actor_user_id, action, target_table, target_id, workspace_id, details
  ) values (
    auth.uid(), 'client_note.updated', 'client_notes', v_note.id,
    v_note.workspace_id, pg_catalog.jsonb_build_object('client_id', v_note.client_id)
  );

  return query select v_note.id, v_note.workspace_id, v_note.client_id,
    v_note.author_user_id, v_note.body, v_note.created_at, v_note.edited_at,
    'updated'::text;
end;
$$;
alter function public.update_client_note(uuid, text) owner to postgres;
revoke all on function public.update_client_note(uuid, text)
  from public, anon, service_role;
grant execute on function public.update_client_note(uuid, text) to authenticated;

create function public.delete_client_note(p_note_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note public.client_notes%rowtype;
  v_key_rows integer;
  v_note_rows integer;
begin
  if auth.uid() is null then
    raise exception 'client note delete denied' using errcode = '42501';
  end if;

  select n.* into v_note
  from public.client_notes n
  where n.id = p_note_id
  for update;
  if not found then
    raise exception 'client note not found' using errcode = 'P0002';
  end if;
  if not app_private.is_platform_owner()
     or not app_private.has_workspace_access(v_note.workspace_id, null) then
    raise exception 'client note delete denied' using errcode = '42501';
  end if;

  update app_private.client_note_create_keys k
  set outcome = 'deleted'
  where k.workspace_id = v_note.workspace_id
    and k.client_id = v_note.client_id
    and k.idempotency_key = v_note.idempotency_key
    and k.outcome = 'created';
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
