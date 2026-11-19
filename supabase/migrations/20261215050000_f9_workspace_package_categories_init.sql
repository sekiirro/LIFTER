-- Task: T055. FR: FR-019, FR-028, SC-019.
-- Batch-initialize the four empty S34-PO-6 category package rows per workspace
-- using S35-PO-1 canonical literals ('Egypt'/'International' x 'Year-round'/'Promotional'),
-- with zero offers, zero versions, and zero fabricated commercial values.

alter table public.packages
  add constraint packages_identity_not_empty check (
    workspace_id is not null or code is not null
  );

create function public.initialize_workspace_package_categories(workspace_id uuid)
returns table(package_id uuid, market text, category_type text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null
    or not app_private.is_platform_owner()
    or not app_private.role_has_capability(app_private.current_staff_role(), 'set_package_pricing') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if workspace_id is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspaces w where w.id = initialize_workspace_package_categories.workspace_id)
    or not app_private.has_workspace_access(initialize_workspace_package_categories.workspace_id, 'set_package_pricing') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'packages:init:' || initialize_workspace_package_categories.workspace_id::text, 0));

  insert into public.packages (workspace_id, market, type, created_by)
  select initialize_workspace_package_categories.workspace_id, m.market, t.category_type, auth.uid()
  from (values ('Egypt'), ('International')) as m(market)
  cross join (values ('Year-round'), ('Promotional')) as t(category_type)
  on conflict on constraint packages_workspace_market_type_key do nothing;

  return query
  select p.id as package_id, p.market, p.type as category_type
  from public.packages p
  where p.workspace_id = initialize_workspace_package_categories.workspace_id
  order by p.market, p.type;
end;
$$;

alter function public.initialize_workspace_package_categories(uuid) owner to postgres;
revoke execute on function public.initialize_workspace_package_categories(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.initialize_workspace_package_categories(uuid)
  to authenticated;
