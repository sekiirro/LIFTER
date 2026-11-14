-- F21 final slice: scoped historical Client Notes author labels and auth-first write validation.

create or replace function public.set_staff_display_name(
  p_target_user_id uuid,
  p_display_name text,
  p_expected_version integer,
  p_request_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.staff_role;
  normalized_name text;
  current_version integer;
  result_status jsonb;
  request_fingerprint text;
  audit_workspace_id uuid;
  inserted_key integer;
begin
  if actor_id is null or not app_private.can_write_staff_display_name(p_target_user_id) then
    raise exception 'staff_display_name_denied' using errcode = '42501';
  end if;
  if p_target_user_id is null
    or p_expected_version is null or p_expected_version < 0
    or p_request_key is null
    or substring(p_request_key::text from 15 for 1) <> '4'
    or substring(p_request_key::text from 20 for 1) not in ('8', '9', 'a', 'b') then
    raise exception 'staff_display_name_request_invalid' using errcode = '22023';
  end if;
  normalized_name := app_private.normalize_staff_display_name(p_display_name);
  if normalized_name is null
    or not app_private.staff_display_name_is_valid(normalized_name) then
    raise exception 'staff_display_name_invalid' using errcode = '22023';
  end if;
  select role into actor_role from public.staff_profiles where user_id = actor_id;
  request_fingerprint := 'sha256:' || encode(extensions.digest(
    convert_to(jsonb_build_array(p_target_user_id, normalized_name, p_expected_version)::text, 'UTF8'),
    'sha256'
  ), 'hex');

  result_status := app_private.operation_key_result(
    actor_id, 'staff_display_names.set', p_request_key, request_fingerprint
  );
  if result_status is not null then return result_status; end if;

  insert into app_private.operation_keys(actor_user_id, action, operation_key, request_hash)
  values (actor_id, 'staff_display_names.set', p_request_key, request_fingerprint)
  on conflict (actor_user_id, operation_key) do nothing;
  get diagnostics inserted_key = row_count;
  if inserted_key = 0 then
    return app_private.operation_key_result(
      actor_id, 'staff_display_names.set', p_request_key, request_fingerprint
    );
  end if;

  select display_name_version into current_version
  from public.staff_profiles where user_id = p_target_user_id for update;
  if not found then
    raise exception 'staff_display_name_denied' using errcode = '42501';
  end if;
  if current_version is distinct from p_expected_version then
    result_status := jsonb_build_object('status', 'conflict');
  else
    update public.staff_profiles set display_name = normalized_name
    where user_id = p_target_user_id;
    if actor_role = 'workspace_owner'::public.staff_role then
      select target_membership.workspace_id into audit_workspace_id
      from public.workspace_memberships target_membership
      join public.workspace_memberships actor_membership
        on actor_membership.workspace_id = target_membership.workspace_id
        and actor_membership.user_id = actor_id
        and actor_membership.revoked_at is null
      where target_membership.user_id = p_target_user_id
        and target_membership.revoked_at is null
      order by target_membership.workspace_id
      limit 1;
    else
      select workspace_id into audit_workspace_id
      from public.workspace_memberships
      where user_id = p_target_user_id and revoked_at is null
      order by workspace_id
      limit 1;
    end if;
    insert into public.audit_events(
      actor_user_id, action, target_table, target_id, workspace_id, details
    ) values (
      actor_id, 'staff.display_name_changed', 'staff_profiles',
      p_target_user_id, audit_workspace_id, '{}'::jsonb
    );
    result_status := jsonb_build_object('status', 'ok');
  end if;
  update app_private.operation_keys set result = result_status
  where actor_user_id = actor_id and operation_key = p_request_key;
  return result_status;
end;
$$;
alter function public.set_staff_display_name(uuid, text, integer, uuid) owner to postgres;
revoke all on function public.set_staff_display_name(uuid, text, integer, uuid)
  from public, anon, service_role;
grant execute on function public.set_staff_display_name(uuid, text, integer, uuid)
  to authenticated;

create function public.get_client_note_author_names(
  p_workspace_id uuid,
  p_author_user_ids uuid[]
) returns table(author_user_id uuid, display_name text, deactivated boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_workspace_id is null
    or not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception 'client_note_author_names_denied' using errcode = '42501';
  end if;
  if p_author_user_ids is null then
    raise exception 'client_note_author_names_invalid' using errcode = '22023';
  end if;
  return query
    select sp.user_id, sp.display_name,
      (sp.role <> 'platform_owner'::public.staff_role and not exists (
        select 1 from public.workspace_memberships active_membership
        where active_membership.workspace_id = p_workspace_id
          and active_membership.user_id = sp.user_id
          and active_membership.revoked_at is null
      )) as deactivated
    from public.staff_profiles sp
    where sp.user_id = any(p_author_user_ids)
      and exists (
        select 1 from public.client_notes n
        where n.workspace_id = p_workspace_id
          and n.author_user_id = sp.user_id
      );
end;
$$;
alter function public.get_client_note_author_names(uuid, uuid[]) owner to postgres;
revoke all on function public.get_client_note_author_names(uuid, uuid[])
  from public, anon, service_role;
grant execute on function public.get_client_note_author_names(uuid, uuid[])
  to authenticated;
