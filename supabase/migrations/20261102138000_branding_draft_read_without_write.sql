-- F14 R9: draft reads must not create a row as a side effect.
grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;

create or replace function app_private.branding_draft_read(workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  draft_row app_private.branding_drafts%rowtype;
  has_draft boolean;
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

  select * into draft_row
  from app_private.branding_drafts d
  where d.workspace_id = branding_draft_read.workspace_id;
  has_draft := found;

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
    'revision', case when has_draft then draft_row.revision else 0 end,
    'fields', case when has_draft then jsonb_build_object(
      'name', draft_row.fields->'name',
      'bannerAlt', draft_row.fields->'bannerAlt',
      'color', draft_row.fields->'color'
    ) else jsonb_build_object('name', null, 'bannerAlt', null, 'color', null) end,
    'current_publication', published
  );
end;
$$;

reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;
