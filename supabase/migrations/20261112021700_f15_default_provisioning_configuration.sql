-- F15 S19 G1-G3: persist first provisioning and surface recoverable default configuration errors.
create table app_private.workspace_onboarding_provisioning (
  workspace_id uuid primary key references public.workspaces(id) on delete restrict,
  first_form_id uuid not null,
  first_provisioned_at timestamptz not null default clock_timestamp()
);
alter table app_private.workspace_onboarding_provisioning enable row level security;
alter table app_private.workspace_onboarding_provisioning force row level security;
revoke all on app_private.workspace_onboarding_provisioning from public,anon,authenticated,service_role;

insert into app_private.workspace_onboarding_provisioning(workspace_id,first_form_id,first_provisioned_at)
select workspace_id,form_id,updated_at from public.workspace_default_onboarding_forms
on conflict (workspace_id) do nothing;

create function app_private.f15_onboarding_provisioning_marker_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'onboarding provisioning marker is immutable' using errcode='23514';
end
$$;
alter function app_private.f15_onboarding_provisioning_marker_immutable() owner to postgres;
revoke all on function app_private.f15_onboarding_provisioning_marker_immutable() from public,anon,authenticated,service_role;
create trigger f15_onboarding_provisioning_marker_immutable
  before update or delete on app_private.workspace_onboarding_provisioning
  for each row execute function app_private.f15_onboarding_provisioning_marker_immutable();

