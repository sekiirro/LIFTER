-- S70-R61: narrow authenticated entry point with a database-enforced PO check.
create function app_private.purge_retention_for_platform_owner() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  return app_private.purge_f11_retained_data();
end
$$;
alter function app_private.purge_retention_for_platform_owner() owner to postgres;
revoke all on function app_private.purge_retention_for_platform_owner()
  from public,anon,authenticated,service_role;
grant execute on function app_private.purge_retention_for_platform_owner()
  to authenticated;
