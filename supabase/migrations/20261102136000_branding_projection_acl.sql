-- Correct the projection wrapper ACL after creation and let its definer call
-- the private F10 base implementation without exposing that base to API roles.
grant branding_definer to postgres;
set role branding_definer;

revoke execute on function public.registration_link_open(text)
  from public,anon,authenticated,service_role,branding_proxy,branding_validator;
grant execute on function public.registration_link_open(text)
  to anon,authenticated;
grant execute on function public.registration_link_open_f10_base(text)
  to branding_definer;

reset role;
revoke branding_definer from postgres;
