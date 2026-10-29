-- T045: private read-side bindings only. No draft/publish/owner write API.
create table app_private.branding_published_versions (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  id uuid not null default gen_random_uuid(),
  primary key(workspace_id,id)
);
create table app_private.branding_current_publications (
  workspace_id uuid primary key references public.workspaces(id) on delete restrict,
  version_id uuid not null,
  foreign key(workspace_id,version_id) references app_private.branding_published_versions(workspace_id,id) on delete restrict
);
create table app_private.branding_render_handles (
  handle_hash text primary key check(handle_hash ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null,
  link_id uuid not null,
  version_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  foreign key(workspace_id,link_id) references public.registration_links(workspace_id,id) on delete restrict
  -- Deliberately no FK to deletable versions: handles never retain old assets.
);
create index branding_render_handle_link_time on app_private.branding_render_handles(link_id,created_at);
create index branding_render_handle_cleanup_time on app_private.branding_render_handles(created_at);
alter table app_private.branding_published_versions enable row level security;
alter table app_private.branding_published_versions force row level security;
alter table app_private.branding_current_publications enable row level security;
alter table app_private.branding_current_publications force row level security;
alter table app_private.branding_render_handles enable row level security;
alter table app_private.branding_render_handles force row level security;
revoke all on app_private.branding_published_versions,app_private.branding_current_publications,app_private.branding_render_handles from public,anon,authenticated,service_role,branding_proxy,branding_validator;

create or replace function public.registration_link_open(token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare link public.registration_links%rowtype; workspace_name text; v uuid; h text;
  -- Preserve F10's transaction-clock semantics, including its microsecond tests.
  at_time timestamptz:=now(); deadline timestamptz; result jsonb;
begin
  if token is null or token !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' then return '{"status":"invalid"}'::jsonb; end if;
  select * into link from public.registration_links l where l.token_hash=encode(extensions.digest(token,'sha256'),'hex') for update;
  if not found or not app_private.registration_link_is_valid(link.expires_at,link.opened_at,link.consumed_at,at_time) then return '{"status":"invalid"}'::jsonb; end if;
  select w.name into workspace_name from public.workspaces w where w.id=link.workspace_id;
  if not found then return '{"status":"invalid"}'::jsonb; end if;
  if link.opened_at is null then
    update public.registration_links l set opened_at=now() where l.id=link.id and l.opened_at is null;
    link.opened_at:=now();
  end if;
  result:=jsonb_build_object('status','valid','workspace_name',workspace_name);
  select p.version_id into v from app_private.branding_current_publications p where p.workspace_id=link.workspace_id;
  if not found then return result; end if;
  -- ARCHITECT-PROPOSED pending PO: TTL 5m, active 8/link, 30 issues/5m/link.
  -- Per-link row lock serializes issuance. Keep recent expired rows for rate history.
  delete from app_private.branding_render_handles h where h.handle_hash in (
    select x.handle_hash from app_private.branding_render_handles x
    where x.link_id=link.id and x.expires_at<=at_time and x.created_at<=at_time-interval '5 minutes'
    order by x.created_at limit 30);
  if (select count(*) from app_private.branding_render_handles x where x.link_id=link.id and x.expires_at>at_time)>=8
    or (select count(*) from app_private.branding_render_handles x where x.link_id=link.id and x.created_at>at_time-interval '5 minutes')>=30
    then return result; end if;
  deadline:=case when link.opened_at<link.expires_at then greatest(link.expires_at,link.opened_at+interval '30 minutes') else link.expires_at end;
  h:=rtrim(translate(encode(extensions.gen_random_bytes(32),'base64'),'+/','-_'),'=');
  insert into app_private.branding_render_handles(handle_hash,workspace_id,link_id,version_id,created_at,expires_at)
    values(encode(extensions.digest(h,'sha256'),'hex'),link.workspace_id,link.id,v,at_time,least(at_time+interval '5 minutes',deadline));
  return result||jsonb_build_object('render_handle',h);
end $$;
alter function public.registration_link_open(text) owner to postgres;
revoke all on function public.registration_link_open(text) from public,anon,authenticated,service_role,branding_proxy,branding_validator;
grant execute on function public.registration_link_open(text) to anon,authenticated;

-- Operator/cron cleanup for abandoned links; never grants a public mutation path.
create function app_private.branding_render_handles_cleanup(batch integer default 100) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if batch is null or batch<1 or batch>500 then raise exception using errcode='22023',message='Invalid cleanup batch'; end if;
  delete from app_private.branding_render_handles h where h.handle_hash in (
    select x.handle_hash from app_private.branding_render_handles x
    where x.expires_at<=statement_timestamp() and x.created_at<=statement_timestamp()-interval '5 minutes'
    order by x.created_at limit batch for update skip locked);
  get diagnostics n=row_count;
  return n;
end $$;
alter function app_private.branding_render_handles_cleanup(integer) owner to postgres;
revoke all on function app_private.branding_render_handles_cleanup(integer) from public,anon,authenticated,service_role,branding_proxy,branding_validator;