create or replace function app_private.ensure_default_onboarding_form(
  p_workspace_id uuid, p_actor_user_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  selected_form uuid;
  new_form uuid;
  marker_exists boolean;
  designation_exists boolean;
  starter_definition jsonb := pg_catalog.convert_from(
    pg_catalog.decode('eyJ0aXRsZSI6eyJlbiI6IllvdXIgRmlyc3QgU3RlcCIsImFyIjoi2K7Yt9mI2KrZgyDYp9mE2KPZiNmE2YkifSwic2VjdGlvbnMiOlt7ImlkIjoiYmFzaWMiLCJ0aXRsZSI6eyJlbiI6IkJhc2ljIEluZm9ybWF0aW9uIiwiYXIiOiLYp9mE2KjZitin2YbYp9iqINin2YTYo9iz2KfYs9mK2KkifX0seyJpZCI6InRyYWluaW5nIiwidGl0bGUiOnsiZW4iOiJUcmFpbmluZyIsImFyIjoi2KfZhNiq2YXYsdmK2YYifX0seyJpZCI6Im51dHJpdGlvbiIsInRpdGxlIjp7ImVuIjoiTnV0cml0aW9uIiwiYXIiOiLYp9mE2KrYutiw2YrYqSJ9fV0sInF1ZXN0aW9ucyI6W3siaWQiOiJCMDEiLCJzZWN0aW9uSWQiOiJiYXNpYyIsInR5cGUiOiJwcm9maWxlVGV4dCIsInJlcXVpcmVkIjpmYWxzZSwibGFiZWwiOnsiZW4iOiJGdWxsIG5hbWUiLCJhciI6Itin2YTYp9iz2YUg2KfZhNir2YTYp9ir2YoifSwicHJvZmlsZUZpZWxkIjoiZnVsbE5hbWUifSx7ImlkIjoiQjAyIiwic2VjdGlvbklkIjoiYmFzaWMiLCJ0eXBlIjoiY29tcHV0ZWRBZ2UiLCJyZXF1aXJlZCI6ZmFsc2UsImxhYmVsIjp7ImVuIjoiQWdlIiwiYXIiOiLYp9mE2LnZhdixIn0sImRhdGVPZkJpcnRoRmllbGQiOiJkYXRlT2ZCaXJ0aCJ9LHsiaWQiOiJCMDMiLCJzZWN0aW9uSWQiOiJiYXNpYyIsInR5cGUiOiJib29sZWFuIiwicmVxdWlyZWQiOmZhbHNlLCJsYWJlbCI6eyJlbiI6IkRvIHlvdSBoYXZlIGFueSBjaHJvbmljIGNvbmRpdGlvbnM/IiwiYXIiOiLYudmG2K/ZgyDYo9mKINij2YXYsdin2LYg2YXYstmF2YbYqdifIn19LHsiaWQiOiJCMDQiLCJzZWN0aW9uSWQiOiJiYXNpYyIsInR5cGUiOiJudW1iZXIiLCJyZXF1aXJlZCI6ZmFsc2UsImxhYmVsIjp7ImVuIjoiV2hhdCBpcyB5b3VyIGN1cnJlbnQgd2VpZ2h0PyIsImFyIjoi2YjYstmG2YMg2KfZhNit2KfZhNmKINmD2KfZhdifIn0sInVuaXQiOnsiZW4iOiJrZyIsImFyIjoia2cifSwidmFsaWRhdGlvbiI6eyJtaW4iOjEsIm1heCI6MzAwLCJzdGVwIjowLjF9fSx7ImlkIjoiQjA1Iiwic2VjdGlvbklkIjoiYmFzaWMiLCJ0eXBlIjoic2hvcnRUZXh0IiwicmVxdWlyZWQiOmZhbHNlLCJjaGFyTGltaXQiOjE1MCwibGFiZWwiOnsiZW4iOiJXaGF0IGlzIHlvdXIgb2NjdXBhdGlvbj8iLCJhciI6Itil2YrZhyDZiNi42YrZgdiq2YPYnyJ9fSx7ImlkIjoiQjA2Iiwic2VjdGlvbklkIjoiYmFzaWMiLCJ0eXBlIjoic2hvcnRUZXh0IiwicmVxdWlyZWQiOmZhbHNlLCJjaGFyTGltaXQiOjE1MCwibGFiZWwiOnsiZW4iOiJTZXgiLCJhciI6Itin2YTZhtmI2LkifSwicHJpdmFjeSI6InBlcnNvbmFsIn0seyJpZCI6IlQwMSIsInNlY3Rpb25JZCI6InRyYWluaW5nIiwidHlwZSI6InNob3J0VGV4dCIsInJlcXVpcmVkIjpmYWxzZSwiY2hhckxpbWl0IjoxNTAsImxhYmVsIjp7ImVuIjoiV2hhdCBpcyB5b3VyIG5lYXItdGVybSBnb2FsPyIsImFyIjoi2KXZitmHINmH2K/ZgdmDINi52YTZiSDYp9mE2YXYs9iq2YjZiSDYp9mE2YLYsdmK2KjYnyJ9fSx7ImlkIjoiVDAyIiwic2VjdGlvbklkIjoidHJhaW5pbmciLCJ0eXBlIjoiYm9vbGVhbiIsInJlcXVpcmVkIjpmYWxzZSwibGFiZWwiOnsiZW4iOiJEbyB5b3UgaGF2ZSBhbnkgaW5qdXJpZXM/IiwiYXIiOiLYudmG2K/ZgyDYo9mKINil2LXYp9io2KnYnyJ9fSx7ImlkIjoiVDAzIiwic2VjdGlvbklkIjoidHJhaW5pbmciLCJ0eXBlIjoic2hvcnRUZXh0IiwicmVxdWlyZWQiOmZhbHNlLCJjaGFyTGltaXQiOjE1MCwibGFiZWwiOnsiZW4iOiJIb3cgbWFueSBkYXlzIGEgd2VlayB3b3VsZCB5b3UgbGlrZSB0byB0cmFpbj8iLCJhciI6Itit2KfYqNioINiq2KrZhdix2YYg2YPYp9mFINmK2YjZhSDZgdmKINin2YTYo9iz2KjZiNi52J8ifX0seyJpZCI6IlQwNCIsInNlY3Rpb25JZCI6InRyYWluaW5nIiwidHlwZSI6InNob3J0VGV4dCIsInJlcXVpcmVkIjpmYWxzZSwiY2hhckxpbWl0IjoxNTAsImxhYmVsIjp7ImVuIjoiSG93IG11Y2ggdGltZSBjYW4geW91IHNldCBhc2lkZSBmb3IgYSB3b3Jrb3V0PyIsImFyIjoi2KrZgtiv2LEg2KrYrti12LUg2YjZgtiqINmC2K8g2KXZitmHINmE2YTYqtmF2LHZitmG2KnYnyJ9fSx7ImlkIjoiVDA1Iiwic2VjdGlvbklkIjoidHJhaW5pbmciLCJ0eXBlIjoiYm9vbGVhbiIsInJlcXVpcmVkIjpmYWxzZSwibGFiZWwiOnsiZW4iOiJEbyB5b3UgcGxheSBhIHNwb3J0IGluIGFkZGl0aW9uIHRvIGdvaW5nIHRvIHRoZSBneW0/IiwiYXIiOiLYqNiq2YTYudioINij2Yog2LHZitin2LbYqSDYqNis2KfZhtioINin2YTYrNmK2YXYnyJ9fSx7ImlkIjoiVDA2Iiwic2VjdGlvbklkIjoidHJhaW5pbmciLCJ0eXBlIjoibG9uZ1RleHQiLCJyZXF1aXJlZCI6ZmFsc2UsImxhYmVsIjp7ImVuIjoiV2hhdCBkbyB5b3UgY29uc2lkZXIgeW91ciB3ZWFrIHBvaW50cz8iLCJhciI6Iti02KfZitmBINil2YrZhyDZhtmC2KfYtyDYtti52YHZg9ifIn19LHsiaWQiOiJUMDciLCJzZWN0aW9uSWQiOiJ0cmFpbmluZyIsInR5cGUiOiJzaG9ydFRleHQiLCJyZXF1aXJlZCI6ZmFsc2UsImNoYXJMaW1pdCI6MTUwLCJsYWJlbCI6eyJlbiI6IldoaWNoIGV4ZXJjaXNlcyBkbyB5b3UgbGlrZSBtb3N0IGFuZCBkaXNsaWtlIG1vc3Q/IiwiYXIiOiLYpdmK2Ycg2KPZg9iq2LEg2KrZhdin2LHZitmGINio2KrYrdio2YfYpyDZiNil2YrZhyDYo9mD2KrYsSDYqtmF2KfYsdmK2YYg2KjYqtmD2LHZh9mH2KfYnyJ9fSx7ImlkIjoiVDA4Iiwic2VjdGlvbklkIjoidHJhaW5pbmciLCJ0eXBlIjoiYm9vbGVhbiIsInJlcXVpcmVkIjpmYWxzZSwibGFiZWwiOnsiZW4iOiJXb3VsZCB5b3UgbGlrZSB0byBmb2xsb3cgYSBwYXJ0aWN1bGFyIHRyYWluaW5nIHNwbGl0PyIsImFyIjoi2LnYp9mK2LIg2YbYuNin2YUg2KrZhdix2YrZhiDZhdi52YrZhtifIn19LHsiaWQiOiJOMDEiLCJzZWN0aW9uSWQiOiJudXRyaXRpb24iLCJ0eXBlIjoic2hvcnRUZXh0IiwicmVxdWlyZWQiOmZhbHNlLCJjaGFyTGltaXQiOjE1MCwibGFiZWwiOnsiZW4iOiJXaGF0IGlzIHlvdXIgZ29hbCBmb3IgeW91ciBudXRyaXRpb24gcGxhbj8iLCJhciI6Itil2YrZhyDZh9iv2YHZgyDZhdmGINin2YTZhti42KfZhSDYp9mE2LrYsNin2KbZitifIn19LHsiaWQiOiJOMDIiLCJzZWN0aW9uSWQiOiJudXRyaXRpb24iLCJ0eXBlIjoibnVtYmVyIiwicmVxdWlyZWQiOmZhbHNlLCJsYWJlbCI6eyJlbiI6IldoYXQgaXMgeW91ciBoZWlnaHQgaW4gY2VudGltZXRlcnM/IiwiYXIiOiLYt9mI2YTZgyDZg9in2YUg2KjYp9mE2LPZhtiq2YrZhdiq2LHYnyJ9LCJ1bml0Ijp7ImVuIjoiY20iLCJhciI6ImNtIn0sInZhbGlkYXRpb24iOnsibWluIjoxLCJtYXgiOjMwMCwic3RlcCI6MC4xfX0seyJpZCI6Ik4wMyIsInNlY3Rpb25JZCI6Im51dHJpdGlvbiIsInR5cGUiOiJzaG9ydFRleHQiLCJyZXF1aXJlZCI6ZmFsc2UsImNoYXJMaW1pdCI6MTUwLCJsYWJlbCI6eyJlbiI6IkhvdyBhY3RpdmUgYXJlIHlvdSBhbmQgaG93IG11Y2ggZG8geW91IG1vdmUgZHVyaW5nIHRoZSBkYXk/IiwiYXIiOiLZhdiz2KrZiNmJINmG2LTYp9i32YMg2YjYrdix2YPYqtmDINiu2YTYp9mEINin2YTZitmI2YUg2LnYp9mF2YQg2KXYstin2YrYnyJ9fSx7ImlkIjoiTjA0Iiwic2VjdGlvbklkIjoibnV0cml0aW9uIiwidHlwZSI6ImJvb2xlYW4iLCJyZXF1aXJlZCI6ZmFsc2UsImxhYmVsIjp7ImVuIjoiQXJlIHlvdSBhbGxlcmdpYyB0byBhbnkgZm9vZHM/IiwiYXIiOiLYudmG2K/ZgyDYrdiz2KfYs9mK2Kkg2YXZhiDYo9mD2YQg2YXYudmK2YbYnyJ9fSx7ImlkIjoiTjA1Iiwic2VjdGlvbklkIjoibnV0cml0aW9uIiwidHlwZSI6ImJvb2xlYW4iLCJyZXF1aXJlZCI6ZmFsc2UsImxhYmVsIjp7ImVuIjoiQXJlIHlvdSBjdXJyZW50bHkgdGFraW5nIGFueSBtZWRpY2F0aW9ucyBvciBzdXBwbGVtZW50cz8iLCJhciI6Itio2KrYs9iq2K7Yr9mFINij2K/ZiNmK2Kkg2KPZiCDZhdmD2YXZhNin2Kog2K3Yp9mE2YrZi9in2J8ifX0seyJpZCI6Ik4wNiIsInNlY3Rpb25JZCI6Im51dHJpdGlvbiIsInR5cGUiOiJsb25nVGV4dCIsInJlcXVpcmVkIjpmYWxzZSwibGFiZWwiOnsiZW4iOiJUZWxsIHVzIHdoYXQgYSB0eXBpY2FsIGRheSBvZiBlYXRpbmcgbG9va3MgbGlrZSBmb3IgeW91LiIsImFyIjoi2KfYrdmD2YrZhNmKINmK2YjZhSDYo9mD2YTZgyDYp9mE2YXYudiq2KfYryDYudio2KfYsdipINi52YYg2KXZitmH2J8ifX0seyJpZCI6Ik4wNyIsInNlY3Rpb25JZCI6Im51dHJpdGlvbiIsInR5cGUiOiJzaG9ydFRleHQiLCJyZXF1aXJlZCI6ZmFsc2UsImNoYXJMaW1pdCI6MTUwLCJsYWJlbCI6eyJlbiI6IkhvdyBtYW55IG1lYWxzIHdvdWxkIHlvdSBsaWtlIHRvIGVhdCBlYWNoIGRheT8iLCJhciI6Itit2KfYqNioINiq2KfZg9mEINmD2KfZhSDZiNis2KjYqSDZgdmKINin2YTZitmI2YXYnyJ9fSx7ImlkIjoiTjA4Iiwic2VjdGlvbklkIjoibnV0cml0aW9uIiwidHlwZSI6InNob3J0VGV4dCIsInJlcXVpcmVkIjpmYWxzZSwiY2hhckxpbWl0IjoxNTAsImxhYmVsIjp7ImVuIjoiV2hhdCBpcyB5b3VyIGZvb2QgYnVkZ2V0IGxpa2U/IiwiYXIiOiLZhdmK2LLYp9mG2YrYqtmDINmE2YTYo9mD2YQg2LnYp9mF2YTYqSDYpdiy2KfZitifIn19LHsiaWQiOiJOMDkiLCJzZWN0aW9uSWQiOiJudXRyaXRpb24iLCJ0eXBlIjoic2hvcnRUZXh0IiwicmVxdWlyZWQiOmZhbHNlLCJjaGFyTGltaXQiOjE1MCwibGFiZWwiOnsiZW4iOiJXaGljaCBmb29kcyBkbyB5b3UgbGlrZSBtb3N0IGFuZCBkaXNsaWtlIG1vc3Q/IiwiYXIiOiLYpdmK2Ycg2KPZg9iq2LEg2KPZg9mEINio2KrYrdio2Ycg2YjYpdmK2Ycg2KPZg9iq2LEg2KPZg9mEINio2KrZg9ix2YfZh9ifIn19LHsiaWQiOiJOMTAiLCJzZWN0aW9uSWQiOiJudXRyaXRpb24iLCJ0eXBlIjoic2hvcnRUZXh0IiwicmVxdWlyZWQiOmZhbHNlLCJjaGFyTGltaXQiOjE1MCwibGFiZWwiOnsiZW4iOiJXb3VsZCB5b3UgcmF0aGVyIHdlaWdoIGZvb2QgYmVmb3JlIG9yIGFmdGVyIGNvb2tpbmc/IiwiYXIiOiLYqtit2Kgg2KrZiNiy2YYg2KPZg9mE2YMg2YLYqNmEINin2YTYt9io2K4g2YjZhNinINio2LnYr9mH2J8ifX0seyJpZCI6Ik4xMSIsInNlY3Rpb25JZCI6Im51dHJpdGlvbiIsInR5cGUiOiJzaG9ydFRleHQiLCJyZXF1aXJlZCI6ZmFsc2UsImNoYXJMaW1pdCI6MTUwLCJsYWJlbCI6eyJlbiI6IkhvdyBodW5ncnkgZG8geW91IGZlZWwsIGZyb20gMCB0byAxMD8iLCJhciI6Itio2KrZgtmK2ZHZhSDYpdit2LPYp9iz2YMg2KjYp9mE2KzZiNi5INmD2KfZhSDZhdmGIDEw2J8ifX0seyJpZCI6Ik4xMiIsInNlY3Rpb25JZCI6Im51dHJpdGlvbiIsInR5cGUiOiJzaG9ydFRleHQiLCJyZXF1aXJlZCI6ZmFsc2UsImNoYXJMaW1pdCI6MTUwLCJsYWJlbCI6eyJlbiI6IkNob29zZSB0aGUgYm9keS1mYXQgcmVmZXJlbmNlIHRoYXQgbW9zdCBjbG9zZWx5IHJlc2VtYmxlcyB5b3VyIGJvZHkgc2hhcGUuIiwiYXIiOiLYp9iu2KrYp9ixINij2YLYsdioINmG2LPYqNipINiv2YfZiNmGINmE2LTZg9mEINis2LPZhdmDIn19XSwiZGVhZGxpbmVEYXlzIjozLCJjb3B5U3RhdHVzIjoiZHJhZnQifQ==', 'base64'), 'UTF8'
  )::jsonb;
begin
  if p_workspace_id is null or p_actor_user_id is null
    or not exists (select 1 from public.workspaces w where w.id=p_workspace_id) then
    raise exception 'workspace required' using errcode='23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('f15-default-onboarding:' || p_workspace_id::text,0)
  );

  select exists(select 1 from app_private.workspace_onboarding_provisioning m
    where m.workspace_id=p_workspace_id) into marker_exists;
  select d.form_id into selected_form from public.workspace_default_onboarding_forms d
    where d.workspace_id=p_workspace_id;
  designation_exists:=found;

  if not marker_exists and designation_exists then
    insert into app_private.workspace_onboarding_provisioning(workspace_id,first_form_id)
      values(p_workspace_id,selected_form) on conflict (workspace_id) do nothing;
    marker_exists:=true;
  end if;

  if marker_exists then
    if not designation_exists then return null; end if;
    if exists(
      select 1 from public.forms f
      join lateral (
        select v.status from public.form_versions v
        where v.workspace_id=f.workspace_id and v.form_id=f.id
        order by v.version_number desc limit 1
      ) current_version on true
      where f.workspace_id=p_workspace_id and f.id=selected_form
        and current_version.status in ('draft','published')
    ) then return selected_form; end if;
    return null;
  end if;

  new_form := pg_catalog.gen_random_uuid();
  insert into public.forms(id,workspace_id,name)
    values(new_form,p_workspace_id,'Your First Step');
  insert into public.form_versions(
    workspace_id,form_id,version_number,terms_policy_version,definition,status
  ) values(
    p_workspace_id,new_form,1,'f15-terms-s14-draft-2026-10-30',starter_definition,'draft'
  );
  insert into app_private.workspace_onboarding_provisioning(workspace_id,first_form_id)
    values(p_workspace_id,new_form);
  insert into public.workspace_default_onboarding_forms(workspace_id,form_id,selected_by)
    values(p_workspace_id,new_form,p_actor_user_id);
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(p_actor_user_id,'form.default_onboarding_provisioned',
      'workspace_default_onboarding_forms',new_form,p_workspace_id,
      jsonb_build_object('form_id',new_form,'version_number',1));
  return new_form;
