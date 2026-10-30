-- F14 R1: expose only the caller's current draft/publication projection.
grant select on public.workspace_memberships to branding_definer;
grant execute on function app_private.current_staff_role() to branding_definer;
grant execute on function app_private.role_has_capability(public.staff_role, text) to branding_definer;
create policy branding_definer_active_membership_read on public.workspace_memberships
  for select to branding_definer
  using (user_id=app_private.branding_actor_id() and revoked_at is null);
grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;

create function app_private.branding_draft_read(workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  draft_row app_private.branding_drafts%rowtype;
  published jsonb;
begin
  if current_setting('role', true) is distinct from 'authenticated' then
    raise exception using errcode='42501', message='not_permitted';
  end if;
  actor_id := app_private.branding_actor_id();
  if actor_id is null then
    raise exception using errcode='42501', message='not_permitted';
  end if;

  if not app_private.role_has_capability(app_private.current_staff_role(), 'manage_branding') then
    raise exception using errcode='42501', message='not_permitted';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = branding_draft_read.workspace_id
      and m.user_id = actor_id and m.revoked_at is null
  ) then
    raise exception using errcode='42501', message='not_permitted';
  end if;

  insert into app_private.branding_drafts(workspace_id)
  values (branding_draft_read.workspace_id) on conflict do nothing;
  select * into draft_row
  from app_private.branding_drafts d
  where d.workspace_id = branding_draft_read.workspace_id;

  select jsonb_build_object(
    'sequence', v.sequence,
    'fields', jsonb_build_object(
      'name', v.fields->'name',
      'bannerAlt', v.fields->'bannerAlt',
      'color', v.fields->'color'
    )
  ) into published
  from app_private.branding_current_publications c
  join app_private.branding_published_versions v
    on v.workspace_id = c.workspace_id and v.id = c.version_id
  where c.workspace_id = branding_draft_read.workspace_id;

  return jsonb_build_object(
    'workspace_id', branding_draft_read.workspace_id,
    'revision', draft_row.revision,
    'fields', jsonb_build_object(
      'name', draft_row.fields->'name',
      'bannerAlt', draft_row.fields->'bannerAlt',
      'color', draft_row.fields->'color'
    ),
    'current_publication', published
  );
end;
$$;

revoke all on function app_private.branding_draft_read(uuid)
  from public, anon, service_role, branding_proxy, branding_validator;
grant execute on function app_private.branding_draft_read(uuid) to authenticated;

-- The staff shell receives only current published identity fields for an active member.
create function app_private.branding_current_read(workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid;
begin
  if current_setting('role', true) is distinct from 'authenticated' then
    raise exception using errcode='42501', message='not_permitted';
  end if;
  actor_id := app_private.branding_actor_id();
  if actor_id is null or not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = branding_current_read.workspace_id
      and m.user_id = actor_id and m.revoked_at is null
  ) then
    raise exception using errcode='42501', message='not_permitted';
  end if;
  return (
    select jsonb_build_object('name', v.fields->'name', 'color', v.fields->'color')
    from app_private.branding_current_publications c
    join app_private.branding_published_versions v
      on v.workspace_id=c.workspace_id and v.id=c.version_id
    where c.workspace_id=branding_current_read.workspace_id
  );
end;
$$;
revoke all on function app_private.branding_current_read(uuid)
  from public, anon, service_role, branding_proxy, branding_validator;
grant execute on function app_private.branding_current_read(uuid) to authenticated;

reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;

create function public.branding_draft_read(workspace_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.branding_draft_read(workspace_id)
$$;
revoke all on function public.branding_draft_read(uuid) from public, anon, service_role;
grant execute on function public.branding_draft_read(uuid) to authenticated;

create function public.branding_current_read(workspace_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.branding_current_read(workspace_id)
$$;
revoke all on function public.branding_current_read(uuid) from public, anon, service_role;
grant execute on function public.branding_current_read(uuid) to authenticated;
