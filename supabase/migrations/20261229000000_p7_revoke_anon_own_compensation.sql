-- S70-R126 (#346): anon must not be able to execute the own-compensation RPC.
-- The function body already rejects non-owner callers with not_permitted/42501;
-- the privilege layer must not let anon reach it at all. The authenticated
-- grant and every other grant are deliberately left exactly as they are.
revoke execute on function public.p7_get_own_compensation(uuid, date)
  from public, anon;