end
$$;
alter function app_private.ensure_default_onboarding_form(uuid,uuid) owner to postgres;
revoke all on function app_private.ensure_default_onboarding_form(uuid,uuid) from public,anon,authenticated,service_role;

create function app_private.resolve_default_onboarding_configuration(
  p_workspace_id uuid,p_actor_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare default_form uuid;
begin
  default_form:=app_private.ensure_default_onboarding_form(p_workspace_id,p_actor_user_id);
  if default_form is null then
    return jsonb_build_object('status','configuration_error',
      'errorCode','onboarding_default_configuration');
  end if;
  return jsonb_build_object('status','ok','formId',default_form);
end
$$;
alter function app_private.resolve_default_onboarding_configuration(uuid,uuid) owner to postgres;
revoke all on function app_private.resolve_default_onboarding_configuration(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function app_private.set_default_onboarding_form(
  p_workspace_id uuid,p_form_id uuid,p_actor_user_id uuid
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare old_form uuid; latest_status text;
begin
  if p_workspace_id is null or p_form_id is null or p_actor_user_id is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('f15-default-onboarding:' || p_workspace_id::text,0)
  );
  select d.form_id into old_form from public.workspace_default_onboarding_forms d
    where d.workspace_id=p_workspace_id for update;
  select v.status into latest_status from public.form_versions v
    where v.workspace_id=p_workspace_id and v.form_id=p_form_id
    order by v.version_number desc limit 1;
  if not found or latest_status not in ('draft','published') then return false; end if;
  insert into app_private.workspace_onboarding_provisioning(workspace_id,first_form_id)
    values(p_workspace_id,p_form_id) on conflict (workspace_id) do nothing;
  if old_form is not distinct from p_form_id then return true; end if;
  insert into public.workspace_default_onboarding_forms(workspace_id,form_id,selected_by)
    values(p_workspace_id,p_form_id,p_actor_user_id)
  on conflict (workspace_id) do update
    set form_id=excluded.form_id,selected_by=excluded.selected_by,updated_at=clock_timestamp();
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(p_actor_user_id,'form.default_onboarding_selected',
      'workspace_default_onboarding_forms',p_form_id,p_workspace_id,
      jsonb_build_object('previous_form_id',old_form,'form_id',p_form_id));
  return true;
end
$$;
alter function app_private.set_default_onboarding_form(uuid,uuid,uuid) owner to postgres;
revoke all on function app_private.set_default_onboarding_form(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.get_staff_forms(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor_role public.staff_role;
  default_state jsonb;
  default_form uuid;
  form_items jsonb;
begin
  actor_role:=app_private.current_staff_role();
  if auth.uid() is null or p_workspace_id is null or actor_role is null
    or not app_private.role_has_capability(actor_role,'author_forms')
    or not app_private.has_workspace_access(p_workspace_id,'author_forms')
    or not exists(select 1 from public.workspaces w where w.id=p_workspace_id) then
    return null;
  end if;
  default_state:=app_private.resolve_default_onboarding_configuration(p_workspace_id,auth.uid());
  if default_state->>'status'='ok' then default_form:=(default_state->>'formId')::uuid; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,'title',v.definition->'title','sections',v.definition->'sections',
    'questions',v.definition->'questions',
    'deadlineDays',case when f.id=default_form then 3 else
      greatest(1,least(14,coalesce((v.definition->>'deadlineDays')::integer,3))) end,
    'status',v.status,'revision',v.version_number
  ) order by f.created_at,f.id),'[]'::jsonb) into form_items
  from public.forms f
  join lateral (
    select fv.* from public.form_versions fv
    where fv.workspace_id=f.workspace_id and fv.form_id=f.id
    order by fv.version_number desc limit 1
  ) v on true
  where f.workspace_id=p_workspace_id;

  if default_state->>'status'='configuration_error' then
    return jsonb_build_object(
      'status','configuration_error','errorCode','onboarding_default_configuration',
      'defaultOnboardingFormId',null,'forms',form_items
    );
  end if;
  return jsonb_build_object('status','ok','defaultOnboardingFormId',default_form,'forms',form_items);
exception when others then return null;
end
$$;
alter function public.get_staff_forms(uuid) owner to postgres;
revoke all on function public.get_staff_forms(uuid) from public,anon,service_role;
grant execute on function public.get_staff_forms(uuid) to authenticated;
